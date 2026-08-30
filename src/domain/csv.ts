import type { Session, Student } from '../db/types'
import {
  formatDateISO,
  formatDurationHhMm,
  formatTime24,
  sessionDurationMs,
} from './time'

/**
 * RFC 4180 field escaping. Quotes any field containing a comma, quote, or
 * newline; a leading `=`, `+`, `-`, or `@` is also quoted and prefixed so a
 * spreadsheet reads it as text rather than a formula.
 */
export function escapeCsvField(value: string): string {
  const risky = /^[=+\-@\t\r]/.test(value)
  const body = risky ? `'${value}` : value
  return /[",\n\r]/.test(body) || risky ? `"${body.replaceAll('"', '""')}"` : body
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(escapeCsvField).join(',')).join('\r\n')
}

export const SESSION_CSV_HEADERS = [
  'Last Name',
  'First Name',
  'Grade',
  'Student ID',
  'Date',
  'Check In',
  'Check Out',
  'Duration',
  'Needs Review',
] as const

export const SUMMARY_CSV_HEADERS = [
  'Last Name',
  'First Name',
  'Grade',
  'Student ID',
  'Sessions',
  'Total Duration',
] as const

export interface ExportInput {
  sessions: readonly Session[]
  students: readonly Student[]
  /** Used to price open sessions; they export with a blank check-out. */
  now: number
}

function studentIndex(students: readonly Student[]): Map<string, Student> {
  return new Map(students.map((s) => [s.id, s]))
}

function sortSessions(
  sessions: readonly Session[],
  byStudent: Map<string, Student>,
): Session[] {
  return [...sessions].sort((a, b) => {
    const sa = byStudent.get(a.studentId)
    const sb = byStudent.get(b.studentId)
    return (
      a.checkInAt - b.checkInAt ||
      (sa?.lastName ?? '').localeCompare(sb?.lastName ?? '') ||
      (sa?.firstName ?? '').localeCompare(sb?.firstName ?? '')
    )
  })
}

/**
 * One row per session, ordered by check-in. A session that crosses midnight
 * exports on its check-in date. Sessions still open at export time keep their
 * blank check-out rather than being invented a duration, and are flagged in
 * the Needs Review column so the gaps are visible in the spreadsheet.
 */
export function buildSessionRows(input: ExportInput): string[][] {
  const byStudent = studentIndex(input.students)
  const rows: string[][] = [[...SESSION_CSV_HEADERS]]
  for (const session of sortSessions(input.sessions, byStudent)) {
    const student = byStudent.get(session.studentId)
    if (!student) continue // Hard-deleted student; their sessions went with them.
    const closed = session.checkOutAt !== null
    rows.push([
      student.lastName,
      student.firstName,
      student.grade,
      student.studentId ?? '',
      formatDateISO(session.checkInAt),
      formatTime24(session.checkInAt),
      closed ? formatTime24(session.checkOutAt as number) : '',
      closed
        ? formatDurationHhMm(
            session.durationMs ?? sessionDurationMs(session.checkInAt, session.checkOutAt, input.now),
          )
        : '',
      session.needsReview ? 'yes' : '',
    ])
  }
  return rows
}

export function buildSessionCsv(input: ExportInput): string {
  return toCsv(buildSessionRows(input))
}

/**
 * One row per student with total time across the range. Students with no
 * sessions in the range are omitted — the range is the question being asked.
 */
export function buildSummaryRows(input: ExportInput): string[][] {
  const byStudent = studentIndex(input.students)
  const totals = new Map<string, { count: number; totalMs: number }>()
  for (const session of input.sessions) {
    if (!byStudent.has(session.studentId)) continue
    const entry = totals.get(session.studentId) ?? { count: 0, totalMs: 0 }
    entry.count += 1
    entry.totalMs +=
      session.checkOutAt === null
        ? 0
        : (session.durationMs ?? session.checkOutAt - session.checkInAt)
    totals.set(session.studentId, entry)
  }

  const rows: string[][] = [[...SUMMARY_CSV_HEADERS]]
  const ordered = [...totals.entries()]
    .map(([studentId, entry]) => ({ student: byStudent.get(studentId) as Student, entry }))
    .sort(
      (a, b) =>
        a.student.lastName.localeCompare(b.student.lastName) ||
        a.student.firstName.localeCompare(b.student.firstName),
    )
  for (const { student, entry } of ordered) {
    rows.push([
      student.lastName,
      student.firstName,
      student.grade,
      student.studentId ?? '',
      String(entry.count),
      formatDurationHhMm(entry.totalMs),
    ])
  }
  return rows
}

export function buildSummaryCsv(input: ExportInput): string {
  return toCsv(buildSummaryRows(input))
}

/** Row count shown in the export preview, excluding the header. */
export function countExportRows(rows: readonly unknown[]): number {
  return Math.max(0, rows.length - 1)
}

/** e.g. "period-3-biology_2026-09-01_2026-09-30_sessions.csv" */
export function exportFileName(
  className: string,
  fromAt: number,
  toAt: number,
  mode: 'sessions' | 'summary',
): string {
  const slug =
    className
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'class'
  return `${slug}_${formatDateISO(fromAt)}_${formatDateISO(toAt)}_${mode}.csv`
}
