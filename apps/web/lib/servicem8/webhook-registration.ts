import { redactWebhookCredential } from './webhook-security'

export async function registerServiceM8Webhook(input: {
  endpoint: string
  apiKey: string
  body: URLSearchParams
  failureLabel: string
  successLabel: string
  credentialToRedact?: string
}): Promise<void> {
  const response = await fetch(input.endpoint, {
    method: 'POST',
    headers: {
      'X-API-Key': input.apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: input.body,
  })
  const text = await response.text()
  const safeText = input.credentialToRedact
    ? redactWebhookCredential(text, input.credentialToRedact)
    : text

  if (!response.ok) {
    throw new Error(`${input.failureLabel} with HTTP ${response.status}: ${safeText}`)
  }

  console.log(`${input.successLabel}: ${safeText}`)
}
