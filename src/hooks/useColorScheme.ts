import { useCallback, useEffect, useState } from 'react'
import {
  applyScheme,
  readStoredScheme,
  storeScheme,
  type ResolvedScheme,
  type SchemePreference,
} from '../themes/scheme'

export interface ColorScheme {
  preference: SchemePreference
  resolved: ResolvedScheme
  setPreference: (preference: SchemePreference) => void
}

/**
 * Light/dark, independent of the class color theme. "System" keeps following
 * the device, so a Chromebook that switches at dusk takes the app with it.
 */
export function useColorScheme(): ColorScheme {
  const [preference, setPreferenceState] = useState<SchemePreference>(readStoredScheme)
  const [resolved, setResolved] = useState<ResolvedScheme>(() => applyScheme(readStoredScheme()))

  useEffect(() => {
    setResolved(applyScheme(preference))
    if (preference !== 'system') return
    if (typeof window.matchMedia !== 'function') return

    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setResolved(applyScheme('system'))
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [preference])

  const setPreference = useCallback((next: SchemePreference) => {
    storeScheme(next)
    setPreferenceState(next)
  }, [])

  return { preference, resolved, setPreference }
}
