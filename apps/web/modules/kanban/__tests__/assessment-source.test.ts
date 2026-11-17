// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { loadAssessmentContext } from '../assessment-source'
import { generateDueAssessment } from '../assessment-provider'
import { assessmentContextHash } from '../assessment-source'
import type { AssessmentJob } from '../assessment'

const job: AssessmentJob = { id: 'internal', sourceId: 'source', customer: 'Private Customer', address: 'Private Address', description: 'Work order', items: [{ id: 'item', label: 'Shower', description: 'Shower panel', stored: null }] }
describe('complete bounded planning evidence', () => {
  it('rejects a fresh explicit description clear or unsupported value instead of preparing captured stale text', async () => {
    for (const job_description of [null, false, 0, {}]) {
      await expect(loadAssessmentContext(job, async path => new Response(JSON.stringify(path.startsWith('/job/') ? { uuid: 'source', job_description } : [])))).rejects.toThrow(/description|changed/)
    }
    const empty = await loadAssessmentContext({ ...job, description: null }, async path => new Response(JSON.stringify(path.startsWith('/job/') ? { uuid: 'source', job_description: null } : [])))
    expect(empty.sources.some(source => source.kind === 'description')).toBe(false)
    expect(empty.coverage?.description.state).toBe('missing')
  })
  it('does not verify a missing nonempty description and compares actual text with sync trimming', async () => {
    const request = (description: Record<string, unknown>) => async (path: string) => new Response(JSON.stringify(path.startsWith('/job/') ? { uuid: 'source', ...description } : []))
    await expect(loadAssessmentContext(job, request({}))).rejects.toThrow(/description/)
    const unchanged = await loadAssessmentContext(job, request({ job_description: '  Work order\r\n' }))
    expect(unchanged.coverage?.description.state).toBe('complete')
    const empty = await loadAssessmentContext({ ...job, description: '' }, request({}))
    expect(empty.coverage?.description.state).toBe('missing')
  })
  it('reads allowlisted top-level custom fields with honest coverage and never anchors them to fetch/edit time', async () => {
    const request = vi.fn(async (path: string) => new Response(JSON.stringify(path.startsWith('/job/') ? { uuid: 'source', job_description: job.description, active: 1, status: 'Work Order', edit_date: '2026-11-17 10:00:00', customfield_installation_schedule: 'Shower installation tomorrow.', customfield_glass_order: 'Shower glass is ready.', customfield_unrelated_private: 'Never send this field.' } : [])))
    const prepared = await loadAssessmentContext(job, request)
    const custom = prepared.sources.find(source => source.text === 'Shower installation tomorrow.')
    expect(custom).toMatchObject({ kind: 'custom_field', observedAt: null })
    expect(prepared.fetchedAt).toEqual(expect.any(String))
    expect(prepared.coverage?.['customfield_hardware_order'].state).toBe('missing')
    expect(prepared.coverage?.documents.state).toBe('unsupported')
    expect(JSON.stringify(prepared)).not.toContain('Never send this field')
    expect(assessmentContextHash(prepared)).toBe(assessmentContextHash({ ...prepared, fetchedAt: '2099-01-01T00:00:00Z' }))
  })
  it('tokenizes exact configured Unicode names and case-varied IDs without matching a name inside another word', async () => {
    const id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
    const prepared = await loadAssessmentContext({ ...job, installers: [{ token: 'i0', name: '张三', id }, { token: 'i1', name: 'Roy', id: 'roy-id' }] }, async path => new Response(JSON.stringify(path.startsWith('/job/') ? { uuid: 'source', job_description: job.description, customfield_glass_order: `Installer 张三, ID ${id.toUpperCase()}. Royal text; literal installer i0.` } : [])))
    const custom = prepared.sources.find(source => source.kind === 'custom_field')!
    expect(custom.text).not.toContain('张三')
    expect(custom.text.toLowerCase()).not.toContain(id)
    expect(custom.text).toContain('Royal text')
    expect(custom.installerTokens).toEqual(['i0'])
    expect(custom.text).toContain('[unresolved installer reference]')
  })
  it('includes private stable product identity in cache without relying on staff labels', async () => {
    const request = async (path: string) => new Response(path.startsWith('/job/') ? JSON.stringify({ uuid: 'source', job_description: job.description }) : '[]')
    const first = await loadAssessmentContext(job, request)
    const newIdentity = await loadAssessmentContext({ ...job, items: [{ ...job.items[0], id: 'a-different-stable-product' }] }, request)
    const staffLabel = await loadAssessmentContext({ ...job, items: [{ ...job.items[0], label: 'Staff renamed label' }] }, request)
    expect(assessmentContextHash(first)).not.toBe(assessmentContextHash(newIdentity))
    expect(assessmentContextHash(first)).toBe(assessmentContextHash(staffLabel))
  })
  it('masks configured names in natural Chinese assignment text without exposing a known Latin name', async () => {
    const prepared = await loadAssessmentContext({ ...job, installers: [{ token: 'i0', name: '张三', id: 'cjk-id' }, { token: 'i1', name: 'René', id: 'latin-id' }] }, async path => new Response(JSON.stringify(path.startsWith('/job/') ? { uuid: 'source', job_description: job.description, customfield_job_programming: '张三负责安装淋浴房，由René负责复核。' } : [])))
    const source = prepared.sources.find(source => source.kind === 'custom_field')!
    expect(source.text).not.toContain('张三'); expect(source.text).not.toContain('René')
    expect(source.installerTokens).toEqual(['i0', 'i1'])
  })
  it('reads all cursor pages, ignores inactive notes and strips email quotations and contact details', async () => {
    const request = vi.fn(async (url: string) => {
      if (url.startsWith('/job/')) return new Response(JSON.stringify({ uuid: 'source', job_description: job.description }))
      if (url.startsWith('/email')) return new Response(JSON.stringify([{ uuid: 'email', active: 1, related_object_uuid: 'source', subject: 'Installation', message_text: 'Install shower on 20/11/2026. Private Customer Private Address person@example.com\nOn Monday wrote:\nOld booking', sent_date: '2026-11-17 10:00:00' }]))
      return new Response(JSON.stringify(url.endsWith('cursor=-1') ? [{ active: false, note: 'Inactive date' }] : [{ active: 1, note: 'Delivery is confirmed.' }]), { headers: url.endsWith('cursor=-1') ? { 'x-next-cursor': 'next' } : {} })
    })
    const context = await loadAssessmentContext(job, request)
    expect(request).toHaveBeenCalledTimes(4)
    expect(JSON.stringify(context)).not.toMatch(/Inactive date|Private Customer|Private Address|person@example.com|Old booking/)
    expect(context.sources.some(source => source.text === 'Delivery is confirmed.')).toBe(true)
    expect(context.sources.find(source => source.kind === 'email')?.observedAt).toBe('2026-11-17 10:00:00')
  })
  it('fails closed for cursor loops, partial reads, foreign-job evidence and excessive text', async () => {
    await expect(loadAssessmentContext(job, async path => path.startsWith('/job/') ? new Response(JSON.stringify({ uuid: 'source', job_description: job.description })) : new Response('[]', { headers: { 'x-next-cursor': '-1' } }))).rejects.toThrow(/pagination/)
    await expect(loadAssessmentContext(job, async () => new Response('{}', { status: 403 }))).rejects.toThrow(/read failed/)
    await expect(loadAssessmentContext(job, async path => path.startsWith('/job/') ? new Response(JSON.stringify({ uuid: 'source', job_description: job.description })) : new Response(JSON.stringify([{ related_object_uuid: 'other', note: 'Install shower on 20/11/2026' }])))).rejects.toThrow(/another job/)
    await expect(loadAssessmentContext({ ...job, description: 'x'.repeat(12001) }, async path => new Response(path.startsWith('/job/') ? JSON.stringify({ uuid: 'source', job_description: 'x'.repeat(12001) }) : '[]'))).rejects.toThrow(/too long/)
  })
  it('accepts complete larger histories seen in the failed batch and still rejects oversized evidence', async () => {
    const history = (count: number) => async (url: string) => new Response(JSON.stringify(url.startsWith('/job/') ? { uuid: 'source', job_description: job.description } : url.startsWith('/note') ? Array.from({ length: count }, (_, i) => ({ uuid: `synthetic-${i}`, related_object_uuid: 'source', active: 1, note: `Synthetic note ${i}. ` + 'Fictional glass product context. '.repeat(250) })) : []))
    const context = await loadAssessmentContext(job, history(12))
    expect(JSON.stringify(context).length).toBeGreaterThan(60000)
    expect(context.sources.filter(source => source.kind === 'note')).toHaveLength(12)
    await expect(loadAssessmentContext(job, history(24))).rejects.toThrow(/larger-context/)
  })
})
describe('planning provider boundary', () => {
  it('sends strict structured output with source text as data and disables provider storage', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'synthetic-key')
    try {
      const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: '{"results":{"p0":{"status":"unknown"}}}' }] }] })))
      const context = { items: [{ token: 'p0', text: 'Synthetic panel' }], sources: [] }
      expect(await generateDueAssessment(context, request)).toEqual({ results: [{ item: 'p0', status: 'unknown' }] })
      const body = JSON.parse(request.mock.calls[0][1]!.body as string)
      expect(body.store).toBe(false); expect(body.text.format.strict).toBe(true)
      expect(body.instructions).toMatch(/untrusted data/); expect(body.instructions).toMatch(/Never use calendar/)
      expect(JSON.parse(body.input)).toEqual(context)
      await expect(generateDueAssessment(context, async () => new Response('{}', { status: 503 }))).rejects.toThrow(/could not complete/)
    } finally { vi.unstubAllEnvs() }
  })
})
