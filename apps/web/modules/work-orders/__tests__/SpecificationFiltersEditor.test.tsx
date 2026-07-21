import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SpecificationFiltersEditor } from '../SpecificationFiltersEditor'

describe('SpecificationFiltersEditor', () => {
  it('lets Configure users enable and globally reorder specification filters', () => {
    const { container } = render(<SpecificationFiltersEditor fields={[
      { field: 'system', enabled: false, order: 1 },
      { field: 'hardwareFinish', enabled: true, order: 2 },
    ]} saveAction={vi.fn()} />)

    expect(screen.getByRole('checkbox', { name: 'Enable System filter' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Enable Hardware/Fittings Finish filter' })).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'Move Hardware/Fittings Finish filter up' }))

    expect(Array.from(container.querySelectorAll<HTMLInputElement>('input[name^="order:"]')).map((input) => [
      input.name,
      input.value,
    ])).toEqual([
      ['order:hardwareFinish', '1'],
      ['order:system', '2'],
    ])
  })

  it('reports a successful global configuration save', async () => {
    const saveAction = vi.fn(async () => ({
      status: 'success' as const,
      message: 'Production Specification filters saved.',
    }))
    render(<SpecificationFiltersEditor
      fields={[{ field: 'system', enabled: true, order: 1 }]}
      saveAction={saveAction}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Save specification filters' }))

    await waitFor(() => expect(saveAction).toHaveBeenCalledOnce())
    expect(await screen.findByRole('status', {}, { timeout: 5_000 })).toHaveTextContent(
      'Production Specification filters saved.',
    )
  })

  it('shows pending feedback and actionable recovery after a failed save', async () => {
    let resolveSave: ((state: { status: 'error'; message: string }) => void) | undefined
    const saveAction = vi.fn(() => new Promise<{ status: 'error'; message: string }>((resolve) => {
      resolveSave = resolve
    }))
    render(<SpecificationFiltersEditor
      fields={[{ field: 'system', enabled: true, order: 1 }]}
      saveAction={saveAction}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Save specification filters' }))

    await waitFor(() => expect(screen.getByText('Saving Production Specification filters…')).toBeVisible())
    expect(screen.getByRole('button', { name: 'Saving specification filters…' })).toBeDisabled()

    await act(async () => {
      resolveSave?.({ status: 'error', message: 'Settings storage is unavailable.' })
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Settings storage is unavailable. Review the filter choices and try again.',
    )
  })
})
