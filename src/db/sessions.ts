import {
  DataError,
  db,
  fetchAll,
  isUniqueViolation,
  newId,
  run,
  sessionToRow,
  toSession,
  type SessionRow,
} from './schema'
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
  readonly session: Session | undefined

  constructor(session?: Session) {
    super('That student already has an open session.')
    this.session = session
  }
}

/**
 * Opens a session. Rejects if one is already open for the student — the UI
 * makes this unreachable (a checked-in card lives in the In column), but the
 * database refuses to create the ambiguity regardless, even across two devices.
 */
export async function checkIn(input: CheckInInput): Promise<Session> {
  const session: Session = {
    id: newId(),
    studentId: input.studentId,
    classId: input.classId,
    schoolYear: input.schoolYear,
    checkInAt: input.checkInAt,
    checkOutAt: null,
    durationMs: null,
    needsReview: false,
  }
  try {
    await run('check in', db().from('sessions').insert(sessionToRow(session)))
  } catch (error) {
    if (isUniqueViolation(error)) throw new AlreadyCheckedInError(await findOpenSession(input.studentId))
    throw error
  }
  return session
}

/** Closes a session and stores its duration for fast export. */
export async function checkOut(sessionId: string, checkOutAt: EpochMs): Promise<Session> {
  const existing = await getSession(sessionId)
  if (!existing) throw new Error(`No session with id ${sessionId}`)
  const closed: Session = {
    ...existing,
    checkOutAt,
    durationMs: checkOutAt - existing.checkInAt,
    // Closing it is the review.
    needsReview: false,
  }
  await run('check out', db().from('sessions').update(sessionToRow(closed)).eq('id', sessionId))
  return closed
}

/**
 * Marks a session that was left open past its own day. It stays unclosed —
 * the app does not invent a check-out time — but it stops counting as the
 * student's active session, so the card wall is clean the next morning and
 * the student can check in again. The teacher enters the real time later.
 */
export async function flagForReview(sessionId: string): Promise<Session> {
  const existing = await getSession(sessionId)
  if (!existing) throw new Error(`No session with id ${sessionId}`)
  const flagged: Session = { ...existing, needsReview: true }
  await run(
    'flag session for review',
    db().from('sessions').update({ needs_review: true }).eq('id', sessionId),
  )
  return flagged
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
  }
  await run('create manual session', db().from('sessions').insert(sessionToRow(session)))
  return session
}

export async function getSession(id: string): Promise<Session | undefined> {
  const row = await run(
    'get session',
    db().from('sessions').select('*').eq('id', id).maybeSingle<SessionRow>(),
  )
  return row ? toSession(row) : undefined
}

export async function findOpenSession(studentId: string): Promise<Session | undefined> {
  const row = await run(
    'find open session',
    db()
      .from('sessions')
      .select('*')
      .eq('student_id', studentId)
      .is('check_out_at', null)
      .eq('needs_review', false)
      .maybeSingle<SessionRow>(),
  )
  return row ? toSession(row) : undefined
}

/** Every currently open session in a class, for the In column. */
export async function listOpenSessions(classId: string): Promise<Session[]> {
  const rows = await fetchAll('list open sessions', (from, to) =>
    db()
      .from('sessions')
      .select('*')
      .eq('class_id', classId)
      .is('check_out_at', null)
      .eq('needs_review', false)
      .order('id')
      .range(from, to)
      .returns<SessionRow[]>(),
  )
  return rows.map(toSession)
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
  const rows = await fetchAll('list sessions in range', (from, to) =>
    db()
      .from('sessions')
      .select('*')
      .eq('class_id', classId)
      .gte('check_in_at', fromAt)
      .lte('check_in_at', toAt)
      .order('check_in_at')
      .order('id')
      .range(from, to)
      .returns<SessionRow[]>(),
  )
  return rows.map(toSession)
}

/** Active sessions across every class, used by the abandoned-session sweep on launch. */
export async function listAllOpenSessions(): Promise<Session[]> {
  const rows = await fetchAll('list all open sessions', (from, to) =>
    db()
      .from('sessions')
      .select('*')
      .is('check_out_at', null)
      .eq('needs_review', false)
      .order('id')
      .range(from, to)
      .returns<SessionRow[]>(),
  )
  return rows.map(toSession)
}

/**
 * Sessions in a class still waiting for the teacher to supply a real time.
 * Ordered oldest first, since the oldest is the one most likely forgotten.
 */
export async function listSessionsNeedingReview(classId: string): Promise<Session[]> {
  const rows = await fetchAll('list sessions needing review', (from, to) =>
    db()
      .from('sessions')
      .select('*')
      .eq('class_id', classId)
      .eq('needs_review', true)
      .order('check_in_at')
      .order('id')
      .range(from, to)
      .returns<SessionRow[]>(),
  )
  return rows.map(toSession)
}

export async function listSessionsForSchoolYear(schoolYear: SchoolYear): Promise<Session[]> {
  const rows = await fetchAll('list sessions for school year', (from, to) =>
    db()
      .from('sessions')
      .select('*')
      .eq('school_year', schoolYear)
      .order('check_in_at')
      .order('id')
      .range(from, to)
      .returns<SessionRow[]>(),
  )
  return rows.map(toSession)
}

export type SessionCorrection = Pick<Session, 'checkInAt' | 'checkOutAt'>

/**
 * Teacher-side correction of a session's times — the fix for a missed tap at
 * either end. Duration and the review flag are always re-derived here so they
 * cannot drift from the timestamps.
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
  const existing = await getSession(id)
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
  }
  try {
    await run('correct session', db().from('sessions').update(sessionToRow(updated)).eq('id', id))
  } catch (error) {
    // Reopening would make a second active session for the same student.
    if (isUniqueViolation(error)) throw new AlreadyCheckedInError(await findOpenSession(existing.studentId))
    throw error
  }
  return updated
}

export async function deleteSession(id: string): Promise<void> {
  await run('delete session', db().from('sessions').delete().eq('id', id))
}

/** Year-end purge. Only ever called after an export the teacher has confirmed. */
export async function deleteSchoolYearSessions(schoolYear: SchoolYear): Promise<number> {
  const rows = await run(
    'purge school year sessions',
    db().from('sessions').delete().eq('school_year', schoolYear).select('id').returns<{ id: string }[]>(),
  )
  return rows.length
}
