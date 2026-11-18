// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { boundedJson, boundedText } from '../published-source'
import { publishedBoardHtml } from './published-board-fixture'

const identity = vi.hoisted(() => vi.fn())
vi.mock('@vercel/oidc', () => ({ getVercelOidcToken: identity }))
const env = { KANBAN_GOOGLE_PROJECT_NUMBER: '123456789', KANBAN_GOOGLE_WORKLOAD_IDENTITY_POOL_ID: 'fictional-pool', KANBAN_GOOGLE_WORKLOAD_IDENTITY_PROVIDER_ID: 'vercel' }
const range = "'B3 Work Orders'!A:M"
const sts = 'https://sts.googleapis.com/v1/token'
const boardUrl = 'https://www.googleapis.com/drive/v3/files/1FK4-IptfpzpMLyY-zFxbTTGJxG3mAP_m?alt=media&supportsAllDrives=true'
const impersonation = 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/rgtools-kanban-reader%40rg-tools-498600.iam.gserviceaccount.com:generateAccessToken'

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); identity.mockResolvedValue('fictional-oidc') })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

function transport() {
  let exchanges = 0
  return vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
    const url = String(input)
    if (url === sts) { exchanges++; return Response.json({ access_token: 'fictional-sts', expires_in: 3600, token_type: 'Bearer', issued_token_type: 'urn:ietf:params:oauth:token-type:access_token' }) }
    if (url === impersonation) return Response.json({ accessToken: `fictional-sheets-${exchanges}`, expireTime: new Date(Date.now() + 3600_000).toISOString() })
    if (url === boardUrl) return new Response(publishedBoardHtml)
    if (url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/')) return Response.json({ values: [['TBC', '?']] })
    throw new Error(`Unexpected synthetic request: ${url} ${options?.method}`)
  })
}

