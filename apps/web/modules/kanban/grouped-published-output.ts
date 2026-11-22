import type { PublishedOutput, PublishedRow } from './published-output'
import { shortMaterialDescription } from './material-description'

export type PublishedJobGroup = PublishedRow & { materials: { key: string; label: string; description: string }[] }
const sourceUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const legacyAbbreviation = /^(?:Bal|Shwr|PF|HR|Mir|SB|Part|Lvr|Cnpy|Str|Win|Dr|Fnc|Gls|Scope|Item)(?:\s+\d+(?:\.\d+)?\s*m)?$/i

function publishedMaterials(row: PublishedRow): PublishedJobGroup['materials'] {
  const labels = row.cells[1].split(';').map(label => label.trim()).filter(Boolean)
  // Older job-level snapshots contain only abbreviated lists, with no per-item
  // description. Split only that exact format; never split prose in billing lines.
  if (!row.key.includes(':') && labels.length > 1 && labels.every(label => legacyAbbreviation.test(label))) {
    return labels.map((label, index) => ({
      // React presentation keys only: source/publication identities never change.
      key: `${row.key}:legacy-display-${index}`, label, description: label,
    }))
  }
  return [{ key: row.key, label: abbreviatedMaterial(row.cells[1]), description: row.cells[1] }]
}

// Existing Kanban product vocabulary. Invoice quantity is never a physical length.
export function abbreviatedMaterial(description: string) {
  const rules: [string, RegExp][] = [
    ['Shwr + Mir', /shower glass\s*(?:&|and)\s*mirror/i],
    ['PF', /pool fence|pool fencing|poolfence/i],
    ['Bal', /balustrade|RGGB|infinity|mini.?post|unex|viking|glassvice/i],
    ['Shwr', /shower|RGSH/i], ['HR', /handrail|RGHR/i], ['Mir', /mirror|RGMI/i],
    ['SB', /splashback/i], ['Part', /partition|RGGP/i], ['Lvr', /louvre/i],
    ['Cnpy', /canopy/i], ['Str', /\bstair(?:s|case)?\b/i], ['Win', /window/i],
    ['Dr', /\bdoor\b/i], ['Fnc', /\bfence\b|\bgate\b/i], ['Gls', /\bglass\b|RGG/i],
  ]
  const code = rules.find(([, pattern]) => pattern.test(description))?.[0]
  if (!code) return shortMaterialDescription(description)
  const length = /\b(?:total\s+(?:glass\s+)?(?:length|line)|glass\s+(?:fence\s+)?total|total(?:\s+approx\.)?|length)\s*[:=\-]?\s*(?:approx\.?\s*)?(\d+(?:\.\d+)?)\s*(?:linear\s*met(?:re|er)s?|lineal\s*met(?:re|er)s?|met(?:re|er)s?|lm\b|m\b)/gi
  const lengths = [...description.matchAll(length)].map(match => match[1])
  return code + (lengths.length && new Set(lengths).size === 1 ? ` ${lengths[0]}m` : '')
}

export function groupPublishedProducts(data: PublishedOutput): PublishedJobGroup[] {
  const jobs = new Set(data.jobs.map(job => job.key.toLowerCase()))
  const groups = new Map<string, { rows: PublishedRow[]; materials: PublishedJobGroup['materials'] }>()
  for (const row of data.products) {
    const [parent, line, ...extra] = row.key.split(':')
    // Group only verified source parent identities, never mutable WO/customer labels.
    const key = sourceUuid.test(parent) && sourceUuid.test(line ?? '') && !extra.length && jobs.has(parent.toLowerCase()) ? parent.toLowerCase() : row.key
    const group = groups.get(key) ?? { rows: [], materials: [] }
    group.rows.push(row)
    group.materials.push(...publishedMaterials(row))
    groups.set(key, group)
  }
  return [...groups].map(([key, group]) => ({
    key,
    // Current producer repeats job fields. Retain every distinct supplied value if
    // a future publication differs, rather than silently choosing one item's state.
    cells: group.rows[0].cells.map((_, column) => [...new Set(group.rows.map(row => row.cells[column]))].join('\n')),
    materials: group.materials,
  }))
}

export function filterPublishedGroups(groups: PublishedJobGroup[], query: string) {
  const q = query.trim().toLocaleLowerCase('en-NZ')
  return groups.filter(group => !q || group.cells.some(cell => cell.toLocaleLowerCase('en-NZ').includes(q)) || group.materials.some(item => item.label.toLocaleLowerCase('en-NZ').includes(q)))
}
