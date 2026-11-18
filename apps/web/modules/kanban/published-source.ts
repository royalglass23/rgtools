import { PUBLISHED_BOARD_FILE_ID, PUBLISHED_SHEET_ID, parsePublishedOutput } from './published-output'
import { getKeylessGoogleAccessToken, keylessSourceConfigured } from './keyless-google-auth'

type Environment = Record<string, string | undefined>
type Fetch = typeof fetch
const SOURCE_ERROR = 'Kanban output could not load. The published board connection can be checked by an administrator.'

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
    const token = await getKeylessGoogleAccessToken(env)
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${PUBLISHED_SHEET_ID}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`
    const response = await request(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000), redirect: 'error', cache: 'no-store' })
    const data = await boundedJson(response) as { values?: unknown }
    if (data.values === undefined) return []
    if (!Array.isArray(data.values) || data.values.length > 10000 || data.values.some(row => !Array.isArray(row))) throw new Error(SOURCE_ERROR)
    return data.values
  } catch { throw new Error(SOURCE_ERROR) }
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
