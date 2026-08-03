import { describe, expect, it } from 'vitest'
import { normalizeThemePreference, resolveTheme } from '../theme'
import { getThemeBootstrapScript } from '../theme-bootstrap'

describe('theme preference', () => {
  it('preserves supported saved preferences and treats untrusted values as System', () => {
    expect(normalizeThemePreference('light')).toBe('light')
    expect(normalizeThemePreference('dark')).toBe('dark')
    expect(normalizeThemePreference('system')).toBe('system')
    expect(normalizeThemePreference('unknown')).toBe('system')
    expect(normalizeThemePreference(null)).toBe('system')
  })

  it('keeps explicit Light and Dark choices independent of the operating system', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('uses the operating-system preference for System and falls back to Light', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('system', undefined)).toBe('light')
  })
})

describe('theme bootstrap', () => {
  it('applies a saved explicit theme before the application hydrates', () => {
    localStorage.setItem('rgtools-theme', 'dark')
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false }),
    })

    new Function(getThemeBootstrapScript())()

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('uses the operating-system theme when no explicit choice is saved', () => {
    localStorage.removeItem('rgtools-theme')
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: true }),
    })

    new Function(getThemeBootstrapScript())()

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })
})
