import { DataError, newId, withDB } from './schema'
import type { Class, EpochMs, SchoolYear } from './types'

export type NewClass = Omit<Class, 'id' | 'createdAt' | 'archived'> & { archived?: boolean }

/**
 * Ceiling on active classes per teacher per school year. Seven covers a full
 * teaching load with room to spare; past that the class picker stops being a
 * sensible way to switch. Archived classes do not count — they are out of use.
 */
export const MAX_ACTIVE_CLASSES = 7

export class ClassLimitReachedError extends DataError {
  override readonly name = 'ClassLimitReachedError'

  constructor() {
    super(
      `A school year can hold ${MAX_ACTIVE_CLASSES} active classes. Archive one to add another.`,
    )
  }
}

export async function createClass(input: NewClass, now: EpochMs): Promise<Class> {
  const record: Class = {
    archived: false,
    ...input,
    id: newId(),
    createdAt: now,
  }
  await withDB('create class', async (db) => {
    const tx = db.transaction('classes', 'readwrite')
    const existing = await tx.store.index('by-school-year').getAll(input.schoolYear)
    // Checked inside the transaction so the limit holds even if two creates
    // race, and counted per teacher: one teacher cannot fill another's slots.
    const owned = existing.filter((c) => !c.archived && c.teacherId === input.teacherId)
    if (!record.archived && owned.length >= MAX_ACTIVE_CLASSES) {
      await tx.done
      throw new ClassLimitReachedError()
    }
    await Promise.all([tx.store.put(record), tx.done])
  })
  return record
}

/** How many more active classes this teacher can hold this year. */
export async function remainingClassSlots(
  schoolYear: SchoolYear,
  teacherId: string,
): Promise<number> {
  const rows = await listClasses(schoolYear, { teacherId })
  return Math.max(0, MAX_ACTIVE_CLASSES - rows.length)
}

export function getClass(id: string): Promise<Class | undefined> {
  return withDB('get class', (db) => db.get('classes', id))
}

/**
 * Classes for a school year, sorted by name.
 *
 * Pass `teacherId` to get only that teacher's classes — every teacher-facing
 * screen does, so one teacher never sees another's roster. The student view
 * deliberately does not: the card wall shows whichever class the device is
 * currently set to, whoever owns it.
 */
export async function listClasses(
  schoolYear: SchoolYear,
  options: { includeArchived?: boolean; teacherId?: string } = {},
): Promise<Class[]> {
  const rows = await withDB('list classes', (db) =>
    db.getAllFromIndex('classes', 'by-school-year', schoolYear),
  )
  const owned =
    options.teacherId === undefined
      ? rows
      : rows.filter((c) => c.teacherId === options.teacherId)
  const visible = options.includeArchived ? owned : owned.filter((c) => !c.archived)
  return visible.sort((a, b) => a.name.localeCompare(b.name))
}

/** Distinct school years that have at least one class. Used by year-end cleanup. */
export async function listSchoolYears(): Promise<SchoolYear[]> {
  const rows = await withDB('list school years', (db) => db.getAll('classes'))
  return [...new Set(rows.map((c) => c.schoolYear))].sort()
}

export async function updateClass(
  id: string,
  patch: Partial<Omit<Class, 'id' | 'createdAt'>>,
): Promise<Class> {
  return withDB('update class', async (db) => {
    const existing = await db.get('classes', id)
    if (!existing) throw new Error(`No class with id ${id}`)
    const updated: Class = { ...existing, ...patch }
    await db.put('classes', updated)
    return updated
  })
}

/** Hard delete. Removes the class, its students, and their sessions. */
export async function deleteClassCascade(id: string): Promise<void> {
  await withDB('delete class', async (db) => {
    const tx = db.transaction(['classes', 'students', 'sessions'], 'readwrite')
    const students = await tx.objectStore('students').index('by-class').getAllKeys(id)
    const sessionStore = tx.objectStore('sessions')
    const sessionKeys = await sessionStore
      .index('by-class-checkin')
      .getAllKeys(IDBKeyRange.bound([id, -Infinity], [id, Infinity]))
    await Promise.all([
      ...sessionKeys.map((key) => sessionStore.delete(key)),
      ...students.map((key) => tx.objectStore('students').delete(key)),
      tx.objectStore('classes').delete(id),
      tx.done,
    ])
  })
}

export interface PurgeResult {
  classes: number
  students: number
  sessions: number
}

/**
 * Deletes everything belonging to one school year: its classes, their rosters,
 * and every session recorded in them. One transaction, so a failure part-way
 * cannot leave a half-purged year behind.
 *
 * This is the end of the line for a year's data. It runs only after the
 * teacher has confirmed she holds the export — never on a timer, and never
 * unattended.
 */
export async function deleteSchoolYearData(schoolYear: SchoolYear): Promise<PurgeResult> {
  return withDB('purge school year', async (db) => {
    const tx = db.transaction(['classes', 'students', 'sessions'], 'readwrite')
    const classStore = tx.objectStore('classes')
    const studentStore = tx.objectStore('students')
    const sessionStore = tx.objectStore('sessions')

    const classIds = await classStore.index('by-school-year').getAllKeys(schoolYear)
    const studentKeys = (
      await Promise.all(
        classIds.map((classId) => studentStore.index('by-class').getAllKeys(classId)),
      )
    ).flat()
    // Sessions are keyed by year directly, which also catches any session whose
    // class was deleted earlier in the year.
    const sessionKeys = await sessionStore.index('by-school-year').getAllKeys(schoolYear)

    await Promise.all([
      ...sessionKeys.map((key) => sessionStore.delete(key)),
      ...studentKeys.map((key) => studentStore.delete(key)),
      ...classIds.map((key) => classStore.delete(key)),
      tx.done,
    ])

    return {
      classes: classIds.length,
      students: studentKeys.length,
      sessions: sessionKeys.length,
    }
  })
}
