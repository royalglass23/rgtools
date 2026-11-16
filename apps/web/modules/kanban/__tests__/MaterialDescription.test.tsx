import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MaterialDescription } from '../MaterialDescription'
import { shortMaterialDescription } from '../material-description'
const description = 'Frameless shower enclosure with clear toughened glass, brushed hardware and custom dimensions.\nThe full second line includes installation details and a <b>literal source tag</b>.'
function show() { return render(<><MaterialDescription label={description} description={description} jobNumber="TEST406" editHref="/dashboard/work-orders?product=test#product-test" /><button>Outside control</button></>) }
afterEach(() => vi.useRealTimers())

describe('compact Materials description preview', () => {
  it('uses a short whitespace-normalized description while keeping the full text in a hover window', () => {
    show()
    const trigger = screen.getByRole('button', { name: /View material description/ })
    expect(trigger.textContent!.length).toBeLessThanOrEqual(80)
    expect(trigger).not.toHaveTextContent('second line')
    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' })
    const preview = screen.getByRole('dialog', { name: 'Materials · TEST406' })
    expect(preview.textContent).toContain(description)
    expect(preview.querySelector('b')).toBeNull()
    expect(preview.parentElement).toBe(document.body)
    expect(screen.getByRole('link', { name: 'Edit product' })).toHaveAttribute('href', '/dashboard/work-orders?product=test#product-test')
  })
  it('stays open while the pointer moves into the preview, then closes on leaving it', () => {
    vi.useFakeTimers(); show()
    const trigger = screen.getByRole('button', { name: /View material description/ })
    fireEvent.pointerEnter(trigger); fireEvent.pointerLeave(trigger)
    const preview = screen.getByRole('dialog')
    fireEvent.pointerEnter(preview)
    act(() => vi.advanceTimersByTime(250))
    expect(preview).toBeInTheDocument()
    fireEvent.pointerLeave(preview)
    act(() => vi.advanceTimersByTime(250))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('supports keyboard focus, Escape, and restoring focus from the close control', async () => {
    const user = userEvent.setup(); show()
    const trigger = screen.getByRole('button', { name: /View material description/ })
    await user.tab()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus())
    await user.click(screen.getByRole('button', { name: 'Close materials preview' }))
    expect(trigger).toHaveFocus(); expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.pointerEnter(trigger)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('supports tap/click and closes when an outside control is used', async () => {
    const user = userEvent.setup(); show()
    await user.click(screen.getByRole('button', { name: /View material description/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Outside control' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('keeps focused content available when the pointer leaves and dismisses on focus leaving', () => {
    vi.useFakeTimers(); show()
    const trigger = screen.getByRole('button', { name: /View material description/ })
    act(() => trigger.focus())
    fireEvent.pointerLeave(trigger)
    act(() => vi.advanceTimersByTime(250))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    act(() => screen.getByRole('button', { name: 'Outside control' }).focus())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('handles blank, multiline and unbroken descriptions without losing the original text', () => {
    expect(shortMaterialDescription('  ')).toBe('Product description')
    expect(shortMaterialDescription('Shower\n  clear glass')).toBe('Shower clear glass')
    expect(shortMaterialDescription('x'.repeat(120))).toHaveLength(80)
  })
})
