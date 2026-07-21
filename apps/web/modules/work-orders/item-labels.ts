type OpenAIResponsesPayload = {
  output_text?: unknown
  output?: Array<{
    content?: Array<{
      type?: unknown
      text?: unknown
    }>
  }>
}

export type WorkOrderItemLabelGenerator = (originalDescription: string) => Promise<string>

const LABEL_INSTRUCTIONS = `Create exactly one concise production label for one Royal Glass work-order item.
Keep the product scope, relevant dimensions, and finish when present.
Return only the label as one plain-text line. Do not use bullets, numbering, quotes, or commentary.`

export async function generateWorkOrderItemLabel(
  originalDescription: string,
  request: typeof fetch = fetch,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')

  const response = await request(openAIResponsesUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? 'gpt-5.4-mini',
      instructions: LABEL_INSTRUCTIONS,
      input: originalDescription,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`OpenAI Work Order label generation failed with HTTP ${response.status}${body ? `: ${body}` : ''}`)
  }

  const payload = await response.json() as OpenAIResponsesPayload
  return validateWorkOrderItemLabel(extractResponseText(payload))
}

function openAIResponsesUrl() {
  const configuredUrl = process.env.OPENAI_RESPONSES_URL?.trim()
  if (!configuredUrl) return 'https://api.openai.com/v1/responses'

  const url = new URL(configuredUrl)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('OPENAI_RESPONSES_URL must use HTTP or HTTPS.')
  }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('OPENAI_RESPONSES_URL must use HTTPS in production.')
  }

  return configuredUrl
}

export function validateWorkOrderItemLabel(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('OpenAI Work Order label response did not include text.')
  }

  const label = value.trim()
  if (!label) throw new Error('OpenAI Work Order label response was empty.')
  if (/\r|\n/.test(label)) {
    throw new Error('OpenAI Work Order label response must contain exactly one label.')
  }
  if (label.length > 160) {
    throw new Error('OpenAI Work Order label response must be 160 characters or fewer.')
  }
  return label
}

function extractResponseText(payload: OpenAIResponsesPayload): unknown {
  if (typeof payload.output_text === 'string') return payload.output_text

  for (const output of payload.output ?? []) {
    for (const content of output.content ?? []) {
      if (content.type === 'output_text' && typeof content.text === 'string') return content.text
    }
  }

  return null
}
