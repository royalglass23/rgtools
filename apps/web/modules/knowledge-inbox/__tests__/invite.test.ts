import { afterEach, describe, expect, it, vi } from 'vitest'
import { createKnowledgeInvite, readKnowledgeInvite } from '../invite'

const id = '123e4567-e89b-42d3-a456-426614174000'
afterEach(() => vi.unstubAllEnvs())

describe('written response invite', () => {
  it('limits a link to its signed questions and 14-day lifetime', () => {
    vi.stubEnv('RG_BRAIN_INBOX_INVITE_SECRET', 's'.repeat(40))
    const now = Date.UTC(2026, 9, 30)
    const token = createKnowledgeInvite([id, id], now)
    expect(readKnowledgeInvite(token, now + 1000)?.ids).toEqual([id])
    expect(readKnowledgeInvite(token, now + 14 * 24 * 60 * 60 * 1000)).toBeNull()
    expect(readKnowledgeInvite(`${token.slice(0, -1)}x`, now + 1000)).toBeNull()
  })

  it('rejects empty or unconfigured invites', () => {
    vi.stubEnv('RG_BRAIN_INBOX_INVITE_SECRET', 's'.repeat(40))
    expect(() => createKnowledgeInvite([])).toThrow()
    expect(readKnowledgeInvite('invalid')).toBeNull()
    vi.stubEnv('RG_BRAIN_INBOX_INVITE_SECRET', '')
    expect(() => createKnowledgeInvite([id])).toThrow()
  })
})
