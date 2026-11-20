import { timingSafeEqual } from 'node:crypto'
import { MAX_PUBLICATION_BYTES, parsePublication } from '@/modules/kanban/publication'
import { publishWorkOrders } from '@/modules/kanban/publication-store'

export const runtime = 'nodejs'
export const maxDuration = 30
const response = (status: number, value: unknown) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } })
export async function POST(request: Request) {
  const secret = process.env.KANBAN_PUBLISH_SECRET
  if (!secret || secret.length < 32 || secret === process.env.KANBAN_BOT_WEBHOOK_SECRET) return response(503, { error: 'Kanban publishing is not configured.' })
  const authorization = request.headers.get('authorization') ?? ''
  const expected = Buffer.from(`Bearer ${secret}`), supplied = Buffer.from(authorization.slice(0, 4096))
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return response(401, { error: 'Unauthorized publisher.' })
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return response(415, { error: 'JSON is required.' })
  const declared = request.headers.get('content-length')
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_PUBLICATION_BYTES)) return response(413, { error: 'Publication body exceeds its supported size.' })
  let publication
  try {
    const reader = request.body?.getReader(); if (!reader) return response(400, { error: 'A complete publication is required.' })
    const chunks: Uint8Array[] = []; let size = 0
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break
        size += value.byteLength
        if (size > MAX_PUBLICATION_BYTES) { await reader.cancel(); return response(413, { error: 'Publication body exceeds its supported size.' }) }
        chunks.push(value)
      }
    } finally { reader.releaseLock() }
    publication = parsePublication(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))))
  } catch { return response(400, { error: 'Invalid complete Work Orders publication. Check the versioned contract.' }) }
  try {
    const result = await publishWorkOrders(publication)
    return response(['published', 'no_change'].includes(result.outcome) ? 200 : 409, result)
  } catch { return response(503, { error: 'Publication could not be stored. The last good snapshot remains available; retry this same publication ID.' }) }
}
