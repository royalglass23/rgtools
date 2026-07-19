'use client'

import { useEffect, useSyncExternalStore } from 'react'
import {
  normalizeThemePreference,
  resolveTheme,
  SYSTEM_THEME_QUERY,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from './theme'
import styles from './ThemeControl.module.css'

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]
const THEME_PREFERENCE_EVENT = 'rgtools-theme-preference-change'

export function ThemeControl() {
  const preference = useSyncExternalStore(
    subscribeToThemePreference,
    readSavedPreference,
    getServerThemePreference,
  )

  useEffect(() => {
    const systemTheme = getSystemThemeQuery()
    applyResolvedTheme(preference, systemTheme?.matches)
    if (preference !== 'system' || !systemTheme) return

    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      applyResolvedTheme('system', event.matches)
    }

    systemTheme.addEventListener('change', handleSystemThemeChange)
    return () => systemTheme.removeEventListener('change', handleSystemThemeChange)
  }, [preference])

  function selectTheme(nextPreference: ThemePreference) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextPreference)
    } catch {
      // The selected theme still applies for this page when storage is unavailable.
    }
    window.dispatchEvent(new Event(THEME_PREFERENCE_EVENT))
  }

  return (
    <div className={styles.control} role="group" aria-label="Appearance">
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.option}
          aria-pressed={preference === option.value}
          onClick={() => selectTheme(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function subscribeToThemePreference(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange)
  window.addEventListener(THEME_PREFERENCE_EVENT, onStoreChange)
  return () => {
    window.removeEventListener('storage', onStoreChange)
    window.removeEventListener(THEME_PREFERENCE_EVENT, onStoreChange)
  }
}

function getServerThemePreference(): ThemePreference {
  return 'system'
}

function readSavedPreference(): ThemePreference {
  try {
    return normalizeThemePreference(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

function getSystemThemeQuery(): MediaQueryList | undefined {
  if (typeof window.matchMedia !== 'function') return undefined
  return window.matchMedia(SYSTEM_THEME_QUERY)
}

function applyResolvedTheme(preference: ThemePreference, systemPrefersDark?: boolean) {
  const resolvedTheme = resolveTheme(preference, systemPrefersDark)
  document.documentElement.dataset.theme = resolvedTheme
  document.documentElement.style.colorScheme = resolvedTheme
}
