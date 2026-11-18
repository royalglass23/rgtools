import { parse, type DefaultTreeAdapterTypes } from 'parse5'

export const PUBLISHED_SHEET_ID = '1-sDKGcNFYjK1IyjOGgnkNo5sVlDuTcCt7pDooWiYfNc'
export const PUBLISHED_BOARD_FILE_ID = '1FK4-IptfpzpMLyY-zFxbTTGJxG3mAP_m'
export const TABLE_A_SOURCE_HEADERS = ['WO', 'Customer', 'Short address', 'Approx install date', 'Within 3 weeks?']
export const TABLE_B_SOURCE_HEADERS = ['WO / client / address', 'Materials (per product)', 'Client waiting for', 'Site ready', 'Glass ready', 'Hardware ready', 'Design Y/N/?', 'PS1 / PS3', 'Bottle strut', 'BC?', 'Minor var?']
export type PublishedRow = { key: string; cells: string[] }
export type PublishedOutput = { jobs: PublishedRow[]; products: PublishedRow[] }
type Node = DefaultTreeAdapterTypes.Node
type Element = DefaultTreeAdapterTypes.Element
const ignored = new Set(['script', 'style', 'template'])
const element = (node: Node): node is Element => 'tagName' in node
const children = (node: Node): Node[] => 'childNodes' in node ? node.childNodes : []
const normalized = (text: string) => text.replace(/\s+/g, ' ').trim()

function text(node: Node) {
  const stack = [node], parts: string[] = []
  while (stack.length) {
    const next = stack.pop()!
    if (element(next) && ignored.has(next.tagName)) continue
    if (next.nodeName === '#text' && 'value' in next) parts.push(next.value.replace(/\s+/g, ' '))
    else if (element(next) && next.tagName === 'br') parts.push('\n')
    else stack.push(...children(next).slice().reverse())
  }
  return parts.join('').split('\n').map(normalized).join('\n').trim()
}

function descendants(node: Node, tag: string, stopAtNestedTables = false) {
  const found: Element[] = [], stack = children(node).slice().reverse()
  while (stack.length) {
    const next = stack.pop()!
    if (element(next) && ignored.has(next.tagName)) continue
    if (element(next) && next.tagName === tag) found.push(next)
    if (stopAtNestedTables && element(next) && next.tagName === 'table') continue
    stack.push(...children(next).slice().reverse())
  }
  return found
}

function tableRows(table: Element) {
  return descendants(table, 'tr', true).map(row => children(row).filter((node): node is Element => element(node) && (node.tagName === 'td' || node.tagName === 'th'))).filter(row => row.length)
}

export function parsePublishedOutput(raw: unknown): PublishedOutput {
  if (typeof raw !== 'string' || raw.length > 4_000_000) throw new Error('Kanban board exceeds its supported size or format.')
  let malformed = false
  const document = parse(raw, { onParseError: error => { if (error.code !== 'missing-doctype') malformed = true } })
  if (malformed) throw new Error('Kanban board HTML is malformed.')
  const tables = descendants(document, 'table').map(tableRows)
  const read = (expected: string[], prefix: string) => {
    const matching = tables.filter(rows => rows[0]?.length === expected.length && rows[0].every((cell, i) => normalized(text(cell)) === expected[i]))
    if (matching.length !== 1) throw new Error('Kanban board headers are missing, changed or ambiguous.')
    const rows = matching[0]
    if (rows.length > 10001) throw new Error('Kanban board exceeds its supported row count.')
    if (rows.some(row => row.length !== expected.length || row.some(cell => cell.attrs.some(attr => ['rowspan', 'colspan'].includes(attr.name) && attr.value !== '1')))) throw new Error('Kanban board contains a malformed table row.')
    return rows.slice(1).map((row, index) => {
      return { key: `${prefix}${index}`, cells: row.map(text) }
    }).filter(row => row.cells.some(value => value !== ''))
  }
  return { jobs: read(TABLE_A_SOURCE_HEADERS, 'a'), products: read(TABLE_B_SOURCE_HEADERS, 'b') }
}

export function filterPublishedOutput(data: PublishedOutput, query: string): PublishedOutput {
  const q = query.trim().toLocaleLowerCase('en-NZ')
  const include = (row: PublishedRow) => !q || row.cells.some(value => value.toLocaleLowerCase('en-NZ').includes(q))
  return { jobs: data.jobs.filter(include), products: data.products.filter(include) }
}
