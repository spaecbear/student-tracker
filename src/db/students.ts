import { newId, withDB } from './schema'
import type { EpochMs, Student } from './types'

export type NewStudent = Omit<Student, 'id' | 'createdAt' | 'active'> & { active?: boolean }

function byName(a: Student, b: Student): number {
  return (
    a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
  )
}

export async function createStudent(input: NewStudent, now: EpochMs): Promise<Student> {
  const record: Student = { active: true, ...input, id: newId(), createdAt: now }
  await withDB('create student', (db) => db.put('students', record))
  return record
}

/** Bulk insert in one transaction so a partial roster import cannot half-apply. */
export async function createStudents(inputs: NewStudent[], now: EpochMs): Promise<Student[]> {
  const records: Student[] = inputs.map((input) => ({
    active: true,
    ...input,
    id: newId(),
    createdAt: now,
  }))
  await withDB('bulk create students', async (db) => {
    const tx = db.transaction('students', 'readwrite')
    await Promise.all([...records.map((r) => tx.store.put(r)), tx.done])
  })
  return records
}

export function getStudent(id: string): Promise<Student | undefined> {
  return withDB('get student', (db) => db.get('students', id))
}

/** Roster for a class, sorted by last name. Soft-deleted students are excluded by default. */
export async function listStudents(
  classId: string,
  options: { includeInactive?: boolean } = {},
): Promise<Student[]> {
  const rows = await withDB('list students', (db) =>
    db.getAllFromIndex('students', 'by-class', classId),
  )
  const visible = options.includeInactive ? rows : rows.filter((s) => s.active)
  return visible.sort(byName)
}

export async function updateStudent(
  id: string,
  patch: Partial<Omit<Student, 'id' | 'createdAt'>>,
): Promise<Student> {
  return withDB('update student', async (db) => {
    const existing = await db.get('students', id)
    if (!existing) throw new Error(`No student with id ${id}`)
    const updated: Student = { ...existing, ...patch }
    await db.put('students', updated)
    return updated
  })
}

/** Soft delete: the card disappears, the session history stays intact. */
export function deactivateStudent(id: string): Promise<Student> {
  return updateStudent(id, { active: false })
}

export function reactivateStudent(id: string): Promise<Student> {
  return updateStudent(id, { active: true })
}

/**
 * Hard delete. Removes the student and every session they own.
 * Only ever called behind an explicit confirmation in the teacher view.
 */
export async function deleteStudentPermanently(id: string): Promise<void> {
  await withDB('permanently delete student', async (db) => {
    const tx = db.transaction(['students', 'sessions'], 'readwrite')
    const sessionStore = tx.objectStore('sessions')
    const index = sessionStore.index('by-student-open')
    const keys = await index.getAllKeys(IDBKeyRange.bound([id, 0], [id, 1]))
    await Promise.all([
      ...keys.map((key) => sessionStore.delete(key)),
      tx.objectStore('students').delete(id),
      tx.done,
    ])
  })
}
