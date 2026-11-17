// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { settledSourceValues, withSourceBudget } from '../source'
import type { ServiceM8FetchRequest } from '@/lib/servicem8/client'

describe('bounded source reads', () => {
  it('cancels active and queued reads and drains them before returning at the total deadline', async () => {
    vi.useFakeTimers()
    try {
      let active = 0, maximum = 0
      const request: ServiceM8FetchRequest = vi.fn(async (_path, init) => {
        active++; maximum = Math.max(maximum, active)
        return { ok: true, status: 200, json: () => new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => { active--; reject(new DOMException('Cancelled', 'AbortError')) }, { once: true })) }
      })
      let settled = false
      const running = withSourceBudget(request, bounded => settledSourceValues(Array.from({ length: 8 }, (_, i) => bounded(`/job/${i}.json`))), { timeoutMs: 50, concurrency: 2 }).finally(() => { settled = true })
      const rejection = expect(running).rejects.toMatchObject({ name: 'AbortError' })
      await vi.advanceTimersByTimeAsync(50)
      expect(settled).toBe(true); expect(active).toBe(0); expect(maximum).toBe(2)
      await rejection
    } finally { vi.useRealTimers() }
  })
  it('keeps a failed source lease until a slower sibling has settled', async () => {
    let finish!: () => void, finished = false
    const sibling = new Promise<void>(resolve => { finish = resolve })
    const work = settledSourceValues([Promise.reject(new Error('Synthetic source failure')), sibling]).finally(() => { finished = true })
    const rejection = expect(work).rejects.toThrow('Synthetic source failure')
    await Promise.resolve(); expect(finished).toBe(false)
    finish(); await rejection; expect(finished).toBe(true)
  })
  it('drains a started read even when its operation throws before awaiting that read', async () => {
    let cleanup!: () => void, settled = false, active = 0
    const cleanupDone = new Promise<void>(resolve => { cleanup = resolve })
    const request: ServiceM8FetchRequest = async (_path, init) => {
      active++
      return new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', async () => { await cleanupDone; active--; reject(new Error('Cancelled source')) }, { once: true }))
    }
    const work = withSourceBudget(request, async bounded => { void bounded('/job.json').catch(() => {}); throw new Error('Operation failed') }).finally(() => { settled = true })
    const rejection = expect(work).rejects.toThrow('Operation failed')
    await Promise.resolve(); expect(settled).toBe(false); expect(active).toBe(1)
    cleanup(); await rejection; expect(active).toBe(0)
  })
})
