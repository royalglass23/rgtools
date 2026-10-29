import { createHmac, timingSafeEqual } from 'node:crypto'

type Invite = { v: 1; ids: string[]; exp: number }
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function secret(): string {
  const value = process.env.RG_BRAIN_INBOX_INVITE_SECRET
  if (!value || value.length < 32) throw new Error('Knowledge inbox invite secret is not configured')
  return value
}

function signature(encoded: string): Buffer {
  return createHmac('sha256', secret()).update(encoded).digest()
}

export function createKnowledgeInvite(ids: string[], now = Date.now()): string {
  const unique = [...new Set(ids)]
  if (!unique.length || unique.length > 20 || unique.some((id) => !idPattern.test(id))) throw new Error('Invalid invite questions')
  const payload: Invite = { v: 1, ids: unique, exp: now + 14 * 24 * 60 * 60 * 1000 }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${signature(encoded).toString('base64url')}`
}

export function readKnowledgeInvite(token: string, now = Date.now()): Invite | null {
  if (!token || token.length > 1500) return null
  const parts = token.split('.')
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0])) return null
  let actual: Buffer
  try {
    actual = Buffer.from(parts[1], 'base64url')
    if (actual.toString('base64url') !== parts[1]) return null
  } catch { return null }
  let expected: Buffer
  try { expected = signature(parts[0]) } catch { return null }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
  try {
    const value = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Invite
    if (value.v !== 1 || !Number.isSafeInteger(value.exp) || value.exp <= now || value.exp > now + 14 * 24 * 60 * 60 * 1000 ||
      !Array.isArray(value.ids) || !value.ids.length || value.ids.length > 20 || value.ids.some((id) => typeof id !== 'string' || !idPattern.test(id))) return null
    return value
  } catch { return null }
}
