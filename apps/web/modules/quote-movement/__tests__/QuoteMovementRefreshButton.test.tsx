import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const formStatus = vi.hoisted(() => ({ pending: false }))

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return { ...actual, useFormStatus: () => formStatus }
})

import { QuoteMovementRefreshButton } from '../QuoteMovementRefreshButton'

describe('QuoteMovementRefreshButton', () => {
  it('offers an explicit refresh while the cached list remains available', () => {
    formStatus.pending = false
    render(<QuoteMovementRefreshButton />)

    expect(screen.getByRole('button', { name: 'Refresh now' })).toBeEnabled()
  })

  it('blocks duplicate refresh requests and shows an obvious pending state', () => {
    formStatus.pending = true
    render(<QuoteMovementRefreshButton />)

    expect(screen.getByRole('button', { name: 'Refreshing...' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing...')
  })
})
