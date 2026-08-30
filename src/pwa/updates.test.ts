import { afterEach, describe, expect, it, vi } from 'vitest'
import { UPDATE_CHECK_INTERVAL_MS, startUpdatePolling } from './updates'

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true })
}

afterEach(() => {
  vi.useRealTimers()
  setOnline(true)
})

describe('startUpdatePolling', () => {
  it('checks for a new version once an hour', () => {
    vi.useFakeTimers()
    const update = vi.fn().mockResolvedValue(undefined)

    startUpdatePolling({ update })

    expect(update).not.toHaveBeenCalled()
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS)
    expect(update).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS * 3)
    expect(update).toHaveBeenCalledTimes(4)
  })

  it('skips the check while the device is offline', () => {
    vi.useFakeTimers()
    const update = vi.fn().mockResolvedValue(undefined)
    startUpdatePolling({ update })

    setOnline(false)
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS * 2)
    expect(update).not.toHaveBeenCalled()

    // ...and resumes once it is back, without needing a relaunch.
    setOnline(true)
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('stops when told to', () => {
    vi.useFakeTimers()
    const update = vi.fn().mockResolvedValue(undefined)

    const stop = startUpdatePolling({ update })
    stop()

    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS * 5)
    expect(update).not.toHaveBeenCalled()
  })

  it('does not let a failed check throw into the timer', () => {
    vi.useFakeTimers()
    const update = vi.fn().mockRejectedValue(new Error('offline'))

    startUpdatePolling({ update })
    expect(() => vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS)).not.toThrow()
  })
})
