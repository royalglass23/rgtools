import { timingSafeEqual } from 'node:crypto'

export function isServiceM8WebhookAuthorized(input: {
  url: string | URL
  headers: Headers
  secret: string | undefined
  allowQueryToken?: boolean
}): boolean {
  const secret = input.secret
  if (!secret) return false
  const url = typeof input.url === 'string' ? new URL(input.url) : input.url
  const candidates = [
    input.headers.get('x-servicem8-webhook-secret'),
    input.headers.get('authorization')?.replace(/^Bearer\s+/i, ''),
  ]
  if (input.allowQueryToken) candidates.push(url.searchParams.get('token'))
  return candidates.some((candidate) => safeSecretEquals(candidate, secret))
}

export function redactWebhookCredential(value: string, credential: string): string {
  const formEncodedCredential = new URLSearchParams({ credential })
    .toString()
    .slice('credential='.length)
  return [...new Set([credential, encodeURIComponent(credential), formEncodedCredential])]
    .reduce((redacted, candidate) => redacted.replaceAll(candidate, '[REDACTED]'), value)
}

function safeSecretEquals(candidate: string | null | undefined, secret: string): boolean {
  if (!candidate) return false
  const candidateBytes = Buffer.from(candidate)
  const secretBytes = Buffer.from(secret)
  return candidateBytes.length === secretBytes.length && timingSafeEqual(candidateBytes, secretBytes)
}
