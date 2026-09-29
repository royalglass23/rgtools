import { config } from 'dotenv'
config({ path: '.env.local' })

import { getServiceM8ApiKey } from '../lib/servicem8/client'
import { registerServiceM8Webhook } from '../lib/servicem8/webhook-registration'

const WEBHOOK_SUBSCRIPTION_URL = 'https://api.servicem8.com/webhook_subscriptions/object'
const UNIQUE_ID = 'rgtools-quote-attachment-webhook'
const FIELDS = [
  'edit_date',
  'attachment_name',
  'file_type',
  'attachment_source',
  'related_object_uuid',
  'active',
].join(',')

async function main() {
  const callbackUrl = process.env.SERVICEM8_ATTACHMENT_WEBHOOK_URL?.trim()
  const secret = process.env.SERVICEM8_WEBHOOK_SECRET?.trim()

  if (!callbackUrl) {
    throw new Error('SERVICEM8_ATTACHMENT_WEBHOOK_URL is not configured')
  }

  if (!secret) {
    throw new Error('SERVICEM8_WEBHOOK_SECRET is not configured')
  }

  const url = new URL(callbackUrl)
  // TODO: move to header-based auth before activating — token in URL leaks into Vercel logs
  // url.searchParams.set('token', secret)

  const body = new URLSearchParams({
    object: 'attachment',
    fields: FIELDS,
    callback_url: url.toString(),
    unique_id: UNIQUE_ID,
  })

  await registerServiceM8Webhook({
    endpoint: WEBHOOK_SUBSCRIPTION_URL,
    apiKey: getServiceM8ApiKey(),
    body,
    failureLabel: 'ServiceM8 webhook registration failed',
    successLabel: `Registered ServiceM8 attachment webhook (${UNIQUE_ID})`,
  })
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
