'use server'

import { randomUUID } from 'node:crypto'
import { requireDashboardUser } from '@/lib/dashboard-access'
import { readPublicationVersion } from './publication-store'

type RefreshStart = { ok: true; requestId: string } | { ok: false; error: string }
export async function startPublishedRefresh(): Promise<RefreshStart> {
  await requireDashboardUser()
  const secret = process.env.KANBAN_BOT_WEBHOOK_SECRET, rawUrl = process.env.KANBAN_BOT_WEBHOOK_URL
  let url: URL
  try {
    if (!rawUrl || !secret || secret === process.env.KANBAN_PUBLISH_SECRET) throw new Error('Missing or shared secret')
    url = new URL(rawUrl)
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Unsafe webhook')
  } catch { return { ok: false, error: 'Kanban update requests are not configured. Ask an administrator to check the webhook.' } }
  const requestId = randomUUID()
  try {
    const response = await fetch(url.toString(), { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refresh_work_orders', requestId }), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000) })
    void response.body?.cancel().catch(() => {})
    if (response.status !== 200) return { ok: false, error: 'Kanban did not accept the update request. Existing rows remain available; check the bot before retrying.' }
    return { ok: true, requestId }
  } catch { return { ok: false, error: 'Update request acceptance could not be confirmed. Existing rows remain available; check the bot before retrying.' } }
}
export async function currentPublicationVersion(): Promise<string | null> {
  await requireDashboardUser()
  return readPublicationVersion()
}
