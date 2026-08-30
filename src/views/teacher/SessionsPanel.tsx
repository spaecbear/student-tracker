import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/Button'
import { ErrorBanner } from '../../components/ErrorBanner'
import { Field } from '../../components/Field'
import { Modal } from '../../components/Modal'
import {
  StorageError,
  checkOut,
  correctSession,
  createManualSession,
  deleteSession,
  listSessionsInRange,
  listSessionsNeedingReview,
  listStudents,
  type Session,
  type Student,
} from '../../db'
import {
  endOfLocalDay,
  formatDateISO,
  formatDurationHhMm,
  formatTime12,
  formatTime24,
  parseISODateLocal,
  parseTime24OnDay,
  schoolYearForDate,
  sessionDurationMs,
  startOfLocalDay,
} from '../../domain'

interface Props {
  classId: string
  onChanged: () => void
}

/**
 * Session correction. Students forget to check out, tap the wrong card, and
 * check in twice; without an edit path every mistake is permanent and the CSV
 * stops being trustworthy.
 */
export function SessionsPanel({ classId, onChanged }: Props) {
  const [day, setDay] = useState(() => formatDateISO(Date.now()))
  const [sessions, setSessions] = useState<Session[]>([])
  const [review, setReview] = useState<Session[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [error, setError] = useState<StorageError | null>(null)
  const [editing, setEditing] = useState<Session | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<Session | null>(null)
  const [adding, setAdding] = useState(false)

  const dayAt = parseISODateLocal(day)

  const fail = useCallback((cause: unknown) => {
    setError(
      cause instanceof StorageError ? cause : new StorageError('Could not update sessions.', cause),
    )
  }, [])

  const reload = useCallback(async () => {
    if (dayAt === null) return
    try {
      const [rows, pending, roster] = await Promise.all([
        listSessionsInRange(classId, startOfLocalDay(dayAt), endOfLocalDay(dayAt)),
        listSessionsNeedingReview(classId),
        listStudents(classId, { includeInactive: true }),
      ])
      setSessions(rows)
      setReview(pending)
      setStudents(roster)
      setError(null)
    } catch (cause) {
      fail(cause)
    }
  }, [classId, dayAt, fail])

  useEffect(() => {
    void reload()
  }, [reload])

  const afterWrite = useCallback(async () => {
    await reload()
    onChanged()
  }, [reload, onChanged])

  const nameFor = useMemo(() => {
    const byId = new Map(students.map((s) => [s.id, s]))
    return (studentId: string) => {
      const student = byId.get(studentId)
      return student ? `${student.lastName}, ${student.firstName}` : 'Unknown student'
    }
  }, [students])

  const openCount = sessions.filter((s) => s.checkOutAt === null).length

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <ErrorBanner
          message="Sessions could not be updated."
          detail={error.message}
          onRetry={() => void reload()}
          onDismiss={() => setError(null)}
        />
      )}

      {review.length > 0 && (
        <section
          className="rounded-2xl border p-5"
          style={{ borderColor: 'var(--warn-border)', background: 'var(--warn-surface)' }}
        >
          <h3 className="font-semibold" style={{ color: 'var(--warn-text)' }}>
            {review.length} session{review.length === 1 ? '' : 's'} never got a check-out
          </h3>
          <p className="mt-1 text-sm" style={{ color: 'var(--warn-text)' }}>
            These students checked in and left without tapping out. The app will not guess a time —
            set the real one, or delete the session if it should not have existed.
          </p>
          <ul className="mt-4 flex flex-col gap-2">
            {review.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5"
                style={{ borderColor: 'var(--warn-border)', background: 'var(--surface-raised)' }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {nameFor(session.studentId)}
                  </span>
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {formatDateISO(session.checkInAt)} · in at {formatTime12(session.checkInAt)}
                  </span>
                </span>
                <Button onClick={() => setEditing(session)}>Set check-out</Button>
                <Button variant="ghost" onClick={() => setConfirmingDelete(session)}>
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-end gap-4">
        <Field
          label="Day"
          type="date"
          value={day}
          onChange={(event) => setDay(event.target.value)}
          className="w-52"
        />
        <p className="flex-1 pb-2.5 text-sm" style={{ color: 'var(--text-muted)' }}>
          {sessions.length} session{sessions.length === 1 ? '' : 's'}
          {openCount > 0 && ` · ${openCount} still open`}
        </p>
        <Button className="mb-0.5" onClick={() => setAdding(true)}>
          Add a session
        </Button>
      </div>

      {dayAt === null ? (
        <p style={{ color: 'var(--text-muted)' }}>Pick a valid date.</p>
      ) : sessions.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No sessions recorded on this day.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-separate border-spacing-0 text-left">
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                {['Student', 'In', 'Out', 'Duration', ''].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="border-b px-3 py-2 text-xs font-semibold tracking-[0.12em] uppercase"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => {
                const open = session.checkOutAt === null
                return (
                  <tr key={session.id}>
                    <td className="border-b px-3 py-2.5" style={{ borderColor: 'var(--border)' }}>
                      <span className="font-medium">{nameFor(session.studentId)}</span>
                      {session.needsReview && (
                        <span
                          className="ml-2 rounded-full px-2 py-0.5 text-xs"
                          style={{ background: 'var(--warn-surface)', color: 'var(--warn-text)' }}
                        >
                          needs a check-out
                        </span>
                      )}
                    </td>
                    <td
                      className="border-b px-3 py-2.5 tabular-nums"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      {formatTime12(session.checkInAt)}
                    </td>
                    <td
                      className="border-b px-3 py-2.5 tabular-nums"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      {session.checkOutAt !== null ? (
                        formatTime12(session.checkOutAt)
                      ) : session.needsReview ? (
                        <span style={{ color: 'var(--warn-text)' }}>missing</span>
                      ) : (
                        <span style={{ color: 'var(--accent-strong)' }}>still in</span>
                      )}
                    </td>
                    <td
                      className="border-b px-3 py-2.5 tabular-nums"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      {open
                        ? '—'
                        : formatDurationHhMm(
                            session.durationMs ??
                              sessionDurationMs(session.checkInAt, session.checkOutAt, Date.now()),
                          )}
                    </td>
                    <td
                      className="border-b px-3 py-2.5 text-right"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <span className="flex justify-end gap-2">
                        {open && !session.needsReview && (
                          <Button
                            onClick={async () => {
                              try {
                                await checkOut(session.id, Date.now())
                                await afterWrite()
                              } catch (cause) {
                                fail(cause)
                              }
                            }}
                          >
                            Close now
                          </Button>
                        )}
                        <Button onClick={() => setEditing(session)}>Edit</Button>
                        <Button variant="ghost" onClick={() => setConfirmingDelete(session)}>
                          Delete
                        </Button>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EditSessionModal
          session={editing}
          studentName={nameFor(editing.studentId)}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            try {
              await correctSession(editing.id, patch)
              setEditing(null)
              await afterWrite()
            } catch (cause) {
              fail(cause)
            }
          }}
        />
      )}

      {adding && (
        <AddSessionModal
          students={students.filter((student) => student.active)}
          defaultDay={day}
          onClose={() => setAdding(false)}
          onSave={async (entry) => {
            try {
              await createManualSession({
                studentId: entry.studentId,
                classId,
                schoolYear: schoolYearForDate(entry.checkInAt),
                checkInAt: entry.checkInAt,
                checkOutAt: entry.checkOutAt,
              })
              setAdding(false)
              await afterWrite()
            } catch (cause) {
              fail(cause)
            }
          }}
        />
      )}

      {confirmingDelete && (
        <Modal
          title="Delete this session?"
          description="Use this for a session that should never have existed — a wrong card tapped, or a duplicate."
          onClose={() => setConfirmingDelete(null)}
          footer={
            <>
              <Button onClick={() => setConfirmingDelete(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  try {
                    await deleteSession(confirmingDelete.id)
                    setConfirmingDelete(null)
                    await afterWrite()
                  } catch (cause) {
                    fail(cause)
                  }
                }}
              >
                Delete session
              </Button>
            </>
          }
        >
          <p style={{ color: 'var(--text-muted)' }}>
            {nameFor(confirmingDelete.studentId)} · {formatTime12(confirmingDelete.checkInAt)}
          </p>
        </Modal>
      )}
    </div>
  )
}

interface EditProps {
  session: Session
  studentName: string
  onClose: () => void
  onSave: (patch: { checkInAt?: number; checkOutAt?: number | null }) => void
}

function EditSessionModal({ session, studentName, onClose, onSave }: EditProps) {
  const [inTime, setInTime] = useState(formatTime24(session.checkInAt))
  const [outTime, setOutTime] = useState(
    session.checkOutAt === null ? '' : formatTime24(session.checkOutAt),
  )
  const [problem, setProblem] = useState<string | null>(null)

  function save() {
    const checkInAt = parseTime24OnDay(session.checkInAt, inTime)
    if (checkInAt === null) {
      setProblem('Check-in time must be HH:mm on a 24-hour clock.')
      return
    }
    if (outTime.trim() === '') {
      onSave({ checkInAt, checkOutAt: null })
      return
    }
    // The check-out is placed on the check-in day first; a time that lands
    // before it is treated as the next morning, which is how a session that
    // crosses midnight gets corrected.
    const sameDay = parseTime24OnDay(session.checkInAt, outTime)
    if (sameDay === null) {
      setProblem('Check-out time must be HH:mm on a 24-hour clock.')
      return
    }
    const checkOutAt = sameDay < checkInAt ? sameDay + 86_400_000 : sameDay
    onSave({ checkInAt, checkOutAt })
  }

  return (
    <Modal
      title={session.needsReview ? 'Set the check-out time' : 'Correct this session'}
      description={`${studentName} · ${formatDateISO(session.checkInAt)}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Save times
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Check in (24-hour)"
          value={inTime}
          placeholder="09:14"
          onChange={(event) => setInTime(event.target.value)}
        />
        <Field
          label="Check out (24-hour)"
          value={outTime}
          placeholder="10:47"
          hint="Leave blank to reopen the session. A time earlier than check-in is read as the next morning."
          onChange={(event) => setOutTime(event.target.value)}
        />
        {problem && (
          <p role="alert" className="text-sm font-medium" style={{ color: 'var(--danger)' }}>
            {problem}
          </p>
        )}
      </div>
    </Modal>
  )
}

interface AddProps {
  students: Student[]
  /** The day currently being viewed, used as the default. */
  defaultDay: string
  onClose: () => void
  onSave: (entry: { studentId: string; checkInAt: number; checkOutAt: number | null }) => void
}

/**
 * Records a visit the card wall never saw — a student who forgot to tap in at
 * all, or whose whole session went unrecorded. The times are the teacher's,
 * not the app's.
 */
function AddSessionModal({ students, defaultDay, onClose, onSave }: AddProps) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? '')
  const [day, setDay] = useState(defaultDay)
  const [inTime, setInTime] = useState('')
  const [outTime, setOutTime] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  function save() {
    setProblem(null)
    if (!studentId) {
      setProblem('Pick a student.')
      return
    }
    const dayAt = parseISODateLocal(day)
    if (dayAt === null) {
      setProblem('Pick a valid date.')
      return
    }
    const checkInAt = parseTime24OnDay(dayAt, inTime)
    if (checkInAt === null) {
      setProblem('Check-in time must be HH:mm on a 24-hour clock.')
      return
    }
    if (outTime.trim() === '') {
      onSave({ studentId, checkInAt, checkOutAt: null })
      return
    }
    const sameDay = parseTime24OnDay(dayAt, outTime)
    if (sameDay === null) {
      setProblem('Check-out time must be HH:mm on a 24-hour clock.')
      return
    }
    // Earlier than the check-in means the visit ran past midnight.
    onSave({
      studentId,
      checkInAt,
      checkOutAt: sameDay < checkInAt ? sameDay + 86_400_000 : sameDay,
    })
  }

  return (
    <Modal
      title="Add a session"
      description="For a visit that never made it onto the card wall."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Add session
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Student</span>
          <select
            value={studentId}
            aria-label="Student"
            onChange={(event) => setStudentId(event.target.value)}
            className="min-h-11 w-full rounded-xl border px-3"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.lastName}, {student.firstName}
              </option>
            ))}
          </select>
        </label>
        <Field label="Date" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        <Field
          label="Check in (24-hour)"
          value={inTime}
          placeholder="09:14"
          onChange={(event) => setInTime(event.target.value)}
        />
        <Field
          label="Check out (24-hour)"
          value={outTime}
          placeholder="10:47"
          hint="Leave blank if you do not know it yet — it will sit on the review list."
          onChange={(event) => setOutTime(event.target.value)}
        />
        {problem && (
          <p role="alert" className="text-sm font-medium" style={{ color: 'var(--danger)' }}>
            {problem}
          </p>
        )}
      </div>
    </Modal>
  )
}
