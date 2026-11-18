import { describe, expect, it } from 'vitest'
import { filterPublishedOutput, parsePublishedOutput } from '../published-output'
import { publishedBoardHtml } from './published-board-fixture'

describe('published generated Kanban board', () => {
  it('displays the generated HTML automatic findings rather than blank manual Sheet cells', () => {
    const data = parsePublishedOutput(publishedBoardHtml)
    expect(data.jobs.map(row => row.cells)).toEqual([['R260001', 'Fictional & Glass', 'Example Road', 'TBC', 'N'], ['R260002', 'Another Client', 'Sample Lane', '20/11/2026', 'Y']])
    expect(data.products).toHaveLength(1)
    expect(data.products[0].cells).toEqual(['R260001 / Fictional & Glass\nExample Road', 'Shower & balustrade\nSecond item', 'Confirm installation date', '', '?', 'N', 'Y', 'PS1 issued\nPS3 pending', 'N', 'pending', '?'])
  })
  it('retains source row granularity and membership regardless of the date/flag', () => {
    const data = parsePublishedOutput(publishedBoardHtml)
    expect(data.jobs[0].cells[4]).toBe('N')
    expect(data.products[0].cells[0]).toContain('R260001')
    expect(data.products[0].cells[1]).toContain('Shower & balustrade')
    expect(data.products).toHaveLength(1)
  })
  it('normalizes only header whitespace and preserves explicit cell line boundaries', () => {
    const html = publishedBoardHtml.replace('<th>Client waiting for</th>', '<th>  Client\n waiting for  </th>')
    expect(parsePublishedOutput(html).products[0].cells[7]).toBe('PS1 issued\nPS3 pending')
  })
  it('rejects missing/changed headers and ambiguous required tables', () => {
    expect(() => parsePublishedOutput(publishedBoardHtml.replace('WO / client / address', 'Unexpected header'))).toThrow('headers')
    const tableB = publishedBoardHtml.slice(publishedBoardHtml.lastIndexOf('<table>'), publishedBoardHtml.lastIndexOf('</table>') + 8)
    expect(() => parsePublishedOutput(publishedBoardHtml.replace('</body>', `${tableB}</body>`))).toThrow('ambiguous')
  })
  it('rejects malformed row width and spanned cells instead of partial/misaligned display', () => {
    expect(() => parsePublishedOutput(publishedBoardHtml.replace('<td>pending</td><td>?</td>', '<td>pending</td>'))).toThrow('malformed table row')
    expect(() => parsePublishedOutput(publishedBoardHtml.replace('<td>TBC</td>', '<td colspan="2">TBC</td>'))).toThrow('malformed table row')
  })
  it('extracts only text, decoding entities without executing or returning scripts/styles', () => {
    const data = parsePublishedOutput(publishedBoardHtml.replace('Confirm installation date', '&lt;img src=x onerror=alert(1)&gt;<script>doNotRun()</script><style>bad{}</style>'))
    expect(data.products[0].cells[2]).toBe('<img src=x onerror=alert(1)>')
    expect(JSON.stringify(data)).not.toContain('neverExecuteKanbanHtml')
    expect(JSON.stringify(data)).not.toContain('doNotRun')
  })
  it('searches all supplied fields without inferred filtering', () => {
    const data = parsePublishedOutput(publishedBoardHtml)
    expect(filterPublishedOutput(data, ' issued ').products).toHaveLength(1)
    expect(filterPublishedOutput(data, 'TBC').jobs).toHaveLength(1)
    expect(filterPublishedOutput(data, 'fictional & glass').products).toHaveLength(1)
  })
  it('rejects wrong format and oversized content explicitly', () => {
    expect(() => parsePublishedOutput([['old Sheet format']])).toThrow('format')
    expect(() => parsePublishedOutput('x'.repeat(4_000_001))).toThrow('size')
  })
})
