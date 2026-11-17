import { createServiceM8RequestFromEnv, type ServiceM8FetchRequest } from '@/lib/servicem8/client'

// Drain every sibling, including rejected reads, before the caller releases a
// source lease. Promise.all alone would return while other reads still run.
export async function settledSourceValues<T extends readonly unknown[]>(values: { [K in keyof T]: Promise<T[K]> }): Promise<T> {
  const results = await Promise.allSettled(values)
  const failure = results.find(result => result.status === 'rejected')
  if (failure?.status === 'rejected') throw failure.reason
  return results.map(result => (result as PromiseFulfilledResult<unknown>).value) as unknown as T
}

export async function withSourceBudget<T>(request: ServiceM8FetchRequest, operation: (request: ServiceM8FetchRequest) => Promise<T>, options: { timeoutMs?: number; maxRequests?: number; concurrency?: number } = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(new DOMException('Source deadline reached', 'TimeoutError')), options.timeoutMs ?? 25_000)
  let requests = 0, active = 0
  const waiters: Array<() => void> = []
  const pending = new Set<Promise<unknown>>()
  controller.signal.addEventListener('abort', () => waiters.splice(0).forEach(resolve => resolve()), { once: true })
  const bounded: ServiceM8FetchRequest = (path, init) => {
    const call = (async () => {
    if (++requests > (options.maxRequests ?? 24)) throw new Error('Source request budget exceeded.')
    controller.signal.throwIfAborted()
    while (active >= (options.concurrency ?? 4)) {
      await new Promise<void>(resolve => waiters.push(resolve))
      controller.signal.throwIfAborted()
    }
    controller.signal.throwIfAborted(); active++
    let released = false
    const release = () => { if (!released) { released = true; active--; waiters.shift()?.() } }
    try {
      const response = await request(path, { ...init, signal: init?.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal })
      const value = await response.json()
      return { ok: response.ok, status: response.status, headers: response.headers, json: async () => value }
    } finally { release() }
    })()
    pending.add(call)
    void call.then(() => pending.delete(call), () => pending.delete(call))
    return call
  }
  try { return await operation(bounded) }
  finally {
    controller.abort(); clearTimeout(timer); waiters.splice(0).forEach(resolve => resolve())
    // Includes callers that fail before explicitly awaiting their siblings.
    while (pending.size) await Promise.allSettled([...pending])
  }
}

export function dashboardSourceRequest(request: ServiceM8FetchRequest = createServiceM8RequestFromEnv()): ServiceM8FetchRequest {
  return (path, init) => {
    if ((init?.method ?? 'GET').toUpperCase() !== 'GET' || init?.body || !/^\/(vendor|job|company|jobmaterial|material|note|email)(\.json|\/[a-zA-Z0-9-]+\.json)(\?|$)/.test(path)) {
      throw new Error('Dashboard source permits selected GET requests only.')
    }
    return request(path, { ...init, method: 'GET' })
  }
}

export async function verifyDashboardVendor(request: ServiceM8FetchRequest) {
  const response = await request('/vendor.json')
  if (!response.ok) throw new Error('ServiceM8 account could not be verified.')
  const data = await response.json()
  const vendor = Array.isArray(data) ? data[0] : data
  const name = String(vendor?.name ?? vendor?.company_name ?? '').trim()
  if (!/^royal glass(?:\s+(?:limited|ltd))?$/i.test(name)) throw new Error('The connected ServiceM8 account is not Royal Glass.')
}
