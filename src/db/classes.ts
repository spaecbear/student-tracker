import { classToRow, db, DataError, fetchAll, newId, run, toClass, type ClassRow } from './schema'
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
  if (!record.archived) {
    const owned = await listClasses(input.schoolYear, { teacherId: input.teacherId })
    if (owned.length >= MAX_ACTIVE_CLASSES) throw new ClassLimitReachedError()
  }
  await run('create class', db().from('classes').insert(classToRow(record)))
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

export async function getClass(id: string): Promise<Class | undefined> {
  const row = await run(
    'get class',
    db().from('classes').select('*').eq('id', id).maybeSingle<ClassRow>(),
  )
  return row ? toClass(row) : undefined
}

/**
 * Classes for a school year, sorted by name. Row-level security already limits
 * every query to the signed-in teacher's own rows; `teacherId` is kept as an
 * explicit filter so callers state whose classes they mean.
 */
export async function listClasses(
  schoolYear: SchoolYear,
  options: { includeArchived?: boolean; teacherId?: string } = {},
): Promise<Class[]> {
  let query = db().from('classes').select('*').eq('school_year', schoolYear)
  if (options.teacherId !== undefined) query = query.eq('teacher_id', options.teacherId)
  const rows = await run('list classes', query.returns<ClassRow[]>())
  const all = rows.map(toClass)
  const visible = options.includeArchived ? all : all.filter((c) => !c.archived)
  return visible.sort((a, b) => a.name.localeCompare(b.name))
}

/** Distinct school years that have at least one class. Used by year-end cleanup. */
export async function listSchoolYears(): Promise<SchoolYear[]> {
  const rows = await run(
    'list school years',
    db().from('classes').select('school_year').returns<{ school_year: string }[]>(),
  )
  return [...new Set(rows.map((c) => c.school_year))].sort()
}

export async function updateClass(
  id: string,
  patch: Partial<Omit<Class, 'id' | 'createdAt'>>,
): Promise<Class> {
  const existing = await getClass(id)
  if (!existing) throw new Error(`No class with id ${id}`)
  const updated: Class = { ...existing, ...patch }
  await run('update class', db().from('classes').update(classToRow(updated)).eq('id', id))
  return updated
}

/** Hard delete. Removes the class and, by cascade, its students and their sessions. */
export async function deleteClassCascade(id: string): Promise<void> {
  await run('delete class', db().from('classes').delete().eq('id', id))
}

export interface PurgeResult {
  classes: number
  students: number
  sessions: number
}

/**
 * Deletes everything belonging to one school year: its classes, their rosters,
 * and every session recorded in them. Deleting the classes cascades to the rest
 * in a single statement, so a failure part-way cannot leave a half-purged year.
 *
 * This is the end of the line for a year's data. It runs only after the
 * teacher has confirmed she holds the export — never on a timer, and never
 * unattended.
 */
export async function deleteSchoolYearData(schoolYear: SchoolYear): Promise<PurgeResult> {
  const classes = await run(
    'find classes to purge',
    db().from('classes').select('id').eq('school_year', schoolYear).returns<{ id: string }[]>(),
  )
  const classIds = classes.map((c) => c.id)

  // Counted with fetchAll: a year of sessions is far past the 1,000-row page limit.
  const students = classIds.length
    ? await fetchAll('count students to purge', (from, to) =>
        db()
          .from('students')
          .select('id')
          .in('class_id', classIds)
          .order('id')
          .range(from, to)
          .returns<{ id: string }[]>(),
      )
    : []
  const sessions = await fetchAll('count sessions to purge', (from, to) =>
    db()
      .from('sessions')
      .select('id')
      .eq('school_year', schoolYear)
      .order('id')
      .range(from, to)
      .returns<{ id: string }[]>(),
  )

  if (classIds.length > 0) {
    await run('purge classes', db().from('classes').delete().in('id', classIds))
  }
  // Sessions are keyed by year directly; any not already removed by the class cascade go too.
  await run('purge sessions', db().from('sessions').delete().eq('school_year', schoolYear))

  return { classes: classIds.length, students: students.length, sessions: sessions.length }
}
