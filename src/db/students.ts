import { db, newId, run, studentToRow, toStudent, type StudentRow } from './schema'
import type { EpochMs, Student } from './types'

export type NewStudent = Omit<Student, 'id' | 'createdAt' | 'active'> & { active?: boolean }

function byName(a: Student, b: Student): number {
  return (
    a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
  )
}

function build(input: NewStudent, now: EpochMs): Student {
  return { active: true, ...input, id: newId(), createdAt: now }
}

export async function createStudent(input: NewStudent, now: EpochMs): Promise<Student> {
  const record = build(input, now)
  await run('create student', db().from('students').insert(studentToRow(record)))
  return record
}

/** Bulk insert as one statement, so a partial roster import cannot half-apply. */
export async function createStudents(inputs: NewStudent[], now: EpochMs): Promise<Student[]> {
  const records = inputs.map((input) => build(input, now))
  if (records.length > 0) {
    await run('bulk create students', db().from('students').insert(records.map(studentToRow)))
  }
  return records
}

export async function getStudent(id: string): Promise<Student | undefined> {
  const row = await run(
    'get student',
    db().from('students').select('*').eq('id', id).maybeSingle<StudentRow>(),
  )
  return row ? toStudent(row) : undefined
}

/** Roster for a class, sorted by last name. Soft-deleted students are excluded by default. */
export async function listStudents(
  classId: string,
  options: { includeInactive?: boolean } = {},
): Promise<Student[]> {
  const rows = await run(
    'list students',
    db().from('students').select('*').eq('class_id', classId).returns<StudentRow[]>(),
  )
  const all = rows.map(toStudent)
  return (options.includeInactive ? all : all.filter((s) => s.active)).sort(byName)
}

export async function updateStudent(
  id: string,
  patch: Partial<Omit<Student, 'id' | 'createdAt'>>,
): Promise<Student> {
  const existing = await getStudent(id)
  if (!existing) throw new Error(`No student with id ${id}`)
  const updated: Student = { ...existing, ...patch }
  await run('update student', db().from('students').update(studentToRow(updated)).eq('id', id))
  return updated
}

/** Soft delete: the card disappears, the session history stays intact. */
export function deactivateStudent(id: string): Promise<Student> {
  return updateStudent(id, { active: false })
}

export function reactivateStudent(id: string): Promise<Student> {
  return updateStudent(id, { active: true })
}

/**
 * Hard delete. Removes the student and, by cascade, every session they own.
 * Only ever called behind an explicit confirmation in the teacher view.
 */
export async function deleteStudentPermanently(id: string): Promise<void> {
  await run('permanently delete student', db().from('students').delete().eq('id', id))
}
