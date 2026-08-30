import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { ErrorBanner } from '../../components/ErrorBanner'
import { Field } from '../../components/Field'
import { Modal } from '../../components/Modal'
import {
  StorageError,
  createStudent,
  createStudents,
  deactivateStudent,
  deleteStudentPermanently,
  listStudents,
  reactivateStudent,
  updateStudent,
  type Student,
} from '../../db'
import { parseRosterText, partitionNewStudents, type ParsedStudent } from '../../domain'

interface Props {
  classId: string
  onChanged: () => void
}

const BLANK = { firstName: '', lastName: '', grade: '', studentId: '' }

export function RosterPanel({ classId, onChanged }: Props) {
  const [students, setStudents] = useState<Student[]>([])
  const [error, setError] = useState<StorageError | null>(null)
  const [draft, setDraft] = useState(BLANK)
  const [editing, setEditing] = useState<Student | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<Student | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)

  const fail = useCallback((cause: unknown) => {
    setError(
      cause instanceof StorageError ? cause : new StorageError('Could not update the roster.', cause),
    )
  }, [])

  const reload = useCallback(async () => {
    try {
      setStudents(await listStudents(classId, { includeInactive: true }))
      setError(null)
    } catch (cause) {
      fail(cause)
    }
  }, [classId, fail])

  useEffect(() => {
    void reload()
  }, [reload])

  const afterWrite = useCallback(async () => {
    await reload()
    onChanged()
  }, [reload, onChanged])

  async function addOne(event: FormEvent) {
    event.preventDefault()
    if (!draft.firstName.trim() || !draft.lastName.trim()) return
    try {
      await createStudent(
        {
          classId,
          firstName: draft.firstName.trim(),
          lastName: draft.lastName.trim(),
          grade: draft.grade.trim(),
          ...(draft.studentId.trim() ? { studentId: draft.studentId.trim() } : {}),
        },
        Date.now(),
      )
      setDraft(BLANK)
      await afterWrite()
    } catch (cause) {
      fail(cause)
    }
  }

  const active = students.filter((s) => s.active)
  const inactive = students.filter((s) => !s.active)

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <ErrorBanner
          message="The roster could not be updated."
          detail={error.message}
          onRetry={() => void reload()}
          onDismiss={() => setError(null)}
        />
      )}

      <form
        onSubmit={addOne}
        className="flex flex-wrap items-end gap-3 rounded-2xl border p-4"
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <Field
          label="First name"
          value={draft.firstName}
          onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
          className="min-w-40 flex-1"
        />
        <Field
          label="Last name"
          value={draft.lastName}
          onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
          className="min-w-40 flex-1"
        />
        <Field
          label="Grade"
          value={draft.grade}
          onChange={(e) => setDraft({ ...draft, grade: e.target.value })}
          className="w-24"
        />
        <Field
          label="Student ID"
          value={draft.studentId}
          onChange={(e) => setDraft({ ...draft, studentId: e.target.value })}
          className="w-36"
        />
        <Button type="submit" variant="primary">
          Add student
        </Button>
        <Button type="button" onClick={() => setBulkOpen(true)}>
          Paste a list
        </Button>
      </form>

      <RosterTable
        heading={`On the roster (${active.length})`}
        students={active}
        onEdit={setEditing}
        onToggle={async (student) => {
          try {
            await deactivateStudent(student.id)
            await afterWrite()
          } catch (cause) {
            fail(cause)
          }
        }}
        toggleLabel="Remove"
        onDelete={setConfirmingDelete}
      />

      {inactive.length > 0 && (
        <RosterTable
          heading={`Removed (${inactive.length})`}
          hint="Removed students keep their past sessions, so old exports stay complete."
          students={inactive}
          onEdit={setEditing}
          onToggle={async (student) => {
            try {
              await reactivateStudent(student.id)
              await afterWrite()
            } catch (cause) {
              fail(cause)
            }
          }}
          toggleLabel="Restore"
          onDelete={setConfirmingDelete}
        />
      )}

      {editing && (
        <EditStudentModal
          student={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            try {
              await updateStudent(editing.id, patch)
              setEditing(null)
              await afterWrite()
            } catch (cause) {
              fail(cause)
            }
          }}
        />
      )}

      {confirmingDelete && (
        <Modal
          title={`Permanently delete ${confirmingDelete.firstName} ${confirmingDelete.lastName}?`}
          description="This also deletes every session they have ever recorded. Past exports will no longer match. This cannot be undone."
          onClose={() => setConfirmingDelete(null)}
          footer={
            <>
              <Button onClick={() => setConfirmingDelete(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  try {
                    await deleteStudentPermanently(confirmingDelete.id)
                    setConfirmingDelete(null)
                    await afterWrite()
                  } catch (cause) {
                    fail(cause)
                  }
                }}
              >
                Delete permanently
              </Button>
            </>
          }
        >
          <p style={{ color: 'var(--text-muted)' }}>
            If you only want them off the card wall, use <strong>Remove</strong> instead — that
            keeps their history intact.
          </p>
        </Modal>
      )}

      {bulkOpen && (
        <BulkAddModal
          existing={students}
          onClose={() => setBulkOpen(false)}
          onAdd={async (toAdd) => {
            try {
              await createStudents(
                toAdd.map((student) => ({
                  classId,
                  firstName: student.firstName,
                  lastName: student.lastName,
                  grade: student.grade,
                  ...(student.studentId ? { studentId: student.studentId } : {}),
                })),
                Date.now(),
              )
              setBulkOpen(false)
              await afterWrite()
            } catch (cause) {
              fail(cause)
            }
          }}
        />
      )}
    </div>
  )
}

