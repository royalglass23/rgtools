// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { dashboardSourceRequest, verifyDashboardVendor } from '../source'
describe('GET-only dashboard source boundary', () => {
  it('rejects writes and arbitrary endpoints before invoking the transport', () => {
    const transport = vi.fn(); const request = dashboardSourceRequest(transport)
    expect(() => request('/job.json', { method: 'POST', body: '{}' })).toThrow()
    expect(() => request('/diary.json')).toThrow()
    expect(() => request('https://example.com/job.json')).toThrow()
    expect(transport).not.toHaveBeenCalled()
  })
  it('preserves cursor filters and explicitly uses GET', async () => {
    const transport = vi.fn().mockResolvedValue({ ok: true }); const request = dashboardSourceRequest(transport)
    await request('/job.json?cursor=-1&$filter=active%20eq%201')
    expect(transport).toHaveBeenCalledWith('/job.json?cursor=-1&$filter=active%20eq%201', { method: 'GET' })
  })
  it('fails closed for a wrong or unknown vendor', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ name: 'Different business' }] })
    await expect(verifyDashboardVendor(request)).rejects.toThrow('not Royal Glass')
    request.mockResolvedValue({ ok: true, json: async () => [{ name: 'Royal Glass Limited' }] })
    await expect(verifyDashboardVendor(request)).resolves.toBeUndefined()
  })
})