describe('keyless published source boundary', () => {
  it('accepts the non-secret federation settings without a service-account key', async () => {
    const { publishedSourceConfigured } = await import('../published-source')
    expect(publishedSourceConfigured(env)).toBe(true)
    expect(publishedSourceConfigured({ ...env, KANBAN_GOOGLE_PROJECT_NUMBER: 'rg-tools-498600' })).toBe(false)
    expect(publishedSourceConfigured({ ...env, KANBAN_GOOGLE_WORKLOAD_IDENTITY_POOL_ID: '../foreign' })).toBe(false)
  })
  it('does not contact a service when WIF configuration is missing, even with old JSON present', async () => {
    const { readPublishedRange } = await import('../published-source')
    const request = vi.fn(); vi.stubGlobal('fetch', request)
    await expect(readPublishedRange(range, { KANBAN_GOOGLE_SERVICE_ACCOUNT_JSON: 'old private key must not be used' }, request)).rejects.toThrow('not configured')
    expect(request).not.toHaveBeenCalled(); expect(identity).not.toHaveBeenCalled()
  })
  it('uses real SDK STS/impersonation with fixed destinations, bounded transport and exactly the two readonly data scopes', async () => {
    const request = transport(); vi.stubGlobal('fetch', request)
    const { readPublishedRange } = await import('../published-source')
    expect(await readPublishedRange(range, env, request)).toEqual([['TBC', '?']])
    expect(request).toHaveBeenCalledTimes(3)
    const [stsUrl, stsOptions] = request.mock.calls[0]
    expect(String(stsUrl)).toBe(sts)
    const body = new URLSearchParams(stsOptions?.body as string)
    expect(body.get('audience')).toBe('//iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/fictional-pool/providers/vercel')
    expect(body.get('subject_token')).toBe('fictional-oidc')
    expect(body.get('subject_token_type')).toBe('urn:ietf:params:oauth:token-type:jwt')
    // The intermediary token authorizes IAMCredentials; final data scopes are readonly.
    expect(body.get('scope')).toBe('https://www.googleapis.com/auth/cloud-platform')
    const [iamUrl, iamOptions] = request.mock.calls[1]
    expect(String(iamUrl)).toBe(impersonation)
    expect(JSON.parse(iamOptions?.body as string).scope).toEqual(['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly'])
    for (const [, options] of request.mock.calls.slice(0, 2)) {
      expect(options).toMatchObject({ redirect: 'error', retry: false, timeout: 10000, retryConfig: { retry: 0, noResponseRetries: 0 } })
      expect(options?.signal).toBeInstanceOf(AbortSignal)
    }
    expect(String(request.mock.calls[2][0])).toContain('valueRenderOption=FORMATTED_VALUE')
    expect(request.mock.calls[2][1]).toMatchObject({ cache: 'no-store', redirect: 'error', headers: { Authorization: 'Bearer fictional-sheets-1' } })
    expect(identity).toHaveBeenCalledWith()
  })
  it('reads displayed findings only from the fixed Drive HTML file, not the manual Sheet', async () => {
    const request = transport(); vi.stubGlobal('fetch', request)
    const { readPublishedOutput } = await import('../published-source')
    const data = await readPublishedOutput(env, request)
    expect(data.products[0].cells[2]).toBe('Confirm installation date')
    expect(data.products[0].cells[7]).toBe('PS1 issued\nPS3 pending')
    expect(request.mock.calls.map(([url]) => String(url))).toEqual([sts, impersonation, boardUrl])
    expect(request.mock.calls[2][1]).toMatchObject({ cache: 'no-store', redirect: 'error', headers: { Authorization: 'Bearer fictional-sheets-1' } })
    request.mockResolvedValue(new Response('private Drive error', { status: 403 }))
    await expect(readPublishedOutput(env, request)).rejects.toThrow('published board connection')
  })
  it('lets the real SDK reuse expiring Google access then obtains a fresh OIDC token on refresh/config change', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-19T00:00:00Z'))
    identity.mockResolvedValueOnce('fictional-oidc-one').mockResolvedValueOnce('fictional-oidc-two').mockResolvedValueOnce('fictional-oidc-three')
    const request = transport(); vi.stubGlobal('fetch', request)
    const { readPublishedRange } = await import('../published-source')
    await readPublishedRange(range, env, request)
    vi.setSystemTime(new Date('2026-11-19T00:30:00Z'))
    await readPublishedRange(range, env, request)
    expect(identity).toHaveBeenCalledTimes(1)
    vi.setSystemTime(new Date('2026-11-19T00:56:00Z'))
    await readPublishedRange(range, env, request)
    expect(identity).toHaveBeenCalledTimes(2)
    await readPublishedRange(range, { ...env, KANBAN_GOOGLE_WORKLOAD_IDENTITY_PROVIDER_ID: 'other-provider' }, request)
    expect(identity).toHaveBeenCalledTimes(3)
    const exchanges = request.mock.calls.filter(([url]) => String(url) === sts)
    expect(exchanges.map(([, opts]) => new URLSearchParams(opts?.body as string).get('subject_token'))).toEqual(['fictional-oidc-one', 'fictional-oidc-two', 'fictional-oidc-three'])
    expect(new URLSearchParams(exchanges[2][1]?.body as string).get('audience')).toContain('/providers/other-provider')
  })
  it('performs identity-only preflight without a Google exchange and does not cache the token', async () => {
    const request = transport(); vi.stubGlobal('fetch', request)
    const { verifyPublishedSourceIdentity } = await import('../keyless-google-auth')
    await verifyPublishedSourceIdentity(env); await verifyPublishedSourceIdentity(env)
    expect(identity).toHaveBeenCalledTimes(2); expect(request).not.toHaveBeenCalled()
  })
  it('sanitizes identity/STS/impersonation errors without JSON/ADC fallback or exposing tokens', async () => {
    const request = transport(); vi.stubGlobal('fetch', request)
    identity.mockRejectedValue(new Error('private OIDC token or unreadable file details'))
    const { readPublishedRange } = await import('../published-source')
    await expect(readPublishedRange(range, env, request)).rejects.toThrow('could not load')
    expect(request).not.toHaveBeenCalled()
    identity.mockResolvedValue('fictional-oidc')
    request.mockImplementation(async () => { throw new Error('private SDK token/response') })
    const error = await readPublishedRange(range, env, request).catch(value => value)
    expect(error.message).toBe('Kanban output could not load. The published board connection can be checked by an administrator.')
    expect(request).toHaveBeenCalledOnce()
    request.mockReset().mockResolvedValueOnce(Response.json({ access_token: 'fictional-sts', expires_in: 3600, token_type: 'Bearer' })).mockRejectedValueOnce(new Error('private impersonation response'))
    await expect(readPublishedRange(range, env, request)).rejects.toThrow('could not load')
    expect(request).toHaveBeenCalledTimes(2)
  })
  it('rejects oversized/non-success Sheets responses rather than silently truncating output', async () => {
    await expect(boundedJson(new Response('123456'), 3)).rejects.toThrow('could not load')
    await expect(boundedJson(new Response('private error', { status: 403 }))).rejects.toThrow('could not load')
    await expect(boundedText(new Response('123456'), 3)).rejects.toThrow('could not load')
  })
})
