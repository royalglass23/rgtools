import { SYSTEM_THEME_QUERY, THEME_STORAGE_KEY } from './theme'

export function getThemeBootstrapScript() {
  return `(() => {
    const root = document.documentElement;
    try {
      const saved = localStorage.getItem('${THEME_STORAGE_KEY}');
      const preference = saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
      const systemPrefersDark = typeof window.matchMedia === 'function' && window.matchMedia('${SYSTEM_THEME_QUERY}').matches;
      const resolved = preference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : preference;
      root.dataset.theme = resolved;
      root.style.colorScheme = resolved;
    } catch {
      root.dataset.theme = 'light';
      root.style.colorScheme = 'light';
    }
  })();`
}
