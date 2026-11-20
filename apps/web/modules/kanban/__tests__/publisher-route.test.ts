import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ publish: vi.fn() }))
vi.mock('../publication-store', () => ({ publishWorkOrders: mocks.publish }))
import { POST } from '@/app/api/kanban/publish/route'
import { publicationFixture } from './publication-fixture'
const secret = 'fictional-publisher-secret-at-least-32-characters'
function request(body = '{}', authorization = `Bearer ${secret}`) { return new Request('https://rgtools.example/api/kanban/publish', { method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body }) }
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('KANBAN_PUBLISH_SECRET', secret); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-20T00:02:00.000Z')) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
describe('authenticated direct publisher receiver', () => {
  it('fails closed before parsing or persistence and never exposes configuration', async () => {
    expect((await POST(request('private garbage', 'Bearer wrong'))).status).toBe(401)
    vi.stubEnv('KANBAN_PUBLISH_SECRET', '')
    const result = await POST(request()); expect(result.status).toBe(503)
    expect(await result.text()).not.toContain(secret); expect(mocks.publish).not.toHaveBeenCalled()
    vi.stubEnv('KANBAN_PUBLISH_SECRET', secret); vi.stubEnv('KANBAN_BOT_WEBHOOK_SECRET', secret)
    expect((await POST(request())).status).toBe(503); expect(mocks.publish).not.toHaveBeenCalled()
  })
  it('enforces content type and streamed byte bound before persistence', async () => {
    const wrongType = request(); wrongType.headers.set('content-type', 'text/plain')
    expect((await POST(wrongType)).status).toBe(415)
    expect((await POST(request('x'.repeat(4 * 1024 * 1024 + 1)))).status).toBe(413)
    expect((await POST(request('{'))).status).toBe(400)
    expect(mocks.publish).not.toHaveBeenCalled()
  })
  it('returns bounded publication acknowledgements; storage failures are safe', async () => {
    mocks.publish.mockResolvedValue({ outcome: 'published', publicationId: '12345678-1234-4123-8123-123456789abc', duplicate: false })
    const response = await POST(request(JSON.stringify(publicationFixture()))); expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    mocks.publish.mockRejectedValue(new Error('private connection credential'))
    const failure = await POST(request(JSON.stringify(publicationFixture()))); expect(failure.status).toBe(503)
    expect(await failure.text()).not.toContain('private')
  })
  it('rejects a different board and PostgreSQL-invalid text before storage', async () => {
    const value = publicationFixture(); value.board = 'site-visits'
    expect((await POST(request(JSON.stringify(value)))).status).toBe(400)
    value.board = 'work-orders'; value.tables.jobs[0].cells[0] = '\u0000'
    expect((await POST(request(JSON.stringify(value)))).status).toBe(400); expect(mocks.publish).not.toHaveBeenCalled()
  })
})
