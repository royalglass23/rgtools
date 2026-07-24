// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireModule = vi.hoisted(() => vi.fn())
const auth = vi.hoisted(() => vi.fn())
const requestQuoteMovementRefresh = vi.hoisted(() => vi.fn())
const requestQuoteMovementJobFetch = vi.hoisted(() => vi.fn())
const updateQuoteMovementProjectComplexity = vi.hoisted(() => vi.fn())
const revalidatePath = vi.hoisted(() => vi.fn())
const redirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { url })
}))
const after = vi.hoisted(() => vi.fn())

vi.mock('@/lib/guard', () => ({ requireModule }))
vi.mock('@/lib/auth', () => ({ auth }))
vi.mock('../service', () => ({ requestQuoteMovementRefresh, requestQuoteMovementJobFetch }))
vi.mock('../repository', () => ({ updateQuoteMovementProjectComplexity }))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('next/server', () => ({ after }))

import {
  refreshQuoteMovementAction,
  refreshQuoteMovementJobAction,
  updateQuoteMovementComplexityAction,
} from '../actions'

describe('refreshQuoteMovementAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireModule.mockResolvedValue(undefined)
    auth.mockResolvedValue({ user: { id: 'user-1' } })
    requestQuoteMovementRefresh.mockResolvedValue({ status: 'requested' })
    requestQuoteMovementJobFetch.mockResolvedValue({ status: 'requested' })
  })

  it('requests non-blocking refresh work through the existing Quote Tracker permission', async () => {
    await expect(refreshQuoteMovementAction()).resolves.toEqual({ status: 'requested' })

    expect(requireModule).toHaveBeenCalledWith('quote-tracker')
    expect(requestQuoteMovementRefresh).toHaveBeenCalledWith({
      actorId: 'user-1',
      schedule: after,
    })
    expect(revalidatePath).toHaveBeenCalledWith('/quote-movement')
  })

  it('stops before ServiceM8 reads when Quote Tracker access is denied', async () => {
    requireModule.mockRejectedValue(Object.assign(new Error('NEXT_REDIRECT'), {
      url: '/?denied=quote-tracker',
    }))

    await expect(refreshQuoteMovementAction()).rejects.toMatchObject({
      url: '/?denied=quote-tracker',
    })
    expect(requestQuoteMovementRefresh).not.toHaveBeenCalled()
  })

  it('returns a staff-safe request error while leaving the cached list route available', async () => {
    requestQuoteMovementRefresh.mockRejectedValue(new Error(
      'postgres://secret@provider/unsafe-body',
    ))

    await expect(refreshQuoteMovementAction()).rejects.toMatchObject({
      url: `/quote-movement?refreshError=${encodeURIComponent(
        'Quote Movement could not refresh from ServiceM8. The previous cached list was kept.',
      )}`,
    })
  })

  it('requests a scoped refresh for the submitted job number', async () => {
    const formData = new FormData()
    formData.set('jobNumber', ' Q260223 ')

    await expect(refreshQuoteMovementJobAction(formData)).resolves.toBeUndefined()

    expect(requestQuoteMovementJobFetch).toHaveBeenCalledWith({
      actorId: 'user-1',
      input: 'Q260223',
      schedule: after,
    })
    expect(revalidatePath).toHaveBeenCalledWith('/quote-movement')
  })

  it('rejects a scoped refresh without a job number', async () => {
    await expect(refreshQuoteMovementJobAction(new FormData())).rejects.toMatchObject({
      url: '/quote-movement?refreshError=Enter%20a%20job%20number%20to%20fetch.',
    })
    expect(requestQuoteMovementRefresh).not.toHaveBeenCalled()
  })
})

describe('updateQuoteMovementComplexityAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireModule.mockResolvedValue(undefined)
    updateQuoteMovementProjectComplexity.mockResolvedValue(undefined)
  })

  it('persists an approved Project Complexity and revalidates the list', async () => {
    const formData = new FormData()
    formData.set('recordId', 'record-1')
    formData.set('projectComplexity', 'very_difficult')

    await updateQuoteMovementComplexityAction(formData)

    expect(requireModule).toHaveBeenCalledWith('quote-tracker')
    expect(updateQuoteMovementProjectComplexity).toHaveBeenCalledWith(
      'record-1',
      'very_difficult',
    )
    expect(revalidatePath).toHaveBeenCalledWith('/quote-movement')
  })

  it('rejects an invalid Project Complexity before persistence', async () => {
    const formData = new FormData()
    formData.set('recordId', 'record-1')
    formData.set('projectComplexity', 'urgent')

    await expect(
      updateQuoteMovementComplexityAction(formData),
    ).rejects.toThrow('Invalid Project Complexity.')
    expect(updateQuoteMovementProjectComplexity).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects a missing record ID before persistence', async () => {
    const formData = new FormData()
    formData.set('projectComplexity', 'normal')

    await expect(
      updateQuoteMovementComplexityAction(formData),
    ).rejects.toThrow('Quote Movement record ID is required.')
    expect(updateQuoteMovementProjectComplexity).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects a missing Project Complexity before persistence', async () => {
    const formData = new FormData()
    formData.set('recordId', 'record-1')

    await expect(
      updateQuoteMovementComplexityAction(formData),
    ).rejects.toThrow('Invalid Project Complexity.')
    expect(updateQuoteMovementProjectComplexity).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('stops before persistence when Quote Tracker access is denied', async () => {
    requireModule.mockRejectedValue(Object.assign(new Error('NEXT_REDIRECT'), {
      url: '/?denied=quote-tracker',
    }))
    const formData = new FormData()
    formData.set('recordId', 'record-1')
    formData.set('projectComplexity', 'easy')

    await expect(
      updateQuoteMovementComplexityAction(formData),
    ).rejects.toMatchObject({ url: '/?denied=quote-tracker' })
    expect(updateQuoteMovementProjectComplexity).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
