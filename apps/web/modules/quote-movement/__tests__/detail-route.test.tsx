import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireModule = vi.hoisted(() => vi.fn())
const getQuoteMovementRecord = vi.hoisted(() => vi.fn())
const notFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))

vi.mock('@/lib/guard', () => ({ requireModule }))
vi.mock('../queries', () => ({ getQuoteMovementRecord }))
vi.mock('next/navigation', () => ({ notFound }))

import QuoteMovementDetailPage from '@/app/(dashboard)/quote-movement/[id]/page'

describe('Quote Movement detail route shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireModule.mockResolvedValue(undefined)
    getQuoteMovementRecord.mockResolvedValue({
      id: 'record-1',
      servicem8Status: 'Quote',
      servicem8Active: true,
      jobNumber: 'Q260101',
      customerName: 'Alpha Homes',
      jobAddress: '1 Glass Lane',
      quoteValueExcludingGst: '1250.00',
      lastServiceM8SyncedAt: new Date('2026-07-17T03:00:00Z'),
    })
  })

  it('opens a protected detail shell from the cached record identity', async () => {
    render(await QuoteMovementDetailPage({ params: Promise.resolve({ id: 'record-1' }) }))

    expect(requireModule).toHaveBeenCalledWith('quote-tracker')
    expect(screen.getByRole('heading', { name: 'Q260101' })).toBeInTheDocument()
    expect(screen.getByText('Alpha Homes')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'What Matters Now' })).toBeInTheDocument()
  })

  it('does not expose a detail shell for an unknown cached record', async () => {
    getQuoteMovementRecord.mockResolvedValue(null)

    await expect(QuoteMovementDetailPage({
      params: Promise.resolve({ id: 'missing' }),
    })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
