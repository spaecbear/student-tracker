import type { Session, Student } from '../db/types'
import { isSameLocalDay, sessionDurationMs } from './time'

/** The open session for a student, if any. Open means `checkOutAt === null`. */
export function findOpenSessionFor(
  studentId: string,
  sessions: readonly Session[],
): Session | undefined {
  return sessions.find((s) => s.studentId === studentId && s.checkOutAt === null)
}

export function isOpen(session: Session): boolean {
  return session.checkOutAt === null
}

/**
 * Sessions left open past their own day — a student checked in and never
 * checked out. A session opened today is never abandoned, however long it has
 * been running: the student may well still be in the room.
 *
 * These are not closed automatically. The app has no idea when the student
 * actually left, and a guessed time recorded as fact is worse than a gap the
 * teacher can see and fix.
 */
export function findAbandonedSessions(sessions: readonly Session[], now: number): Session[] {
  return sessions.filter((s) => isOpen(s) && !isSameLocalDay(s.checkInAt, now))
}

/**
 * A session waiting on the teacher. Usually one with no check-out at all, but
 * a v1 database's guessed check-out times are flagged too, so the flag itself
 * is the answer rather than anything derived from the timestamps.
 */
export function needsReview(session: Session): boolean {
  return session.needsReview
}

export interface StudentCard {
  student: Student
  /** Present only for students in the In column. */
  openSession: Session | null
  /** Live elapsed time for an open session, else total time today. */
  durationMs: number
}

export interface RosterColumns {
  out: StudentCard[]
  in: StudentCard[]
}

function byLastName(a: StudentCard, b: StudentCard): number {
  return (
    a.student.lastName.localeCompare(b.student.lastName) ||
    a.student.firstName.localeCompare(b.student.firstName)
  )
}

/** Total time a student has accumulated on the local day containing `now`. */
export function totalTimeToday(
  studentId: string,
  sessions: readonly Session[],
  now: number,
): number {
  return sessions
    .filter((s) => s.studentId === studentId && isSameLocalDay(s.checkInAt, now))
    .reduce((total, s) => total + sessionDurationMs(s.checkInAt, s.checkOutAt, now), 0)
}

/**
 * Splits an active roster into the Out and In columns, each sorted by last
 * name. Durations are always derived from `now`, never accumulated.
 */
export function buildRosterColumns(
  students: readonly Student[],
  sessions: readonly Session[],
  now: number,
): RosterColumns {
  const columns: RosterColumns = { out: [], in: [] }
  for (const student of students) {
    if (!student.active) continue
    const openSession = findOpenSessionFor(student.id, sessions) ?? null
    const card: StudentCard = {
      student,
      openSession,
      durationMs: openSession
        ? sessionDurationMs(openSession.checkInAt, null, now)
        : totalTimeToday(student.id, sessions, now),
    }
    if (openSession) columns.in.push(card)
    else columns.out.push(card)
  }
  columns.out.sort(byLastName)
  columns.in.sort(byLastName)
  return columns
}