interface TableProps {
  heading: string
  hint?: string
  students: Student[]
  onEdit: (student: Student) => void
  onToggle: (student: Student) => void
  toggleLabel: string
  onDelete: (student: Student) => void
}

function RosterTable({ heading, hint, students, onEdit, onToggle, toggleLabel, onDelete }: TableProps) {
  return (
    <section>
      <h3 className="text-sm font-semibold tracking-[0.14em] uppercase">{heading}</h3>
      {hint && (
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </p>
      )}
      {students.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          Nobody here yet.
        </p>
      ) : (
        <ul
          className="mt-3 divide-y overflow-hidden rounded-2xl border"
          style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
        >
          {students.map((student) => (
            <li
              key={student.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {student.lastName}, {student.firstName}
                </span>
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {student.grade ? `Grade ${student.grade}` : 'No grade'}
                  {student.studentId ? ` · ID ${student.studentId}` : ''}
                </span>
              </span>
              <Button onClick={() => onEdit(student)}>Edit</Button>
              <Button onClick={() => onToggle(student)}>{toggleLabel}</Button>
              <Button variant="ghost" onClick={() => onDelete(student)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

interface EditProps {
  student: Student
  onClose: () => void
  onSave: (patch: Partial<Student>) => void
}

function EditStudentModal({ student, onClose, onSave }: EditProps) {
  const [form, setForm] = useState({
    firstName: student.firstName,
    lastName: student.lastName,
    grade: student.grade,
    studentId: student.studentId ?? '',
  })

  return (
    <Modal
      title="Edit student"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() =>
              onSave({
                firstName: form.firstName.trim(),
                lastName: form.lastName.trim(),
                grade: form.grade.trim(),
                studentId: form.studentId.trim() || undefined,
              })
            }
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="First name"
          value={form.firstName}
          onChange={(e) => setForm({ ...form, firstName: e.target.value })}
        />
        <Field
          label="Last name"
          value={form.lastName}
          onChange={(e) => setForm({ ...form, lastName: e.target.value })}
        />
        <Field
          label="Grade"
          value={form.grade}
          onChange={(e) => setForm({ ...form, grade: e.target.value })}
        />
        <Field
          label="Student ID"
          value={form.studentId}
          hint="Optional. Leave blank if your CSV does not need it."
          onChange={(e) => setForm({ ...form, studentId: e.target.value })}
        />
      </div>
    </Modal>
  )
}

interface BulkProps {
  existing: Student[]
  onClose: () => void
  onAdd: (students: ParsedStudent[]) => void
}

function BulkAddModal({ existing, onClose, onAdd }: BulkProps) {
  const [text, setText] = useState('')
  const parsed = parseRosterText(text)
  const { toAdd, duplicates } = partitionNewStudents(parsed.students, existing)

  return (
    <Modal
      title="Paste a list of students"
      description="One student per line. Accepts “Last, First, Grade, ID”, a tab-separated paste from a spreadsheet, or just “First Last”."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={toAdd.length === 0} onClick={() => onAdd(toAdd)}>
            Add {toAdd.length} student{toAdd.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={9}
        aria-label="Student list"
        placeholder={'Alvarez, Maya, 10, 10442\nBrooks, Dev, 10, 10118'}
        className="w-full rounded-xl border p-3.5 font-mono text-sm"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      />

      {text.trim() !== '' && (
        <div className="mt-4 flex flex-col gap-2 text-sm">
          <p>
            <strong>{toAdd.length}</strong> to add
            {duplicates.length > 0 && `, ${duplicates.length} already on the roster (skipped)`}
          </p>
          {parsed.errors.length > 0 && (
            <ul className="flex flex-col gap-1" style={{ color: 'var(--danger)' }}>
              {parsed.errors.map((problem) => (
                <li key={problem.line}>
                  Line {problem.line}: {problem.message} <code>{problem.text}</code>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  )
}
