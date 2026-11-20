import { describe, expect, it } from 'vitest'
import { changesBetween, deliveryHash, parsePublication } from '../publication'
import { publicationFixture as fixture } from './publication-fixture'
const now = new Date('2026-11-20T00:02:00.000Z')
describe('complete direct Work Orders publication', () => {
  it('preserves all cells and rejects incomplete or unstable structure', () => {
    const raw = fixture(); expect(parsePublication(raw, now)).toEqual(raw)
    for (const change of [() => { raw.complete = false }, () => { raw.tables.jobs[0].cells.pop() }, () => { raw.tables.jobs[0].id = '' }]) {
      const original = structuredClone(raw); change(); expect(() => parsePublication(raw, now)).toThrow(); Object.assign(raw, original)
    }
  })
  it('computes real before/after changes by stable identity; reordering is not an edit', () => {
    const first = parsePublication(fixture(), now), next = structuredClone(first)
    next.tables.jobs.push({ id: 'another-job', cells: ['R260002', '', '', '', '?'] })
    expect(changesBetween(first.tables, next.tables)).toMatchObject({ added: [{ table: 'jobs', id: 'another-job' }], changed: [], removed: [] })
    next.tables.jobs[0].cells[1] = 'Updated customer'
    expect(changesBetween(first.tables, next.tables).changed).toEqual([{ table: 'jobs', id: 'job-immutable-uuid', column: 1, label: 'Customer', before: 'Fictional Customer', after: 'Updated customer' }])
    const reordered = structuredClone(next); reordered.tables.jobs.reverse()
    expect(changesBetween(next.tables, reordered.tables)).toEqual({ added: [], removed: [], changed: [] })
    expect(deliveryHash(next)).toBe(deliveryHash(reordered))
    reordered.requestId = '22345678-1234-4123-8123-123456789abc'
    expect(deliveryHash(next)).not.toBe(deliveryHash(reordered))
    expect(changesBetween(next.tables, first.tables).removed).toEqual([{ table: 'jobs', id: 'another-job', cells: ['R260002', '', '', '', '?'] }])
  })
  it('rejects wrong boards, duplicate IDs, unknown keys, cell types and invalid timing', () => {
    const raw = fixture()
    for (const value of [{ ...raw, board: 'scheduling' }, { ...raw, extra: true }, { ...raw, sourceAsOf: raw.generatedAt, generatedAt: raw.sourceAsOf },
      { ...raw, generatedAt: '2026-11-21T00:00:00.000Z' }, { ...raw, tables: { ...raw.tables, jobs: [...raw.tables.jobs, ...raw.tables.jobs] } },
      { ...raw, tables: { ...raw.tables, jobs: [{ id: 'x', cells: [1, '', '', '', ''] }] } }]) expect(() => parsePublication(value, now)).toThrow()
  })
  it('rejects PostgreSQL-incompatible text while preserving normal Unicode and whitespace', () => {
    const raw = fixture()
    for (const cell of ['nul\u0000value', 'unpaired\ud800', '\udc00']) {
      raw.tables.jobs[0].cells[1] = cell; expect(() => parsePublication(raw, now)).toThrow('cells')
    }
    raw.tables.jobs[0].cells[1] = '中文 😀\n\t '
    expect(parsePublication(raw, now).tables.jobs[0].cells[1]).toBe('中文 😀\n\t ')
  })
  it('enforces row, identity and cell bounds without trimming valid source text', () => {
    const raw = fixture()
    raw.tables.jobs[0].id = 'x'.repeat(129); expect(() => parsePublication(raw, now)).toThrow()
    raw.tables.jobs[0].id = 'valid'; raw.tables.jobs[0].cells[0] = 'x'.repeat(16001); expect(() => parsePublication(raw, now)).toThrow()
    raw.tables.jobs = Array.from({ length: 5001 }, (_, i) => ({ id: `stable-${i}`, cells: ['', '', '', '', ''] }))
    expect(() => parsePublication(raw, now)).toThrow('count')
  })
})
