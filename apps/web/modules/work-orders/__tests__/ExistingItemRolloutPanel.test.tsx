import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const formStatus = vi.hoisted(() => ({ pending: false }))

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return {
    ...actual,
    useFormStatus: () => formStatus,
  }
})

import { ExistingItemRolloutPanel } from '../ExistingItemRolloutPanel'
import type { ExistingItemRolloutStatus } from '../existing-item-rollout'

describe('ExistingItemRolloutPanel', () => {
  it('prevents duplicate submission while an explicit start is pending', () => {
    formStatus.pending = true
    const startAction = vi.fn()

    render(
      <ExistingItemRolloutPanel
        initialStatus={null}
        startAction={startAction}
        resumeAction={vi.fn()}
        statusAction={vi.fn()}
      />,
    )

    const startButton = screen.getByRole('button', { name: 'Starting existing-item enrichment…' })
    expect(startButton).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Starting existing-item enrichment…')
    expect(startAction).not.toHaveBeenCalled()
  })

  it('offers only a pending-safe resume control for a failed rollout', () => {
    formStatus.pending = true

    render(
      <ExistingItemRolloutPanel
        initialStatus={status({ state: 'failed', failed: 1 })}
        startAction={vi.fn()}
        resumeAction={vi.fn()}
        statusAction={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Start existing-item enrichment' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resuming failed enrichment…' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Resuming failed enrichment…')
  })

  it('shows progress with read-only semantics and no controls for View users', () => {
    formStatus.pending = false

    render(
      <ExistingItemRolloutPanel
        initialStatus={status({ state: 'running', queued: 1 })}
        startAction={vi.fn()}
        resumeAction={vi.fn()}
        statusAction={vi.fn()}
        canManage={false}
      />,
    )

    expect(screen.getByRole('region', { name: 'Existing-item enrichment' })).toHaveAttribute('aria-readonly', 'true')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('1', { selector: '[data-count="queued"]' })).toBeVisible()
  })

  it('polls a running rollout until the returned status is terminal', async () => {
    vi.useFakeTimers()
    const statusAction = vi.fn(async () => status({
      state: 'completed',
      queued: 0,
      drafted: 1,
      needsReview: 1,
      completedAt: new Date('2026-07-20T03:05:00.000Z'),
    }))
    try {
      render(
        <ExistingItemRolloutPanel
          initialStatus={status({ state: 'running', queued: 1 })}
          startAction={vi.fn()}
          resumeAction={vi.fn()}
          statusAction={statusAction}
        />,
      )

      await act(async () => vi.advanceTimersByTimeAsync(2_000))

      expect(statusAction).toHaveBeenCalledWith('rollout-ui-1')
      expect(screen.getByText('Rollout completed.')).toBeVisible()
      expect(screen.getByText('1', { selector: '[data-count="drafted"]' })).toBeVisible()
    } finally {
      vi.useRealTimers()
    }
  })

  it('replaces a polled failure with the running status returned by resume', async () => {
    vi.useFakeTimers()
    const statusAction = vi.fn(async () => status({ state: 'failed', failed: 1 }))
    const resumeAction = vi.fn(async () => status({
      state: 'running',
      queued: 1,
      failed: 0,
      retried: 1,
    }))
    try {
      render(
        <ExistingItemRolloutPanel
          initialStatus={status({ state: 'running', queued: 1 })}
          startAction={vi.fn()}
          resumeAction={resumeAction}
          statusAction={statusAction}
        />,
      )

      await act(async () => vi.advanceTimersByTimeAsync(2_000))
      expect(screen.getByText('Rollout failed.')).toBeVisible()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Resume failed enrichment' }))
        await Promise.resolve()
      })

      expect(resumeAction).toHaveBeenCalledWith('rollout-ui-1')
      expect(screen.getByText('Rollout running.')).toBeVisible()
      expect(screen.getByText('1', { selector: '[data-count="retried"]' })).toBeVisible()
    } finally {
      vi.useRealTimers()
    }
  })
})

function status(overrides: Partial<ExistingItemRolloutStatus> = {}): ExistingItemRolloutStatus {
  return {
    id: 'rollout-ui-1',
    correlationId: 'correlation-ui-1',
    state: 'running',
    total: 1,
    queued: 0,
    processing: 0,
    drafted: 0,
    needsReview: 0,
    unmapped: 0,
    failed: 0,
    retried: 0,
    skippedRemoved: 0,
    skippedConfirmed: 0,
    skippedCurrentKey: 0,
    startedAt: new Date('2026-07-20T03:00:00.000Z'),
    completedAt: null,
    durationMs: 0,
    safeFailureClass: null,
    ...overrides,
  }
}
