import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ next: vi.fn(), redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: (handler: unknown) => handler }))
vi.mock('next/server', () => ({ NextResponse: { next: mocks.next, redirect: mocks.redirect } }))
import { proxy } from '../proxy'
const call = proxy as unknown as (request: { nextUrl: URL; url: string; auth: null }) => unknown
beforeEach(() => { vi.resetAllMocks() })
describe('exact Kanban publisher authentication boundary', () => {
  it('lets only the exact receiver reach its own Bearer authentication', () => {
    const url = 'https://rgtools.example/api/kanban/publish'
    call({ nextUrl: new URL(url), url, auth: null }); expect(mocks.next).toHaveBeenCalledOnce(); expect(mocks.redirect).not.toHaveBeenCalled()
    for (const suffix of ['/other', '-other']) { const path = `${url}${suffix}`; call({ nextUrl: new URL(path), url: path, auth: null }) }
    expect(mocks.next).toHaveBeenCalledOnce(); expect(mocks.redirect).toHaveBeenCalledTimes(2)
  })
})
