import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DismissibleNotice } from '../DismissibleNotice'

describe('DismissibleNotice', () => {
  it('keeps a dismissed notice hidden after a remount for the same notice', () => {
    window.localStorage.clear()
    const { unmount } = render(
      <DismissibleNotice
        tone="error"
        noticeKey="refresh-1"
        dismissalStorageKey="quote-movement-refresh-error"
      >
        Quote Movement could not refresh.
      </DismissibleNotice>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close notification' }))
    unmount()

    render(
      <DismissibleNotice
        tone="error"
        noticeKey="refresh-1"
        dismissalStorageKey="quote-movement-refresh-error"
      >
        Quote Movement could not refresh.
      </DismissibleNotice>,
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    window.localStorage.clear()
  })

  it('keeps a dismissed notice hidden after a remount for the same notice', () => {
    window.localStorage.clear()
    const { unmount } = render(
      <DismissibleNotice
        tone="error"
        noticeKey="refresh-1"
        dismissalStorageKey="quote-movement-refresh-error"
      >
        Quote Movement could not refresh.
      </DismissibleNotice>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close notification' }))
    unmount()

    render(
      <DismissibleNotice
        tone="error"
        noticeKey="refresh-1"
        dismissalStorageKey="quote-movement-refresh-error"
      >
        Quote Movement could not refresh.
      </DismissibleNotice>,
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    window.localStorage.clear()
  })

  it('lets the user dismiss an error notice', () => {
    render(
      <DismissibleNotice tone="error">
        Work Orders could not refresh.
      </DismissibleNotice>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Work Orders could not refresh.')

    fireEvent.click(screen.getByRole('button', { name: 'Close notification' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('uses polite status semantics for non-error feedback', () => {
    render(<DismissibleNotice tone="success">Dashboard tables saved.</DismissibleNotice>)

    expect(screen.getByRole('status')).toHaveTextContent('Dashboard tables saved.')
  })

  it('shows a new action result after the previous notice was dismissed', () => {
    const { rerender } = render(
      <DismissibleNotice tone="error" noticeKey="first-error">First error</DismissibleNotice>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close notification' }))

    rerender(
      <DismissibleNotice tone="error" noticeKey="second-error">Second error</DismissibleNotice>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Second error')
  })
})
