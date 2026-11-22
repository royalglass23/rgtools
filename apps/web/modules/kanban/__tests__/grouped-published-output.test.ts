import { describe, expect, it } from 'vitest'
import { abbreviatedMaterial, filterPublishedGroups, groupPublishedProducts } from '../grouped-published-output'
import type { PublishedOutput } from '../published-output'

const parent = '11111111-1111-4111-8111-111111111111'
const fixture = (): PublishedOutput => ({ jobs: [{ key: parent, cells: ['TEST409', 'Example', 'Sample site', 'TBC', 'Y'] }], products: [
  { key: `${parent}:22222222-2222-4222-8222-222222222222`, cells: ['TEST409 / Example\nSample site', 'RGGB\nBalustrade total length: 12 m\nInvoice qty: 1', 'Glass', '?', 'N', 'Y', '?', 'PS1', '?', '?', '?'] },
  { key: `${parent}:33333333-3333-4333-8333-333333333333`, cells: ['TEST409 / Example\nSample site', 'Splashback\nFull splashback description', 'Glass', '?', 'N', 'Y', '?', 'PS1', '?', '?', '?'] },
] })
describe('grouped published materials', () => {
  it('separates the original job-level abbreviated material list without rewriting its labels', () => {
    const source = fixture()
    source.products = [{ key: parent, cells: ['TEST409 / Example\nSample site', 'Bal 12m; SB; HR', 'Glass', '?', 'N', 'Y', '?', 'PS1', '?', '?', '?'] }]
    const groups = groupPublishedProducts(source)
    expect(groups).toHaveLength(1)
    expect(groups[0].materials.map(item => item.label)).toEqual(['Bal 12m', 'SB', 'HR'])
    expect(groups[0].materials.map(item => item.description)).toEqual(['Bal 12m', 'SB', 'HR'])
    expect(new Set(groups[0].materials.map(item => item.key)).size).toBe(3)
    expect(source.products[0].cells[1]).toBe('Bal 12m; SB; HR')
  })
  it('groups by immutable parent, keeps individual source IDs/descriptions, and does not mutate the publication', () => {
    const source = fixture(), before = JSON.stringify(source), groups = groupPublishedProducts(source)
    expect(groups).toHaveLength(1)
    expect(groups[0].materials.map(item => item.label)).toEqual(['Bal 12m', 'SB'])
    expect(groups[0].materials.map(item => item.key)).toEqual(source.products.map(row => row.key))
    expect(groups[0].materials.map(item => item.description)).toEqual(source.products.map(row => row.cells[1]))
    expect(groups[0].cells).toHaveLength(11)
    expect(groups[0].cells.slice(2)).toEqual(source.products[0].cells.slice(2))
    expect(JSON.stringify(source)).toBe(before)
  })
  it('preserves older list labels and duplicates, and never splits semicolons in full billing descriptions', () => {
    const source = fixture()
    source.products = [{ key: parent, cells: ['TEST409', 'Shwr; Mir; item; Mir', ...source.products[0].cells.slice(2)] }]
    expect(groupPublishedProducts(source)[0].materials.map(item => item.label)).toEqual(['Shwr', 'Mir', 'item', 'Mir'])
    source.products[0].cells[1] = 'Custom material; full installation instructions'
    expect(groupPublishedProducts(source)[0].materials).toHaveLength(1)
    source.products[0].key = `${parent}:22222222-2222-4222-8222-222222222222`
    source.products[0].cells[1] = 'Bal 12m; SB; HR'
    expect(groupPublishedProducts(source)[0].materials).toHaveLength(1)
  })
  it('searches full descriptions and abbreviations while retaining all materials in the matching job', () => {
    const groups = groupPublishedProducts(fixture())
    expect(filterPublishedGroups(groups, 'full splashback')[0].materials).toHaveLength(2)
    expect(filterPublishedGroups(groups, 'bal 12m')).toHaveLength(1)
    expect(filterPublishedGroups(groups, 'missing')).toHaveLength(0)
  })
  it('keeps duplicates separate, preserves conflicting supplied job fields, and never groups by display text', () => {
    const source = fixture()
    source.products[1].cells[1] = source.products[0].cells[1]
    source.products[1].cells[2] = 'Site'
    source.products.push({ key: 'legacy-id', cells: [...source.products[0].cells] })
    const groups = groupPublishedProducts(source)
    expect(groups).toHaveLength(2)
    expect(groups[0].materials).toHaveLength(2)
    expect(groups[0].cells[2]).toBe('Glass\nSite')
    source.jobs = []
    expect(groupPublishedProducts(source)).toHaveLength(3)
  })
  it('uses existing abbreviations without interpreting invoice qty as metres or inventing unknown product codes', () => {
    expect(abbreviatedMaterial('Handrail\nInvoice qty: 5')).toBe('HR')
    expect(abbreviatedMaterial('Shower glass & mirror')).toBe('Shwr + Mir')
    expect(abbreviatedMaterial('Mirror')).toBe('Mir')
    expect(abbreviatedMaterial('Unclassified custom product')).toBe('Unclassified custom product')
    expect(abbreviatedMaterial('Balustrade length: 12m length: 4m')).toBe('Bal')
  })
})
