import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const refresh = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { QuoteMovementRefreshButton } from '../QuoteMovementRefreshButton'

describe('QuoteMovementRefreshButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('offers an explicit refresh while the cached list remains available', () => {
    render(
      <QuoteMovementRefreshButton
        action={vi.fn(async () => ({ status: 'requested' as const }))}
        automatic={false}
        refreshPending={false}
      />,
    )

    expect(screen.getByRole('button', { name: 'Refresh now' })).toBeEnabled()
  })

  it('blocks duplicate refresh requests and shows an obvious pending state', () => {
    render(
      <QuoteMovementRefreshButton
        action={vi.fn(async () => ({ status: 'already_pending' as const }))}
        automatic={false}
        refreshPending
      />,
    )

    expect(screen.getByRole('button', { name: 'Refresh pending' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Refresh pending')
  })

  it('does not request background work merely because cached content renders', async () => {
    const action = vi.fn(async () => ({ status: 'requested' as const }))
    render(
      <QuoteMovementRefreshButton
        action={action}
        refreshPending={false}
      />,
    )

    expect(screen.getByRole('button')).toBeInTheDocument()
    await waitFor(() => expect(action).not.toHaveBeenCalled())
    expect(refresh).not.toHaveBeenCalled()
  })

  it('can explicitly request background work when automatic refresh is enabled', async () => {
    const action = vi.fn(async () => ({ status: 'requested' as const }))
    render(
      <QuoteMovementRefreshButton
        action={action}
        automatic
        refreshPending={false}
      />,
    )

    await waitFor(() => expect(action).toHaveBeenCalledOnce())
    expect(refresh).toHaveBeenCalled()
  })

  it('shows immediate pending feedback for a manual request', async () => {
    const user = userEvent.setup()
    let release!: () => void
    const action = vi.fn(() => new Promise<{ status: 'requested' }>((resolve) => {
      release = () => resolve({ status: 'requested' })
    }))
    render(
      <QuoteMovementRefreshButton
        action={action}
        automatic={false}
        refreshPending={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Refresh now' }))
    expect(screen.getByRole('button', { name: 'Requesting refresh' })).toBeDisabled()
    release()
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })
})
