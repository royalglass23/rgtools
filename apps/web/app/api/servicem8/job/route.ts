import { NextResponse } from 'next/server'
import {
  handleServiceM8JobWebhook,
  isServiceM8JobWebhookAuthorized,
} from '@/modules/leads/servicem8-job-webhook'

const MAX_WEBHOOK_BODY_BYTES = 64 * 1024

export async function POST(request: Request) {
  if (!isServiceM8JobWebhookAuthorized({ url: request.url, headers: request.headers })) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await readJsonBody(request)
  if (body.tooLarge) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  const result = await handleServiceM8JobWebhook({
    url: request.url,
    headers: request.headers,
    body: body.value,
  })

  return NextResponse.json(result.body, { status: result.status })
}

async function readJsonBody(request: Request) {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BODY_BYTES) {
    return { tooLarge: true as const }
  }

  try {
    const text = await request.text()
    if (new TextEncoder().encode(text).byteLength > MAX_WEBHOOK_BODY_BYTES) {
      return { tooLarge: true as const }
    }
    const body: unknown = JSON.parse(text)
    return { tooLarge: false as const, value: body && typeof body === 'object' ? body : {} }
  } catch {
    return { tooLarge: false as const, value: {} }
  }
}
