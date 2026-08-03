import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeControl } from '../ThemeControl'
import { THEME_STORAGE_KEY } from '../theme'

describe('ThemeControl', () => {
  let systemThemeListeners: Set<(event: MediaQueryListEvent) => void>

  beforeEach(() => {
    systemThemeListeners = new Set()
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          systemThemeListeners.add(listener)
        },
        removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          systemThemeListeners.delete(listener)
        },
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows and applies the saved explicit preference', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')

    render(<ThemeControl />)

    expect(screen.getByRole('group', { name: 'Appearance' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true'))
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })

  it('persists a user choice and applies it to the document', async () => {
    const user = userEvent.setup()
    render(<ThemeControl />)

    await user.click(screen.getByRole('button', { name: 'Light' }))

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('tracks operating-system changes only while System is selected', async () => {
    const user = userEvent.setup()
    render(<ThemeControl />)

    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'dark'))
    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true')

    act(() => {
      systemThemeListeners.forEach((listener) => listener({ matches: false } as MediaQueryListEvent))
    })
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')

    await user.click(screen.getByRole('button', { name: 'Dark' }))
    act(() => {
      systemThemeListeners.forEach((listener) => listener({ matches: false } as MediaQueryListEvent))
    })
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })
})
