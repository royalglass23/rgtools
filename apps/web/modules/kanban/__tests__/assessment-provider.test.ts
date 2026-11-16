// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { generateDueAssessment } from '../assessment-provider'
import { validateAssessmentOutput } from '../assessment'
const context = { items: [{ token: 'p0', text: 'Synthetic panel1' }, { token: 'p1', text: 'Synthetic panel2' }], sources: [
  { token: 's0', kind: 'note' as const, item: null, observedAt: '2026-11-17 10:00:00', reference: null, text: 'Install synthetic panel1 on 20/11/2026.' },
  { token: 's1', kind: 'note' as const, item: null, observedAt: '2026-11-17 10:00:00', reference: null, text: 'Install synthetic panel2 on 20/11/2026.' },
] }
const result = (i: number) => ({ status: 'dated', date: '2026-11-20', kind: 'installation', scope: 'product', productCue: `synthetic panel${i + 1}`, reason: 'Synthetic date evidence.', evidence: [{ source: `s${i}`, quote: context.sources[i].text }] })
describe('product identity in the structured assessment response', () => {
  it('requires a result under each exact product key and restores IDs locally for validation', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'synthetic-only')
    try {
      const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ output_text: JSON.stringify({ results: { p0: result(0), p1: result(1) } }) })))
      const raw = await generateDueAssessment(context, request)
      expect(validateAssessmentOutput(raw, context).map(r => r.status)).toEqual(['dated', 'dated'])
      const body = JSON.parse(request.mock.calls[0][1]!.body as string), schema = body.text.format.schema
      expect(schema.properties.results.required).toEqual(['p0', 'p1'])
      expect(schema.properties.results.additionalProperties).toBe(false)
      expect(schema.$defs.assessment.properties.evidence.items.properties.source.enum).toEqual(['s0', 's1'])
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
