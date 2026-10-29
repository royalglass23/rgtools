import { describe, expect, it } from 'vitest'
import { knowledgeInboxAccess } from '../access'

describe('knowledge inbox access', () => {
  it('allows only configured staff responders and admins', () => {
    const allowlist = 'roxy-id, other-id'
    expect(knowledgeInboxAccess({ id: 'roxy-id', role: 'staff' }, allowlist)).toEqual({ respondent: true, reviewer: false })
    expect(knowledgeInboxAccess({ id: 'unlisted-id', role: 'staff' }, allowlist)).toEqual({ respondent: false, reviewer: false })
    expect(knowledgeInboxAccess({ id: 'admin-id', role: 'admin' }, allowlist)).toEqual({ respondent: true, reviewer: true })
  })

  it('does not grant staff access when the allowlist is absent', () => {
    expect(knowledgeInboxAccess({ id: 'roxy-id', role: 'staff' }, undefined).respondent).toBe(false)
  })
})
