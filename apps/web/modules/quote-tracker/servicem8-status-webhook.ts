import { isServiceM8WebhookAuthorized } from '@/lib/servicem8/webhook-security'
import { syncTrackedQuoteOutcome } from './servicem8-outcome'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function handleServiceM8QuoteStatusWebhook(input: {
  url: string
  headers: Headers
  body: Record<string, unknown>
}, deps: {
  secret?: string
  sync?: typeof syncTrackedQuoteOutcome
} = {}) {
  if (!isServiceM8WebhookAuthorized({ ...input, secret: deps.secret ?? process.env.SERVICEM8_JOB_WEBHOOK_SECRET, allowQueryToken: true })) {
    return { status: 401, body: { error: 'Unauthorized' } }
  }
  if (input.body.type !== 'job.status_changed') return { status: 422, body: { error: 'Unsupported status event' } }
  const data = input.body.data && typeof input.body.data === 'object' ? input.body.data as Record<string, unknown> : {}
  const jobUuid = data.uuid ?? data.job_uuid ?? input.body.job_uuid ?? input.body.uuid
  if (typeof jobUuid !== 'string' || !UUID.test(jobUuid)) return { status: 422, body: { error: 'ServiceM8 job UUID is missing or invalid' } }
  try {
    const result = await (deps.sync ?? syncTrackedQuoteOutcome)(jobUuid.toLowerCase())
    return { status: 200, body: { ok: true, processed: result.status === 'untracked' ? 0 : 1 } }
  } catch {
    return { status: 503, body: { error: 'Quote outcome sync failed; retry delivery' } }
  }
}
