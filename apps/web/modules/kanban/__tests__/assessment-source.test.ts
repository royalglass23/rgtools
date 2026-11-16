// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { loadAssessmentContext } from '../assessment-source'
import { generateDueAssessment } from '../assessment-provider'
import type { AssessmentJob } from '../assessment'

const job: AssessmentJob = { id: 'internal', sourceId: 'source', customer: 'Private Customer', address: 'Private Address', description: 'Work order', items: [{ id: 'item', label: 'Shower', description: 'Shower panel', stored: null }] }
describe('complete bounded planning evidence', () => {
  it('reads all cursor pages, ignores inactive notes and strips email quotations and contact details', async () => {
    const request = vi.fn(async (url: string) => {
      if (url.startsWith('/email')) return new Response(JSON.stringify([{ uuid: 'email', active: 1, related_object_uuid: 'source', subject: 'Installation', message_text: 'Install shower on 20/11/2026. Private Customer Private Address person@example.com\nOn Monday wrote:\nOld booking', sent_date: '2026-11-17 10:00:00' }]))
      return new Response(JSON.stringify(url.endsWith('cursor=-1') ? [{ active: false, note: 'Inactive date' }] : [{ active: 1, note: 'Delivery is confirmed.' }]), { headers: url.endsWith('cursor=-1') ? { 'x-next-cursor': 'next' } : {} })
    })
    const context = await loadAssessmentContext(job, request)
    expect(request).toHaveBeenCalledTimes(3)
    expect(JSON.stringify(context)).not.toMatch(/Inactive date|Private Customer|Private Address|person@example.com|Old booking/)
    expect(context.sources.some(source => source.text === 'Delivery is confirmed.')).toBe(true)
    expect(context.sources.find(source => source.kind === 'email')?.observedAt).toBe('2026-11-17 10:00:00')
  })
  it('fails closed for cursor loops, partial reads, foreign-job evidence and excessive text', async () => {
    await expect(loadAssessmentContext(job, async () => new Response('[]', { headers: { 'x-next-cursor': '-1' } }))).rejects.toThrow(/pagination/)
    await expect(loadAssessmentContext(job, async () => new Response('{}', { status: 403 }))).rejects.toThrow(/read failed/)
    await expect(loadAssessmentContext(job, async () => new Response(JSON.stringify([{ related_object_uuid: 'other', note: 'Install shower on 20/11/2026' }])))).rejects.toThrow(/another job/)
    await expect(loadAssessmentContext({ ...job, description: 'x'.repeat(12001) }, async () => new Response('[]'))).rejects.toThrow(/too long/)
  })
})
describe('planning provider boundary', () => {
  it('sends strict structured output with source text as data and disables provider storage', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'synthetic-key')
    try {
      const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: '{"results":[]}' }] }] })))
      expect(await generateDueAssessment({ items: [], sources: [] }, request)).toEqual({ results: [] })
      const body = JSON.parse(request.mock.calls[0][1]!.body as string)
      expect(body.store).toBe(false); expect(body.text.format.strict).toBe(true)
      expect(body.instructions).toMatch(/untrusted data/); expect(body.instructions).toMatch(/Never use calendar/)
      expect(JSON.parse(body.input)).toEqual({ items: [], sources: [] })
      await expect(generateDueAssessment({ items: [], sources: [] }, async () => new Response('{}', { status: 503 }))).rejects.toThrow(/could not complete/)
    } finally { vi.unstubAllEnvs() }
  })
})
