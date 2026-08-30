import { DataError, newId, withDB } from './schema'
import { isSameLocalDay } from '../domain/time'
import type { EpochMs, SchoolYear, Session } from './types'

export interface CheckInInput {
  studentId: string
  classId: string
  schoolYear: SchoolYear
  checkInAt: EpochMs
}

/** Thrown when a check-in would create a second open session for one student. */
export class AlreadyCheckedInError extends DataError {
  override readonly name = 'AlreadyCheckedInError'
  readonly session: Session

  constructor(session: Session) {
    super('That student already has an open session.')
    this.session = session
  }
}

function openRange(studentId: string): IDBKeyRange {
  return IDBKeyRange.only([studentId, 1])
}

/**
 * Opens a session. Rejects if one is already open for the student — the UI
 * makes this unreachable (a checked-in card lives in the In column), but the
 * data layer refuses to create the ambiguity regardless.
 */
export async function checkIn(input: CheckInInput): Promise<Session> {
  return withDB('check in', async (db) => {
    const tx = db.transaction('sessions', 'readwrite')
    const existing = await tx.store.index('by-student-open').get(openRange(input.studentId))
    if (existing) {
      await tx.done
      throw new AlreadyCheckedInError(existing)
    }
    const session: Session = {
      id: newId(),
      studentId: input.studentId,
      classId: input.classId,
      schoolYear: input.schoolYear,
      checkInAt: input.checkInAt,
      checkOutAt: null,
      durationMs: null,
      needsReview: false,
      openMarker: 1,
    }
    await Promise.all([tx.store.put(session), tx.done])
    return session
  })
}

/** Closes a session and stores its duration for fast export. */
export async function checkOut(sessionId: string, checkOutAt: EpochMs): Promise<Session> {
  return withDB('check out', async (db) => {
    const tx = db.transaction('sessions', 'readwrite')
    const existing = await tx.store.get(sessionId)
    if (!existing) throw new Error(`No session with id ${sessionId}`)
    const closed: Session = {
      ...existing,
      checkOutAt,
      durationMs: checkOutAt - existing.checkInAt,
      // Closing it is the review.
      needsReview: false,
      openMarker: 0,
    }
    await Promise.all([tx.store.put(closed), tx.done])
    return closed
  })
}

/**
 * Marks a session that was left open past its own day. It stays unclosed —
 * the app does not invent a check-out time — but it stops counting as the
 * student's active session, so the card wall is clean the next morning and
 * the student can check in again. The teacher enters the real time later.
 */
export async function flagForReview(sessionId: string): Promise<Session> {
  return withDB('flag session for review', async (db) => {
    const tx = db.transaction('sessions', 'readwrite')
    const existing = await tx.store.get(sessionId)
    if (!existing) throw new Error(`No session with id ${sessionId}`)
    const flagged: Session = { ...existing, needsReview: true, openMarker: 0 }
    await Promise.all([tx.store.put(flagged), tx.done])
    return flagged
  })
}

export interface ManualSessionInput {
  studentId: string
  classId: string
  schoolYear: SchoolYear
  checkInAt: EpochMs
  /** null records a session the teacher will finish later. */
  checkOutAt: EpochMs | null
}

/**
 * Creates a session the teacher entered by hand — for a student who missed
 * the card entirely, or whose whole visit went unrecorded.
 *
 * A manually added session is never the student's active one: it is a record
 * of something that already happened, so it can never collide with a live
 * check-in or strand a card in the wrong column.
 */
export async function createManualSession(input: ManualSessionInput): Promise<Session> {
  const session: Session = {
    id: newId(),
    studentId: input.studentId,
    classId: input.classId,
    schoolYear: input.schoolYear,
    checkInAt: input.checkInAt,
    checkOutAt: input.checkOutAt,
    durationMs: input.checkOutAt === null ? null : input.checkOutAt - input.checkInAt,
    needsReview: input.checkOutAt === null,
    openMarker: 0,
  }
  await withDB('create manual session', (db) => db.put('sessions', session))
  return session
}

export function getSession(id: string): Promise<Session | undefined> {
  return withDB('get session', (db) => db.get('sessions', id))
}

export function findOpenSession(studentId: string): Promise<Session | undefined> {
  return withDB('find open session', (db) =>
    db.getFromIndex('sessions', 'by-student-open', openRange(studentId)),
  )
}

