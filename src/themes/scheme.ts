/**
 * Light/dark handling, independent of the per-class color theme.
 *
 * The preference lives in localStorage rather than IndexedDB so the correct
 * scheme can be applied synchronously before first paint — an async read would
 * flash a white screen at a dark classroom. This is a display preference, not
 * session or roster data, which stays in IndexedDB.
 */

export const SCHEME_STORAGE_KEY = 'timeTracker.colorScheme'

export type SchemePreference = 'system' | 'light' | 'dark'
export type ResolvedScheme = 'light' | 'dark'

export function isSchemePreference(value: unknown): value is SchemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function readStoredScheme(): SchemePreference {
  try {
    const stored = localStorage.getItem(SCHEME_STORAGE_KEY)
    return isSchemePreference(stored) ? stored : 'system'
  } catch {
    // Storage can be blocked outright; the system preference is a fine default.
    return 'system'
  }
}

export function storeScheme(preference: SchemePreference): void {
  try {
    localStorage.setItem(SCHEME_STORAGE_KEY, preference)
  } catch {
    // A failed write only costs the preference on next launch.
  }
}

export function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

export function resolveScheme(preference: SchemePreference): ResolvedScheme {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return preference
}

/** Sets the attribute the CSS custom properties key off. */
export function applyScheme(preference: SchemePreference): ResolvedScheme {
  const resolved = resolveScheme(preference)
  document.documentElement.dataset['scheme'] = resolved
  return resolved
}
