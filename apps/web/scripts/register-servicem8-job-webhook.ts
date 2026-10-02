import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
config({ path: fileURLToPath(new URL('../../../.env.local', import.meta.url)) })

import { getServiceM8FullApiKey } from '../lib/servicem8/client'
import { registerServiceM8Webhook } from '../lib/servicem8/webhook-registration'

const WEBHOOK_SUBSCRIPTION_URL = 'https://api.servicem8.com/webhook_subscriptions/event'
const UNIQUE_ID = 'rgtools-lead-job-conversion-webhook'

async function main() {
  const callbackUrl = process.env.SERVICEM8_JOB_WEBHOOK_URL?.trim()
  const secret = process.env.SERVICEM8_JOB_WEBHOOK_SECRET?.trim()

  if (!callbackUrl) {
    throw new Error('SERVICEM8_JOB_WEBHOOK_URL is not configured')
  }
  if (!secret) {
    throw new Error('SERVICEM8_JOB_WEBHOOK_SECRET is not configured')
  }

  const url = new URL(callbackUrl)
  url.searchParams.set('token', secret)

  const body = new URLSearchParams({
    event: 'job.created',
    callback_url: url.toString(),
    unique_id: UNIQUE_ID,
  })
  await registerServiceM8Webhook({
    endpoint: WEBHOOK_SUBSCRIPTION_URL,
    apiKey: getServiceM8FullApiKey(),
    body,
    failureLabel: 'ServiceM8 job webhook registration failed',
    successLabel: `Registered ServiceM8 job webhook (${UNIQUE_ID})`,
    credentialToRedact: secret,
  })
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
