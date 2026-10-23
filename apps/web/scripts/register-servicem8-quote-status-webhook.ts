import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
config({ path: fileURLToPath(new URL('../../../.env.local', import.meta.url)), quiet: true })

import { getServiceM8FullApiKey } from '../lib/servicem8/client'
import { registerServiceM8Webhook } from '../lib/servicem8/webhook-registration'

async function main() {
  const callbackUrl = process.env.SERVICEM8_JOB_WEBHOOK_URL?.trim()
  const secret = process.env.SERVICEM8_JOB_WEBHOOK_SECRET?.trim()
  if (!callbackUrl || !secret) throw new Error('ServiceM8 job webhook URL and secret must be configured')
  const url = new URL(callbackUrl)
  if (url.protocol !== 'https:') throw new Error('ServiceM8 callback must use HTTPS')
  url.searchParams.set('token', secret)
  await registerServiceM8Webhook({
    endpoint: 'https://api.servicem8.com/webhook_subscriptions/event',
    apiKey: getServiceM8FullApiKey(),
    body: new URLSearchParams({ event: 'job.status_changed', callback_url: url.toString(), unique_id: 'rgtools-quote-status-webhook' }),
    failureLabel: 'ServiceM8 quote status webhook registration failed',
    successLabel: 'Registered ServiceM8 quote status webhook',
    credentialToRedact: secret,
  })
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
