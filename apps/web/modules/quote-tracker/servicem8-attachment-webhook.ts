import { createServiceM8RequestFromEnv, getAttachmentRecord, type ServiceM8FetchRequest } from '@/lib/servicem8/client'
import { isServiceM8WebhookAuthorized } from '@/lib/servicem8/webhook-security'

import { createTrackedQuote, type CreateTrackedQuoteResult } from './create-tracked-quote'
import { resolveOwnerUserIdFromServiceM8Staff } from './owner-attribution'
import { sendReadyLinkEmail, type ReadyLinkEmailInput, type ReadyLinkEmailResult } from './ready-link-email'
import {
  getExpirySettings,
  getNotificationSettings,
  type ExpirySettings,
  type NotificationSettings,
} from './settings-query'

export type ServiceM8AttachmentWebhookDeps = {
  secret: string | undefined
  request: ServiceM8FetchRequest
  createTrackedQuote: (opts: {
    jobUuid: string
    ownerUserId: string | null
    expiry?: ExpirySettings['defaultPreset']
    refresh?: boolean
  }) => Promise<CreateTrackedQuoteResult>
  getExpirySettings: () => Promise<ExpirySettings>
  resolveOwnerUserId: (staffUuid: string | null | undefined) => Promise<string | null>
  getNotificationSettings: () => Promise<NotificationSettings>
  sendReadyLinkEmail: (input: ReadyLinkEmailInput) => Promise<ReadyLinkEmailResult>
}

type WebhookEntry = {
  uuid?: unknown
}

type WebhookBody = {
  auth?: unknown
  entry?: unknown
}

export type AttachmentWebhookResult = {
  status: number
  body: unknown
}

export async function handleServiceM8AttachmentWebhook(input: {
  url: string
  headers: Headers
  body: WebhookBody
  deps?: Partial<ServiceM8AttachmentWebhookDeps>
}): Promise<AttachmentWebhookResult> {
  const deps = resolveDeps(input.deps)
  const url = new URL(input.url)
  if (!isServiceM8WebhookAuthorized({ url, headers: input.headers, secret: deps.secret })) {
    return { status: 401, body: { error: 'Unauthorized' } }
  }

  if (url.searchParams.get('mode') === 'subscribe') {
    return { status: 200, body: url.searchParams.get('challenge') ?? '' }
  }

  let minted = 0
  let refreshed = 0
  let ignored = 0
  const ownerUserId = await deps.resolveOwnerUserId(readStaffUuid(input.body))
  for (const entry of readEntries(input.body)) {
    const attachmentUuid = typeof entry.uuid === 'string' ? entry.uuid : null
    if (!attachmentUuid) {
      ignored += 1
      continue
    }

    const attachment = await getAttachmentRecord(attachmentUuid, deps.request)
    const jobUuid = attachment?.related_object_uuid ?? attachment?.object_uuid ?? null
    const isQuotePdf =
      attachment?.attachment_source === 'QUOTE' &&
      String(attachment.active) === '1' &&
      String(attachment.file_type ?? '').toLowerCase().includes('pdf') &&
      Boolean(jobUuid)

    if (!isQuotePdf || !jobUuid) {
      ignored += 1
      continue
    }

    const result = await deps.createTrackedQuote({
      jobUuid,
      ownerUserId,
      expiry: (await deps.getExpirySettings()).defaultPreset,
      refresh: false,
    })

    if (result.ok) {
      minted += 1
      await sendReadyEmailIfEnabled(deps, result)
    } else if (result.reason === 'quote_exists') {
      const refreshResult = await deps.createTrackedQuote({
        jobUuid,
        ownerUserId,
        refresh: true,
      })
      if (refreshResult.ok) {
        refreshed += 1
      } else {
        ignored += 1
      }
    } else {
      ignored += 1
    }
  }

  return { status: 200, body: { ok: true, minted, refreshed, ignored } }
}

function resolveDeps(
  overrides: Partial<ServiceM8AttachmentWebhookDeps> | undefined,
): ServiceM8AttachmentWebhookDeps {
  return {
    secret: overrides?.secret ?? process.env.SERVICEM8_WEBHOOK_SECRET,
    request: overrides?.request ?? createServiceM8RequestFromEnv(),
    createTrackedQuote: overrides?.createTrackedQuote ?? createTrackedQuote,
    getExpirySettings: overrides?.getExpirySettings ?? getExpirySettings,
    resolveOwnerUserId: overrides?.resolveOwnerUserId ?? resolveOwnerUserIdFromServiceM8Staff,
    getNotificationSettings: overrides?.getNotificationSettings ?? getNotificationSettings,
    sendReadyLinkEmail: overrides?.sendReadyLinkEmail ?? sendReadyLinkEmail,
  }
}

function readEntries(body: WebhookBody): WebhookEntry[] {
  return Array.isArray(body.entry) ? body.entry.filter(isEntry) : []
}

function isEntry(value: unknown): value is WebhookEntry {
  return Boolean(value && typeof value === 'object')
}

function readStaffUuid(body: WebhookBody): string | null {
  if (!body.auth || typeof body.auth !== 'object') return null
  const staffUuid = (body.auth as { staffUUID?: unknown }).staffUUID
  return typeof staffUuid === 'string' ? staffUuid : null
}

async function sendReadyEmailIfEnabled(
  deps: ServiceM8AttachmentWebhookDeps,
  quote: Extract<CreateTrackedQuoteResult, { ok: true }>,
) {
  const notifications = await deps.getNotificationSettings()
  if (!notifications.enabled) return

  await deps.sendReadyLinkEmail({
    to: notifications.to,
    quote: {
      link: quote.link,
      clientName: quote.clientName,
      jobAddress: quote.jobAddress,
      quoteValue: quote.quoteValue,
    },
  })
}
