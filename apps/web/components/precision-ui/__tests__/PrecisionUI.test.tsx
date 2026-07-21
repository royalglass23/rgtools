import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  DataPanel,
  FeedbackState,
  KpiCard,
  PageHeader,
  PrecisionButton,
  StatusBadge,
  TableShell,
} from '../PrecisionUI'

describe('Royal Glass Precision presentation primitives', () => {
  it('gives page and panel content a consistent accessible hierarchy', () => {
    render(
      <>
        <PageHeader eyebrow="Royal Glass operations" title="Operations dashboard" description="Live business priorities" />
        <DataPanel eyebrow="Live data" title="Recent leads"><p>Panel content</p></DataPanel>
      </>,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Operations dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Recent leads' })).toBeInTheDocument()
    expect(screen.getByText('Panel content')).toBeInTheDocument()
  })

  it('exposes KPI, status, table, and action meaning without relying on colour', () => {
    render(
      <>
        <KpiCard label="Pipeline value" value="$2.4m" detail="Active quotes" />
        <StatusBadge tone="critical">Overdue</StatusBadge>
        <TableShell label="Priority actions"><table><tbody><tr><td>Follow up</td></tr></tbody></table></TableShell>
        <PrecisionButton type="button">Save changes</PrecisionButton>
      </>,
    )

    expect(screen.getByText('$2.4m')).toBeInTheDocument()
    expect(screen.getByText('Overdue')).toHaveAttribute('data-tone', 'critical')
    expect(within(screen.getByRole('region', { name: 'Priority actions' })).getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })

  it('announces errors while keeping empty and loading states calm', () => {
    const { rerender } = render(<FeedbackState tone="empty">Nothing here yet.</FeedbackState>)
    expect(screen.getByText('Nothing here yet.')).not.toHaveAttribute('role', 'alert')

    rerender(<FeedbackState tone="error">Could not load records.</FeedbackState>)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load records.')
  })
})
