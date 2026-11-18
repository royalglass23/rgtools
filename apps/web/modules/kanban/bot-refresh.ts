'use server'

import { randomUUID } from 'node:crypto'
import { requireDashboardUser } from '@/lib/dashboard-access'
import { publishedSourceConfigured, readPublishedRange } from './published-source'
import { verifyPublishedSourceIdentity } from './keyless-google-auth'

export type RefreshStart = { ok: true; requestId: string } | { ok: false; error: string }
export type RefreshStatus = { state: 'pending' } | { state: 'complete'; changed: boolean } | { state: 'failed'; error: string }

function configuration() {
  const url = process.env.KANBAN_BOT_WEBHOOK_URL, secret = process.env.KANBAN_BOT_WEBHOOK_SECRET, range = process.env.KANBAN_BOT_RECEIPTS_RANGE
  if (!url || !secret || !range || !publishedSourceConfigured()) throw new Error('Refresh is not configured. Ask an administrator to connect the Kanban trigger and completion receipt.')
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) throw new Error()
  } catch { throw new Error('The Kanban trigger configuration needs administrator review.') }
  if (range.length > 200 || !/!\$?[A-Z]+(?::\$?[A-Z]+|\$?\d+:\$?[A-Z]+\$?\d+)$/.test(range)) throw new Error('The Kanban completion receipt range needs administrator review.')
  return { url, secret, range }
}

export async function startPublishedRefresh(): Promise<RefreshStart> {
  await requireDashboardUser()
  let config
  try { config = configuration() } catch (error) { return { ok: false, error: (error as Error).message } }
  try { await verifyPublishedSourceIdentity() } catch { return { ok: false, error: 'The Vercel identity for Kanban is unavailable. Ask an administrator to check OIDC access before refreshing.' } }
  const requestId = randomUUID()
  try {
    const response = await fetch(config.url, { method: 'POST', headers: { Authorization: `Bearer ${config.secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refresh_work_orders', requestId }), signal: AbortSignal.timeout(15_000), redirect: 'error', cache: 'no-store' })
    await response.body?.cancel()
    if (response.status !== 200) return { ok: false, error: 'The Kanban trigger did not confirm acceptance. Check the bot before starting another refresh.' }
    return { ok: true, requestId }
  } catch { return { ok: false, error: 'Could not confirm whether Kanban started. Check the bot before starting another refresh.' } }
}

export async function publishedRefreshStatus(requestId: string): Promise<RefreshStatus> {
  await requireDashboardUser()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) return { state: 'failed', error: 'Invalid Kanban refresh request.' }
  try {
    const { range } = configuration()
    const rows = await readPublishedRange(range)
    const headers = ['requestId', 'status', 'outputVersion', 'completedAt']
    if (!rows[0] || headers.some((header, i) => rows[0][i] !== header)) throw new Error()
    const matching = rows.slice(1).filter(row => row[0] === requestId)
    if (!matching.length) return { state: 'pending' }
    if (matching.length !== 1) throw new Error()
    const [, state, version, completedAt] = matching[0]
    if (state === 'failed') return { state: 'failed', error: 'Kanban reported that this refresh failed. Existing published rows are unchanged here.' }
    if (!['success', 'no_change'].includes(String(state)) || typeof version !== 'string' || !version.trim() || typeof completedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(completedAt) || !Number.isFinite(Date.parse(completedAt))) throw new Error()
    return { state: 'complete', changed: state === 'success' }
  } catch { return { state: 'failed', error: 'Kanban completion could not be verified. Existing rows remain visible; check the bot before retrying.' } }
}
