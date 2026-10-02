import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export const proxy = auth((req) => {
  if (
    req.nextUrl.pathname === '/api/lead-intake/calculator-submit' ||
    req.nextUrl.pathname === '/api/pricing' ||
    req.nextUrl.pathname === '/api/servicem8/attachment' ||
    req.nextUrl.pathname === '/api/servicem8/job'
  ) {
    return NextResponse.next()
  }

  if (!req.auth) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }
})

export const config = {
  matcher: ['/((?!login|api/auth|api/lead-intake/calculator-submit|api/pricing|api/servicem8/attachment|api/servicem8/job|q/|_next/static|_next/image|favicon.ico).*)'],
}
