import { describe, it, expect } from 'vitest'

function matchesMiddleware(pathname: string): boolean {
  // Mirrors the Next.js matcher.
  return !/^\/(login|api\/auth|api\/lead-intake\/calculator-submit|api\/pricing|api\/servicem8\/attachment|api\/servicem8\/job|q\/|_next\/static|_next\/image|favicon\.ico)/.test(pathname)
}

describe('middleware route matching', () => {
  it('skips login page', () => {
    expect(matchesMiddleware('/login')).toBe(false)
  })

  it('skips NextAuth API routes', () => {
    expect(matchesMiddleware('/api/auth/callback/credentials')).toBe(false)
  })

  it('skips public calculator submit route', () => {
    expect(matchesMiddleware('/api/lead-intake/calculator-submit')).toBe(false)
  })

  it('skips public pricing route', () => {
    expect(matchesMiddleware('/api/pricing')).toBe(false)
  })

  it('skips the authenticated-by-token ServiceM8 job webhook route', () => {
    expect(matchesMiddleware('/api/servicem8/job')).toBe(false)
  })

  it('protects retired calculator import route', () => {
    expect(matchesMiddleware('/api/lead-intake/calculator-import')).toBe(true)
  })

  it('skips client quote pages', () => {
    expect(matchesMiddleware('/q/some-uuid-token')).toBe(false)
  })

  it('protects dashboard root', () => {
    expect(matchesMiddleware('/quote-tracker')).toBe(true)
  })

  it('protects nested dashboard routes', () => {
    expect(matchesMiddleware('/quote-tracker/abc-123')).toBe(true)
  })

  it('protects root path', () => {
    expect(matchesMiddleware('/')).toBe(true)
  })

  it('protects admin root', () => {
    expect(matchesMiddleware('/admin')).toBe(true)
  })

  it('protects nested admin routes', () => {
    expect(matchesMiddleware('/admin/users')).toBe(true)
  })
})
