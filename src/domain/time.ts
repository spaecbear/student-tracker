/**
 * Duration and clock math. Every function here takes epoch milliseconds and
 * plain data — no Date mutation, no globals, no `Date.now()`. Callers pass the
 * current time in so this stays deterministic and testable.
 */

export const MINUTE_MS = 60_000
export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000

/** Elapsed time for a session. Open sessions measure against `now`. */
export function sessionDurationMs(
  checkInAt: number,
  checkOutAt: number | null,
  now: number,
): number {
  return Math.max(0, (checkOutAt ?? now) - checkInAt)
}

/**
 * `hh:mm`, zero-padded, hours uncapped (a 30-hour session reads "30:00").
 * Partial minutes are dropped rather than rounded, so a displayed duration
 * never runs ahead of the time actually elapsed.
 */
export function formatDurationHhMm(durationMs: number): string {
  const totalMinutes = Math.floor(Math.max(0, durationMs) / MINUTE_MS)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/** Local 24-hour `HH:mm`. Used in the CSV, where times must sort as text. */
export function formatTime24(at: number): string {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Local 12-hour time for the UI, e.g. "9:14 AM". */
export function formatTime12(at: number): string {
  const d = new Date(at)
  const hours = d.getHours()
  const suffix = hours < 12 ? 'AM' : 'PM'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${hour12}:${String(d.getMinutes()).padStart(2, '0')} ${suffix}`
}

/** Local calendar date as `YYYY-MM-DD`. Never derived from toISOString(). */
export function formatDateISO(at: number): string {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

/** Midnight at the start of the local day containing `at`. */
export function startOfLocalDay(at: number): number {
  const d = new Date(at)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** The last millisecond of the local day containing `at`. */
export function endOfLocalDay(at: number): number {
  const d = new Date(at)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

/** A specific local wall-clock time on the day containing `at`. */
export function localTimeOnDay(at: number, hours: number, minutes = 0): number {
  const d = new Date(at)
  d.setHours(hours, minutes, 0, 0)
  return d.getTime()
}

/** Whether two instants fall on the same local calendar day. */
export function isSameLocalDay(a: number, b: number): boolean {
  return startOfLocalDay(a) === startOfLocalDay(b)
}

/** Parses a `YYYY-MM-DD` date input into local midnight. Returns null if malformed. */
export function parseISODateLocal(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [, year, month, day] = match
  const y = Number(year)
  const m = Number(month)
  const d = Number(day)
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const parsed = new Date(y, m - 1, d)
  // Rejects overflow like 2026-02-30, which Date would roll into March.
  if (parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 || parsed.getDate() !== d) {
    return null
  }
  return parsed.getTime()
}

/** Parses `HH:mm` (24-hour) onto the local day containing `dayAt`. */
export function parseTime24OnDay(dayAt: number, value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [, rawHours, rawMinutes] = match
  const hours = Number(rawHours)
  const minutes = Number(rawMinutes)
  if (hours > 23 || minutes > 59) return null
  return localTimeOnDay(dayAt, hours, minutes)
}
