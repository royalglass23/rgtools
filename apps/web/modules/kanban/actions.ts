'use server'

import { requireDashboardUser } from '@/lib/dashboard-access'
import { persistProductOperations, ProductConflict, readProductHistory } from './persistence'
import { validateItemSave } from './work-orders'

export async function saveDashboardProduct(raw: unknown) {
  const user = await requireDashboardUser()
  let input
  try { input = validateItemSave(raw) } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : 'Invalid product update.' } }
  try {
    const result = await persistProductOperations(input, user.id)
    // The client refreshes only when no editor is dirty. Revalidating the active
    // route here would unmount drafts before that client-side coordination.
    return { ok: true as const, revision: result.revision }
  } catch (error) {
    return { ok: false as const, error: error instanceof ProductConflict ? error.message : 'The update could not be saved. Your edits are kept here. Try again.' }
  }
}

export async function productHistory(itemId: string, page = 1) {
  await requireDashboardUser()
  if (!/^[0-9a-f-]{36}$/i.test(itemId) || !Number.isSafeInteger(page) || page < 1 || page > 10000) throw new Error('Invalid history request.')
  const events = await readProductHistory(itemId, page)
  return { more: events.length > 20, events: events.slice(0, 20).map(event => ({ ...event, createdAt: event.createdAt.toISOString() })) }
}
