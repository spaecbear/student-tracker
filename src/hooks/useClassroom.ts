import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlreadyCheckedInError,
  StorageError,
  checkIn as dbCheckIn,
  checkOut as dbCheckOut,
  flagForReview,
  getSetting,
  listAllOpenSessions,
  listClasses,
  listOpenSessions,
  listSessionsInRange,
  listStudents,
  setSetting,
  type Class,
  type Session,
  type Student,
} from '../db'
import { endOfLocalDay, findAbandonedSessions, schoolYearForDate, startOfLocalDay } from '../domain'

export const ACTIVE_CLASS_SETTING = 'activeClassId'

export type ClassroomStatus = 'loading' | 'ready' | 'empty' | 'error'

export interface Classroom {
  status: ClassroomStatus
  classes: Class[]
  activeClass: Class | null
  students: Student[]
  /** Today's sessions plus any still open, deduplicated. */
  sessions: Session[]
  error: StorageError | null
  selectClass: (classId: string) => void
  checkIn: (studentId: string) => Promise<void>
  checkOut: (sessionId: string) => Promise<void>
  refresh: () => void
  dismissError: () => void
}

function mergeSessions(today: Session[], open: Session[]): Session[] {
  const byId = new Map(today.map((s) => [s.id, s]))
  for (const session of open) byId.set(session.id, session)
  return [...byId.values()]
}

/**
 * Takes sessions left open from an earlier day off the card wall and puts them
 * on the teacher's review list. Runs once per app start, before the roster is
 * read, so the morning never opens on a phantom check-in.
 *
 * Nothing is closed and no time is guessed: the session keeps its blank
 * check-out until the teacher supplies the real one.
 *
 * Deliberately not scoped to the current school year, so a session abandoned
 * in an expired year still surfaces before that year is exported.
 */
async function sweepAbandonedSessions(now: number): Promise<void> {
  const active = await listAllOpenSessions()
  for (const session of findAbandonedSessions(active, now)) {
    await flagForReview(session.id)
  }
}

/**
 * Owns every read and write the student view needs. Components never touch
 * the db layer directly; failures land in `error` rather than being swallowed.
 */
export function useClassroom(): Classroom {
  const [status, setStatus] = useState<ClassroomStatus>('loading')
  const [classes, setClasses] = useState<Class[]>([])
  const [activeClassId, setActiveClassId] = useState<string | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [error, setError] = useState<StorageError | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const sweptRef = useRef(false)

  const refresh = useCallback(() => setReloadToken((n) => n + 1), [])
  const dismissError = useCallback(() => setError(null), [])

  const fail = useCallback((cause: unknown) => {
    setError(
      cause instanceof StorageError
        ? cause
        : new StorageError('Something went wrong talking to the server.', cause),
    )
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const now = Date.now()
        if (!sweptRef.current) {
          sweptRef.current = true
          await sweepAbandonedSessions(now)
        }

        const available = await listClasses(schoolYearForDate(now))
        if (cancelled) return
        setClasses(available)

        if (available.length === 0) {
          setStudents([])
          setSessions([])
          setActiveClassId(null)
          setStatus('empty')
          return
        }

        const stored = await getSetting<string | null>(ACTIVE_CLASS_SETTING, null)
        const active =
          available.find((c) => c.id === stored) ?? (available[0] as Class)
        if (cancelled) return
        setActiveClassId(active.id)

        const [roster, today, open] = await Promise.all([
          listStudents(active.id),
          listSessionsInRange(active.id, startOfLocalDay(now), endOfLocalDay(now)),
          listOpenSessions(active.id),
        ])
        if (cancelled) return
        setStudents(roster)
        setSessions(mergeSessions(today, open))
        setStatus('ready')
      } catch (cause) {
        if (cancelled) return
        fail(cause)
        setStatus('error')
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [reloadToken, activeClassId, fail])

  const selectClass = useCallback(
    (classId: string) => {
      setActiveClassId(classId)
      setStatus('loading')
      void setSetting(ACTIVE_CLASS_SETTING, classId).catch(fail)
    },
    [fail],
  )

  const checkIn = useCallback(
    async (studentId: string) => {
      if (!activeClassId) return
      const now = Date.now()
      try {
        const session = await dbCheckIn({
          studentId,
          classId: activeClassId,
          schoolYear: schoolYearForDate(now),
          checkInAt: now,
        })
        setSessions((prev) => mergeSessions(prev, [session]))
      } catch (cause) {
        // A duplicate check-in means our view is stale, not that anything broke.
        if (cause instanceof AlreadyCheckedInError) refresh()
        else fail(cause)
      }
    },
    [activeClassId, fail, refresh],
  )

  const checkOut = useCallback(
    async (sessionId: string) => {
      try {
        const closed = await dbCheckOut(sessionId, Date.now())
        setSessions((prev) => prev.map((s) => (s.id === closed.id ? closed : s)))
      } catch (cause) {
        fail(cause)
      }
    },
    [fail],
  )

  const activeClass = useMemo(
    () => classes.find((c) => c.id === activeClassId) ?? null,
    [classes, activeClassId],
  )

  return {
    status,
    classes,
    activeClass,
    students,
    sessions,
    error,
    selectClass,
    checkIn,
    checkOut,
    refresh,
    dismissError,
  }
}
