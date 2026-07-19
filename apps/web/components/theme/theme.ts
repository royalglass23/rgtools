export const THEME_STORAGE_KEY = 'rgtools-theme'
export const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export function normalizeThemePreference(value: string | null): ThemePreference {
  if (value === 'light' || value === 'dark' || value === 'system') return value
  return 'system'
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark?: boolean,
): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference
  return systemPrefersDark ? 'dark' : 'light'
}
