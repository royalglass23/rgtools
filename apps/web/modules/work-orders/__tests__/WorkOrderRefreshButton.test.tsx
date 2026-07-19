import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const formStatus = vi.hoisted(() => ({ pending: false }))

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return {
    ...actual,
    useFormStatus: () => formStatus,
  }
})

import { WorkOrderRefreshButton } from '../WorkOrderRefreshButton'

describe('WorkOrderRefreshButton', () => {
  it('is enabled and shows the refresh label while idle', () => {
    formStatus.pending = false

    render(<WorkOrderRefreshButton />)

    expect(screen.getByRole('button', { name: 'Refresh all jobs' })).toBeEnabled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows fetching feedback and blocks duplicate clicks while pending', () => {
    formStatus.pending = true

    render(<WorkOrderRefreshButton />)

    expect(screen.getByRole('button', { name: 'Refreshing all jobs...' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing all jobs...')
  })
})
