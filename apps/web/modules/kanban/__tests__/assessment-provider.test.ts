// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { generateDueAssessment } from '../assessment-provider'
import { validateAssessmentOutput } from '../assessment'
import { FIELD_NAMES, unknownFields } from './operational-fixtures'
const context = { items: [{ token: 'p0', text: 'Synthetic panel1' }, { token: 'p1', text: 'Synthetic panel2' }], sources: [
  { token: 's0', kind: 'note' as const, item: null, observedAt: '2026-11-17 10:00:00', reference: null, text: 'Install synthetic panel1 on 20/11/2026.' },
  { token: 's1', kind: 'note' as const, item: null, observedAt: '2026-11-17 10:00:00', reference: null, text: 'Install synthetic panel2 on 20/11/2026.' },
] }
const result = (i: number) => ({ status: 'dated', date: '2026-11-20', kind: 'installation', scope: 'product', productCue: `synthetic panel${i + 1}`, reason: 'Synthetic date evidence.', evidence: [{ source: `s${i}`, quote: context.sources[i].text }] })
describe('product identity in the structured assessment response', () => {
  it('accepts a full 64-product envelope and keeps maximum-context schema enums within provider limits', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'synthetic-only')
    try {
      const items = Array.from({ length: 64 }, (_, i) => ({ token: `p${i}`, text: `Synthetic panel ${i}` }))
      const sources = Array.from({ length: 900 }, (_, i) => ({ token: `s${i}`, kind: 'note' as const, item: null, observedAt: null, text: 'Synthetic selected text.' }))
      const installers = Array.from({ length: 256 }, (_, i) => ({ token: `i${i}` }))
      const results = Object.fromEntries(items.map(({ token }) => [token, { status: 'unknown', date: null, kind: 'unknown', scope: 'unclear', productCue: null, reason: 'No date.', evidence: [], fields: unknownFields() }]))
      const text = JSON.stringify({ results }); expect(text.length).toBeGreaterThan(100000)
      const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ output_text: text })))
      expect((await generateDueAssessment({ items, sources, installers }, request)).results).toHaveLength(64)
      const schema = JSON.parse(request.mock.calls[0][1]!.body as string).text.format.schema
      const countEnums = (node: unknown): number => !node || typeof node !== 'object' ? 0 : Object.entries(node).reduce((total, [key, value]) => total + (key === 'enum' && Array.isArray(value) ? value.length : Array.isArray(value) ? value.reduce((sum, entry) => sum + countEnums(entry), 0) : countEnums(value)), 0)
      expect(countEnums(schema)).toBeLessThanOrEqual(1000)
    } finally { vi.unstubAllEnvs() }
  })
  it('requires every operational field and exposes only opaque installer identity to the provider', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'synthetic-only')
    try {
      const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ output_text: JSON.stringify({ results: { p0: result(0) } }) })))
      await generateDueAssessment({ items: [context.items[0]], sources: [{ ...context.sources[0], text: 'Installer Synthetic Person is assigned.' }], installers: [{ token: 'i0', name: 'Synthetic Person', id: 'private-installer-id' }] }, request)
      const body = JSON.parse(request.mock.calls[0][1]!.body as string)
      expect(body.text.format.schema.$defs.assessment.properties.fields.required).toEqual([...FIELD_NAMES])
      expect(body.store).toBe(false)
      expect(body.input).not.toContain('Synthetic Person')
      expect(body.input).not.toContain('private-installer-id')
      expect(JSON.parse(body.input).installers).toEqual([{ token: 'i0' }])
    } finally { vi.unstubAllEnvs() }
  })
  it('requires a result under each exact product key and restores IDs locally for validation', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'synthetic-only')
    try {
      const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ output_text: JSON.stringify({ results: { p0: result(0), p1: result(1) } }) })))
      const raw = await generateDueAssessment(context, request)
      expect(validateAssessmentOutput(raw, context).map(r => r.status)).toEqual(['dated', 'dated'])
      const body = JSON.parse(request.mock.calls[0][1]!.body as string), schema = body.text.format.schema
      expect(schema.properties.results.required).toEqual(['p0', 'p1'])
      expect(schema.properties.results.additionalProperties).toBe(false)
      expect(schema.$defs.assessment.properties.evidence).toEqual({ $ref: '#/$defs/evidence' })
      expect(schema.$defs.evidence.items.properties.source.pattern).toBe('^s[0-9]+$')
      expect(schema.$defs.assessment.properties).not.toHaveProperty('item')
    } finally { vi.unstubAllEnvs() }
  })
  it('rejects incomplete or renamed product keys rather than attaching a label to another product', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'synthetic-only')
    try {
      for (const results of [{ p0: result(0) }, { 'Synthetic panel1': result(0), p1: result(1) }]) {
        await expect(generateDueAssessment(context, async () => new Response(JSON.stringify({ output_text: JSON.stringify({ results }) })))).rejects.toThrow(/product/)
      }
    } finally { vi.unstubAllEnvs() }
  })
})
