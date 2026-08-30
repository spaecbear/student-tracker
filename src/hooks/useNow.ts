import { useEffect, useState } from 'react'

/**
 * A ticking clock. Everything time-dependent derives from this value rather
 * than from its own counter, so nothing can drift.
 *
 * Use 1000ms for the header clock and 30000ms for card durations — an `hh:mm`
 * display gains nothing from a per-second re-render across thirty cards.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const id = window.setInterval(tick, intervalMs)
    // A Chromebook that sleeps mid-class throttles timers; resync on wake.
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs])

  return now
}
