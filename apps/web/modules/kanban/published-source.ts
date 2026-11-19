import { PUBLISHED_BOARD_FILE_ID, PUBLISHED_SHEET_ID, parsePublishedOutput } from './published-output'
import { getKeylessGoogleAccessToken, keylessSourceConfigured } from './keyless-google-auth'

type Environment = Record<string, string | undefined>
type Fetch = typeof fetch
const SOURCE_ERROR = 'Kanban output could not load. The published board connection can be checked by an administrator.'
const RECEIPT_READ_MESSAGES = {
  authorization: 'Google authorization for the completion check could not be verified. The bot may still be running.',
  access: 'Google denied access to the completion Sheet. Ask an administrator to check its sharing and Google Sheets API access.',
  range: 'The completion Sheet range could not be read. Ask an administrator to check the configured tab and range.',
  unavailable: 'Kanban completion status is temporarily unavailable. The bot may still be running.',
  response: 'The completion Sheet returned an unreadable response. The bot may still be running.',
} as const

class ReceiptReadError extends Error {
  constructor(readonly reason: keyof typeof RECEIPT_READ_MESSAGES) { super(SOURCE_ERROR) }
}

export function getReceiptReadMessage(error: unknown): string | undefined {
  return error instanceof ReceiptReadError ? RECEIPT_READ_MESSAGES[error.reason] : undefined
}

export async function boundedText(response: Response, maxBytes = 4_000_000): Promise<string> {
  if (!response.ok || !response.body) throw new Error(SOURCE_ERROR)
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new Error(SOURCE_ERROR)
      chunks.push(value)
    }
  } finally { await reader.cancel() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(bytes)
}

export async function boundedJson(response: Response, maxBytes = 4_000_000): Promise<unknown> {
  return JSON.parse(await boundedText(response, maxBytes))
}

export async function readPublishedRange(range: string, env: Environment = process.env, request: Fetch = fetch): Promise<unknown[][]> {
  // Only callers in this server module/action choose a range; no browser URL/ID is accepted.
  if (!keylessSourceConfigured(env)) throw new Error('Kanban keyless Google access is not configured. Ask an administrator to set up the read-only connection.')
  try {
    let token: string
    try { token = await getKeylessGoogleAccessToken(env) } catch { throw new ReceiptReadError('authorization') }
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${PUBLISHED_SHEET_ID}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`
    const response = await request(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000), redirect: 'error', cache: 'no-store' })
    if (!response.ok) {
      if (response.body) await response.body.cancel().catch(() => {})
      throw new ReceiptReadError(response.status === 400 ? 'range' : response.status === 401 ? 'authorization' : [403, 404].includes(response.status) ? 'access' : 'unavailable')
    }
    let data: { values?: unknown }
    try { data = await boundedJson(response) as { values?: unknown } } catch { throw new ReceiptReadError('response') }
    if (data.values === undefined) return []
    if (!Array.isArray(data.values) || data.values.length > 10000 || data.values.some(row => !Array.isArray(row))) throw new ReceiptReadError('response')
    return data.values
  } catch (error) { throw error instanceof ReceiptReadError ? error : new ReceiptReadError('unavailable') }
}

export async function readPublishedOutput(env: Environment = process.env, request: Fetch = fetch) {
  if (!keylessSourceConfigured(env)) throw new Error('Kanban keyless Google access is not configured. Ask an administrator to set up the read-only connection.')
  try {
    const token = await getKeylessGoogleAccessToken(env)
    const response = await request(`https://www.googleapis.com/drive/v3/files/${PUBLISHED_BOARD_FILE_ID}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000), redirect: 'error', cache: 'no-store' })
    return parsePublishedOutput(await boundedText(response))
  } catch { throw new Error(SOURCE_ERROR) }
}

export function publishedSourceConfigured(env: Environment = process.env) {
  return keylessSourceConfigured(env)
}
