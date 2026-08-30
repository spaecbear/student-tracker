import { newId, withDB } from './schema'
import type { EpochMs, Teacher } from './types'

export type NewTeacher = Omit<Teacher, 'id' | 'createdAt'>

/**
 * Creates a teacher account.
 *
 * A device can hold several — a classroom shared by two teachers across
 * different periods is the case this exists for. Each account owns its own
 * classes and can neither see nor touch another's roster.
 *
 * Creating a second account is gated in the UI behind proof of existing
 * access, so the sign-in screen cannot be used to walk around the password.
 */
export async function createTeacher(input: NewTeacher, now: EpochMs): Promise<Teacher> {
  const teacher: Teacher = { ...input, id: newId(), createdAt: now }
  await withDB('create teacher', (db) => db.put('teachers', teacher))
  return teacher
}

/** Every account on this device, oldest first. */
export async function listTeachers(): Promise<Teacher[]> {
  const all = await withDB('list teachers', (db) => db.getAll('teachers'))
  return [...all].sort((a, b) => a.createdAt - b.createdAt)
}

export function getTeacher(id: string): Promise<Teacher | undefined> {
  return withDB('get teacher', (db) => db.get('teachers', id))
}

/** The first account set up on this device, if any. */
export async function getPrimaryTeacher(): Promise<Teacher | undefined> {
  const all = await withDB('list teachers', (db) => db.getAll('teachers'))
  return [...all].sort((a, b) => a.createdAt - b.createdAt)[0]
}

export async function updateTeacher(
  id: string,
  patch: Partial<Omit<Teacher, 'id' | 'createdAt'>>,
): Promise<Teacher> {
  return withDB('update teacher', async (db) => {
    const existing = await db.get('teachers', id)
    if (!existing) throw new Error(`No teacher with id ${id}`)
    const updated: Teacher = { ...existing, ...patch }
    await db.put('teachers', updated)
    return updated
  })
}