/** Every currently open session in a class, for the In column. */
export async function listOpenSessions(classId: string): Promise<Session[]> {
  const rows = await withDB('list open sessions', (db) =>
    db.getAllFromIndex(
      'sessions',
      'by-class-checkin',
      IDBKeyRange.bound([classId, -Infinity], [classId, Infinity]),
    ),
  )
  return rows.filter((s) => s.openMarker === 1)
}

/**
 * Sessions in a class whose check-in falls within [fromAt, toAt], inclusive.
 * A session that crosses midnight is returned for its check-in date.
 */
export async function listSessionsInRange(
  classId: string,
  fromAt: EpochMs,
  toAt: EpochMs,
): Promise<Session[]> {
  const rows = await withDB('list sessions in range', (db) =>
    db.getAllFromIndex(
      'sessions',
      'by-class-checkin',
      IDBKeyRange.bound([classId, fromAt], [classId, toAt]),
    ),
  )
  return rows.sort((a, b) => a.checkInAt - b.checkInAt)
}

/** Active sessions across every class, used by the abandoned-session sweep on launch. */
export async function listAllOpenSessions(): Promise<Session[]> {
  const rows = await withDB('list all open sessions', (db) => db.getAll('sessions'))
  return rows.filter((s) => s.openMarker === 1)
}

/**
 * Sessions in a class still waiting for the teacher to supply a real time.
 * Ordered oldest first, since the oldest is the one most likely forgotten.
 */
export async function listSessionsNeedingReview(classId: string): Promise<Session[]> {
  const rows = await withDB('list sessions needing review', (db) =>
    db.getAllFromIndex(
      'sessions',
      'by-class-checkin',
      IDBKeyRange.bound([classId, -Infinity], [classId, Infinity]),
    ),
  )
  return rows.filter((s) => s.needsReview).sort((a, b) => a.checkInAt - b.checkInAt)
}

export function listSessionsForSchoolYear(schoolYear: SchoolYear): Promise<Session[]> {
  return withDB('list sessions for school year', (db) =>
    db.getAllFromIndex('sessions', 'by-school-year', schoolYear),
  )
}

export type SessionCorrection = Pick<Session, 'checkInAt' | 'checkOutAt'>

/**
 * Teacher-side correction of a session's times — the fix for a missed tap at
 * either end. Duration, the review flag, and the open marker are always
 * re-derived here so they cannot drift from the timestamps.
 *
 * Giving a session a check-out time resolves it. Clearing one hands it back:
 * it becomes active again if it belongs to today, and goes back on the review
 * list if it does not.
 */
export async function correctSession(
  id: string,
  patch: Partial<SessionCorrection>,
  now: EpochMs = Date.now(),
): Promise<Session> {
  return withDB('correct session', async (db) => {
    const tx = db.transaction('sessions', 'readwrite')
    const existing = await tx.store.get(id)
    if (!existing) throw new Error(`No session with id ${id}`)
    const checkInAt = patch.checkInAt ?? existing.checkInAt
    const checkOutAt = patch.checkOutAt === undefined ? existing.checkOutAt : patch.checkOutAt
    const reopenedToday = checkOutAt === null && isSameLocalDay(checkInAt, now)
    const updated: Session = {
      ...existing,
      checkInAt,
      checkOutAt,
      durationMs: checkOutAt === null ? null : checkOutAt - checkInAt,
      needsReview: checkOutAt === null && !reopenedToday,
      openMarker: reopenedToday ? 1 : 0,
    }
    await Promise.all([tx.store.put(updated), tx.done])
    return updated
  })
}

export async function deleteSession(id: string): Promise<void> {
  await withDB('delete session', (db) => db.delete('sessions', id))
}

/** Year-end purge. Only ever called after an export the teacher has confirmed. */
export async function deleteSchoolYearSessions(schoolYear: SchoolYear): Promise<number> {
  return withDB('purge school year sessions', async (db) => {
    const tx = db.transaction('sessions', 'readwrite')
    const keys = await tx.store.index('by-school-year').getAllKeys(schoolYear)
    await Promise.all([...keys.map((key) => tx.store.delete(key)), tx.done])
    return keys.length
  })
}
