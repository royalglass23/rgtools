import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { leadEmailLog, leads } from '@rgtools/db/schema-leads'

export type CalculatorLeadIdempotencyResult = {
  leadId: string
}

export async function findCalculatorLeadBySubmissionRef(
  submissionRef: string,
): Promise<CalculatorLeadIdempotencyResult | null> {
  if (!submissionRef.trim()) return null

  const [row] = await db
    .select({ leadId: leads.id })
    .from(leads)
    .where(and(
      eq(leads.channel, 'calculator'),
      eq(leads.externalRef, submissionRef),
    ))
    .limit(1)

  return row ?? null
}

export async function hasCompletedCustomerEstimateEmail(
  leadId: string,
  recipient: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: leadEmailLog.id })
    .from(leadEmailLog)
    .where(and(
      eq(leadEmailLog.leadId, leadId),
      eq(leadEmailLog.recipient, recipient),
      eq(leadEmailLog.status, 'sent'),
    ))
    .limit(1)

  return Boolean(row)
}
