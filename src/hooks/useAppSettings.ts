import { useCallback, useEffect, useState } from 'react'
import { getSetting, setSetting } from '../db'

export const SOUND_SETTING = 'soundEnabled'
export const DAILY_TOTAL_SETTING = 'showDailyTotal'

export interface AppSettings {
  loaded: boolean
  /** Off by default: thirty check-ins is a lot of chimes. */
  soundEnabled: boolean
  /** Shows each student's running total for today on their Out card. */
  showDailyTotal: boolean
  setSoundEnabled: (enabled: boolean) => void
  setShowDailyTotal: (enabled: boolean) => void
}

/** Small display preferences, kept in the settings store alongside app flags. */
export function useAppSettings(): AppSettings {
  const [loaded, setLoaded] = useState(false)
  const [soundEnabled, setSound] = useState(false)
  const [showDailyTotal, setDailyTotal] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getSetting<boolean>(SOUND_SETTING, false),
      getSetting<boolean>(DAILY_TOTAL_SETTING, true),
    ])
      .then(([sound, dailyTotal]) => {
        if (cancelled) return
        setSound(sound)
        setDailyTotal(dailyTotal)
        setLoaded(true)
      })
      .catch(() => {
        // Defaults are safe; a settings read failure must not block check-ins.
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const setSoundEnabled = useCallback((enabled: boolean) => {
    setSound(enabled)
    void setSetting(SOUND_SETTING, enabled)
  }, [])

  const setShowDailyTotal = useCallback((enabled: boolean) => {
    setDailyTotal(enabled)
    void setSetting(DAILY_TOTAL_SETTING, enabled)
  }, [])

  return { loaded, soundEnabled, showDailyTotal, setSoundEnabled, setShowDailyTotal }
}
