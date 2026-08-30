import { describe, expect, it } from 'vitest'
import {
  DAY_MS,
  HOUR_MS,
  MINUTE_MS,
  endOfLocalDay,
  formatDateISO,
  formatDurationHhMm,
  formatTime12,
  formatTime24,
  isSameLocalDay,
  localTimeOnDay,
  parseISODateLocal,
  parseTime24OnDay,
  sessionDurationMs,
  startOfLocalDay,
} from './time'

const AT = new Date(2026, 8, 15, 9, 14).getTime() // 2026-09-15 09:14 local

describe('sessionDurationMs', () => {
  it('measures a closed session between its own timestamps', () => {
    expect(sessionDurationMs(AT, AT + 93 * MINUTE_MS, AT + DAY_MS)).toBe(93 * MINUTE_MS)
  })

  it('measures an open session against now', () => {
    expect(sessionDurationMs(AT, null, AT + 20 * MINUTE_MS)).toBe(20 * MINUTE_MS)
  })

  it('never returns a negative duration when the clock moves backwards', () => {
    expect(sessionDurationMs(AT, null, AT - HOUR_MS)).toBe(0)
  })
})

describe('formatDurationHhMm', () => {
  it('zero-pads and leaves hours uncapped', () => {
    expect(formatDurationHhMm(0)).toBe('00:00')
    expect(formatDurationHhMm(9 * MINUTE_MS)).toBe('00:09')
    expect(formatDurationHhMm(93 * MINUTE_MS)).toBe('01:33')
    expect(formatDurationHhMm(30 * HOUR_MS)).toBe('30:00')
    expect(formatDurationHhMm(100 * HOUR_MS + 5 * MINUTE_MS)).toBe('100:05')
  })

  it('drops partial minutes instead of rounding up', () => {
    expect(formatDurationHhMm(59_999)).toBe('00:00')
    expect(formatDurationHhMm(2 * MINUTE_MS - 1)).toBe('00:01')
  })

  it('clamps negatives to zero', () => {
    expect(formatDurationHhMm(-5000)).toBe('00:00')
  })
})

describe('clock formatting', () => {
  it('formats 24-hour times for the CSV', () => {
    expect(formatTime24(AT)).toBe('09:14')
    expect(formatTime24(new Date(2026, 8, 15, 15, 7).getTime())).toBe('15:07')
    expect(formatTime24(new Date(2026, 8, 15, 0, 3).getTime())).toBe('00:03')
  })

  it('formats 12-hour times for the UI, with noon and midnight as 12', () => {
    expect(formatTime12(AT)).toBe('9:14 AM')
    expect(formatTime12(new Date(2026, 8, 15, 12, 0).getTime())).toBe('12:00 PM')
    expect(formatTime12(new Date(2026, 8, 15, 0, 5).getTime())).toBe('12:05 AM')
    expect(formatTime12(new Date(2026, 8, 15, 23, 45).getTime())).toBe('11:45 PM')
  })

  it('formats the local calendar date, not the UTC one', () => {
    // 21:30 local on 9/15 is already 9/16 in UTC.
    expect(formatDateISO(new Date(2026, 8, 15, 21, 30).getTime())).toBe('2026-09-15')
    expect(formatDateISO(new Date(2026, 0, 5, 0, 30).getTime())).toBe('2026-01-05')
  })
})

describe('local day helpers', () => {
  it('finds the start and end of the local day', () => {
    expect(new Date(startOfLocalDay(AT)).getHours()).toBe(0)
    expect(formatDateISO(startOfLocalDay(AT))).toBe('2026-09-15')
    expect(endOfLocalDay(AT) - startOfLocalDay(AT)).toBe(DAY_MS - 1)
  })

  it('compares local days across a midnight boundary', () => {
    const late = new Date(2026, 8, 15, 23, 50).getTime()
    const early = new Date(2026, 8, 16, 0, 10).getTime()
    expect(isSameLocalDay(late, early)).toBe(false)
    expect(isSameLocalDay(late, late + 5 * MINUTE_MS)).toBe(true)
  })

  it('builds a wall-clock time on the same day', () => {
    expect(formatTime24(localTimeOnDay(AT, 16))).toBe('16:00')
    expect(formatDateISO(localTimeOnDay(AT, 16))).toBe('2026-09-15')
  })

  it('keeps a day 24 hours long in wall-clock terms across a DST change', () => {
    // 2026-11-01 is the fall-back date in America/New_York: 25 real hours.
    const dstDay = new Date(2026, 10, 1, 12).getTime()
    expect(endOfLocalDay(dstDay) - startOfLocalDay(dstDay)).toBe(DAY_MS + HOUR_MS - 1)
    expect(formatTime24(localTimeOnDay(dstDay, 16))).toBe('16:00')
  })
})

describe('parsing', () => {
  it('parses YYYY-MM-DD to local midnight', () => {
    const parsed = parseISODateLocal('2026-09-15')
    expect(parsed).not.toBeNull()
    expect(formatDateISO(parsed as number)).toBe('2026-09-15')
    expect(new Date(parsed as number).getHours()).toBe(0)
  })

  it('rejects malformed and overflowing dates', () => {
    for (const value of ['', '2026-9-15', '2026-13-01', '2026-02-30', 'nope']) {
      expect(parseISODateLocal(value)).toBeNull()
    }
  })

  it('parses HH:mm onto a given day', () => {
    const parsed = parseTime24OnDay(AT, '15:07')
    expect(formatTime24(parsed as number)).toBe('15:07')
    expect(formatDateISO(parsed as number)).toBe('2026-09-15')
    expect(parseTime24OnDay(AT, '9:05')).not.toBeNull()
  })

  it('rejects out-of-range times', () => {
    for (const value of ['24:00', '12:60', '1215', '']) {
      expect(parseTime24OnDay(AT, value)).toBeNull()
    }
  })
})
