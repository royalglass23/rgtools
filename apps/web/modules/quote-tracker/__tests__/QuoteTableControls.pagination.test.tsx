import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const pushMock = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('../actions', () => ({ batchDeleteQuotesAction: vi.fn() }))

import { QuoteTableControls } from '../QuoteTableControls'
import { parseQuoteListFilters } from '../list-filters'

describe('QuoteTableControls pagination', () => {
  it('uses the shared count and navigation layout and applies page size explicitly', () => {
    pushMock.mockClear()
    render(<QuoteTableControls filters={parseQuoteListFilters({})} rows={[]} total={12} pageCount={3} />)

    expect(screen.getByText('12 tracked quotes')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Tracked quote pages' })).toHaveTextContent('Page 1 of 3')
    const select = screen.getByRole('combobox', { name: 'Page size' })
    fireEvent.change(select, { target: { value: '10' } })
    expect(pushMock).not.toHaveBeenCalled()
    fireEvent.click(select.closest('form')!.querySelector('button')!)
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining('size=10'))
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining('page=1'))
  })
})
