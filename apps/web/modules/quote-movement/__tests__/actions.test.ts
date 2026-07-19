// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireModule = vi.hoisted(() => vi.fn())
const auth = vi.hoisted(() => vi.fn())
const refreshQuoteMovementFromServiceM8 = vi.hoisted(() => vi.fn())
const revalidatePath = vi.hoisted(() => vi.fn())
const redirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { url })
}))

vi.mock('@/lib/guard', () => ({ requireModule }))
vi.mock('@/lib/auth', () => ({ auth }))
vi.mock('../service', () => ({ refreshQuoteMovementFromServiceM8 }))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('next/navigation', () => ({ redirect }))

import { refreshQuoteMovementAction } from '../actions'

describe('refreshQuoteMovementAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireModule.mockResolvedValue(undefined)
    auth.mockResolvedValue({ user: { id: 'user-1' } })
    refreshQuoteMovementFromServiceM8.mockResolvedValue({
      synced: 1,
      refreshedAt: new Date('2026-07-17T03:00:00Z'),
    })
  })

  it('refreshes through the existing Quote Tracker permission', async () => {
    await refreshQuoteMovementAction()

    expect(requireModule).toHaveBeenCalledWith('quote-tracker')
    expect(refreshQuoteMovementFromServiceM8).toHaveBeenCalledWith({ actorId: 'user-1' })
    expect(revalidatePath).toHaveBeenCalledWith('/quote-movement')
  })

  it('stops before ServiceM8 reads when Quote Tracker access is denied', async () => {
    requireModule.mockRejectedValue(Object.assign(new Error('NEXT_REDIRECT'), {
      url: '/?denied=quote-tracker',
    }))

    await expect(refreshQuoteMovementAction()).rejects.toMatchObject({
      url: '/?denied=quote-tracker',
    })
    expect(refreshQuoteMovementFromServiceM8).not.toHaveBeenCalled()
  })

  it('returns a staff-safe refresh error while leaving the cached list route available', async () => {
    refreshQuoteMovementFromServiceM8.mockRejectedValue(new Error(
      'Quote Movement could not refresh from ServiceM8. The previous cached list was kept.',
    ))

    await expect(refreshQuoteMovementAction()).rejects.toMatchObject({
      url: `/quote-movement?refreshError=${encodeURIComponent(
        'Quote Movement could not refresh from ServiceM8. The previous cached list was kept.',
      )}`,
    })
  })
})
