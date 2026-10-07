import {
  createServiceM8RequestFromEnv,
  type ServiceM8FetchRequest,
} from '@/lib/servicem8/client'
import { isServiceM8WebhookAuthorized } from '@/lib/servicem8/webhook-security'
import { fetchLeadFromServiceM8 } from './servicem8-fetch'

type WebhookEntry = {
  uuid?: unknown
}

type WebhookBody = {
  object?: unknown
  entry?: unknown
  type?: unknown
  createdAt?: unknown
  uuid?: unknown
  job_uuid?: unknown
  jobUuid?: unknown
  jobUUID?: unknown
  data?: unknown
  job?: unknown
  payload?: unknown
  resource_url?: unknown
}

type WebhookDependencies = {
  secret: string | undefined
  request: ServiceM8FetchRequest
  reconcileLead: (leadId: string) => Promise<unknown>
}

export type ServiceM8JobWebhookResult = {
  status: number
  body: { error: string } | { ok: true; processed: number }
}

export async function handleServiceM8JobWebhook(input: {
  url: string
  headers: Headers
  body: WebhookBody
  deps?: Partial<WebhookDependencies>
}): Promise<ServiceM8JobWebhookResult> {
  const deps = resolveDependencies(input.deps ?? {})
  const url = new URL(input.url)
  if (!isServiceM8JobWebhookAuthorized({ url, headers: input.headers, secret: deps.secret })) {
    return { status: 401, body: { error: 'Unauthorized' } }
  }

  const jobUuids = readJobUuids(input.body)
  if (input.body.type === 'job.created' && jobUuids.length === 0) {
    return { status: 422, body: { error: 'ServiceM8 job UUID is missing' } }
  }
  if (jobUuids.length > 10) {
    return { status: 413, body: { error: 'Too many webhook entries' } }
  }
  let processed = 0
  for (const jobUuid of jobUuids) {
    const jobLookup = await fetchJob(jobUuid, deps.request)
    if (!jobLookup.ok) {
      return { status: 503, body: { error: 'ServiceM8 job lookup failed' } }
    }
    if (!isCalculatorJob(jobLookup.job)) continue

    const leadId = await findConvertedLeadId(jobUuid, deps.request)
    if (!leadId) {
      return { status: 503, body: { error: 'Calculator job is not ready for reconciliation' } }
    }

    let result: unknown
    try {
      result = await deps.reconcileLead(leadId)
    } catch {
      return { status: 503, body: { error: 'Calculator job reconciliation failed' } }
    }
    if (!isSuccessfulReconciliation(result)) {
      return { status: 503, body: { error: 'Calculator job reconciliation failed' } }
    }
    processed += 1
  }

  return { status: 200, body: { ok: true, processed } }
}

function resolveDependencies(overrides: Partial<WebhookDependencies>): WebhookDependencies {
  return {
    secret: overrides.secret ?? process.env.SERVICEM8_JOB_WEBHOOK_SECRET,
    request: overrides.request ?? createServiceM8RequestFromEnv(),
    reconcileLead: overrides.reconcileLead ?? ((leadId) => fetchLeadFromServiceM8(leadId, null)),
  }
}

export function isServiceM8JobWebhookAuthorized(input: {
  url: string | URL
  headers: Headers
  secret?: string
}): boolean {
  const secret = input.secret ?? process.env.SERVICEM8_JOB_WEBHOOK_SECRET
  return isServiceM8WebhookAuthorized({ ...input, secret, allowQueryToken: true })
}

function readJobUuids(body: WebhookBody): string[] {
  if (body.object === 'job' && Array.isArray(body.entry)) {
    return [...new Set(body.entry
      .filter((entry): entry is WebhookEntry => Boolean(entry && typeof entry === 'object'))
      .map((entry) => entry.uuid)
      .filter((uuid): uuid is string => typeof uuid === 'string' && uuid.length > 0))]
  }

  if (body.type !== 'job.created') return []

  const data = objectValue(body.data)
  const payload = objectValue(body.payload)
  const containers = [
    body,
    data,
    objectValue(data?.job),
    objectValue(body.job),
    payload,
    objectValue(payload?.job),
  ]
  const candidates = containers.flatMap((container) => container
    ? [container.uuid, container.job_uuid, container.jobUuid, container.jobUUID]
    : [])

  if (typeof body.resource_url === 'string') {
    candidates.push(jobUuidFromResourceUrl(body.resource_url))
  }

  return [...new Set(candidates.filter(isUuid))]
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function jobUuidFromResourceUrl(value: string): string | undefined {
  return /\/job\/([0-9a-f-]{36})(?:\.json)?(?:[?#]|$)/i.exec(value)?.[1]
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

async function fetchJob(
  jobUuid: string,
  request: ServiceM8FetchRequest,
): Promise<{ ok: true; job: unknown } | { ok: false }> {
  const response = await request(`/job/${encodeURIComponent(jobUuid)}.json`)
  if (!response.ok) return { ok: false }
  return { ok: true, job: await response.json() }
}

function isCalculatorJob(job: unknown): boolean {
  if (!job || typeof job !== 'object') return false
  const description = (job as { job_description?: unknown }).job_description
  return typeof description === 'string' && /\bRGTools Lead\b/i.test(description)
}

function isSuccessfulReconciliation(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false
  const value = result as { ok?: unknown; customFieldError?: unknown }
  return value.ok === true && !value.customFieldError
}

async function findConvertedLeadId(
  jobUuid: string,
  request: ServiceM8FetchRequest,
): Promise<string | null> {
  const response = await request('/inboxmessage.json?limit=500&offset=0&filter=all')
  if (!response.ok) return null

  const payload = await response.json()
  const messages = payload && typeof payload === 'object' && 'messages' in payload
    ? (payload as { messages?: unknown }).messages
    : undefined
  if (!Array.isArray(messages)) return null

  const message = messages.find((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false
    return (candidate as { converted_to_job_uuid?: unknown }).converted_to_job_uuid === jobUuid
  }) as {
    message_text?: unknown
    message_html?: unknown
    subject?: unknown
  } | undefined
  if (!message) return null

  for (const value of [message.message_text, message.message_html, message.subject]) {
    if (typeof value !== 'string') continue
    const match = /RGTools Lead:?\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(value)
    if (match?.[1]) return match[1]
  }

  return null
}
