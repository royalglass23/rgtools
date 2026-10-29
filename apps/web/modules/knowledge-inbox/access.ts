export function knowledgeInboxAccess(user: { id: string; role: 'admin' | 'staff' }, allowlist: string | undefined) {
  const reviewer = user.role === 'admin'
  const respondentIds = new Set((allowlist ?? '').split(',').map((id) => id.trim()).filter(Boolean))
  return { reviewer, respondent: reviewer || respondentIds.has(user.id) }
}

export async function currentKnowledgeInboxAccess(userId: string) {
  const [{ db }, { users }, { eq }] = await Promise.all([
    import('@/lib/db'), import('@rgtools/db/schema'), import('drizzle-orm'),
  ])
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  return user ? knowledgeInboxAccess(user, process.env.RG_BRAIN_INBOX_RESPONDER_USER_IDS)
    : { reviewer: false, respondent: false }
}
