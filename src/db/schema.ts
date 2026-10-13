import { getSupabase } from '../lib/supabase'
import type { Class, EpochMs, Session, Student } from './types'

/**
 * Base class for deliberate, expected data-layer rejections (as opposed to
 * storage failures). `run` lets these through unwrapped.
 */
export class DataError extends Error {}

/** Thrown for any storage or network failure so callers can surface it instead of swallowing it. */
export class StorageError extends Error {
  override readonly name = 'StorageError'

  constructor(message: string, cause?: unknown) {
    super(message, { cause })
  }
}

interface QueryResult<T> {
  data: T | null
  error: { message: string; code?: string } | null
}

/** Awaits a Supabase query and rewraps any failure as a StorageError with context. */
export async function run<T>(description: string, query: PromiseLike<QueryResult<T>>): Promise<T> {
  let result: QueryResult<T>
  try {
    result = await query
  } catch (cause) {
    throw new StorageError(`Could not reach the server: ${description}`, cause)
  }
  if (result.error) {
    throw new StorageError(`${description} failed: ${result.error.message}`, result.error)
  }
  return result.data as T
}

/** True for the Postgres "unique constraint violated" error. */
export function isUniqueViolation(error: unknown): boolean {
  const cause = error instanceof StorageError ? error.cause : error
  return (cause as { code?: string } | null)?.code === '23505'
}

export function db() {
  return getSupabase()
}

export function newId(): string {
  return crypto.randomUUID()
}

// ---- row <-> record mapping ------------------------------------------------

export interface ClassRow {
  id: string
  teacher_id: string
  name: string
  color_theme: string
  school_year: string
  archived: boolean
  created_at: EpochMs
}

export interface StudentRow {
  id: string
  teacher_id?: string
  class_id: string
  first_name: string
  last_name: string
  grade: string
  student_id: string | null
  active: boolean
  created_at: EpochMs
}

export interface SessionRow {
  id: string
  teacher_id?: string
  student_id: string
  class_id: string
  school_year: string
  check_in_at: EpochMs
  check_out_at: EpochMs | null
  duration_ms: number | null
  needs_review: boolean
}

export function toClass(row: ClassRow): Class {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    name: row.name,
    colorTheme: row.color_theme,
    schoolYear: row.school_year,
    archived: row.archived,
    createdAt: Number(row.created_at),
  }
}

export function classToRow(record: Class): ClassRow {
  return {
    id: record.id,
    teacher_id: record.teacherId,
    name: record.name,
    color_theme: record.colorTheme,
    school_year: record.schoolYear,
    archived: record.archived,
    created_at: record.createdAt,
  }
}

export function toStudent(row: StudentRow): Student {
  return {
    id: row.id,
    classId: row.class_id,
    firstName: row.first_name,
    lastName: row.last_name,
    grade: row.grade,
    ...(row.student_id ? { studentId: row.student_id } : {}),
    active: row.active,
    createdAt: Number(row.created_at),
  }
}

export function studentToRow(record: Student): StudentRow {
  return {
    id: record.id,
    class_id: record.classId,
    first_name: record.firstName,
    last_name: record.lastName,
    grade: record.grade,
    student_id: record.studentId ?? null,
    active: record.active,
    created_at: record.createdAt,
  }
}

export function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    studentId: row.student_id,
    classId: row.class_id,
    schoolYear: row.school_year,
    checkInAt: Number(row.check_in_at),
    checkOutAt: row.check_out_at === null ? null : Number(row.check_out_at),
    durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
    needsReview: row.needs_review,
  }
}

export function sessionToRow(record: Session): SessionRow {
  return {
    id: record.id,
    student_id: record.studentId,
    class_id: record.classId,
    school_year: record.schoolYear,
    check_in_at: record.checkInAt,
    check_out_at: record.checkOutAt,
    duration_ms: record.durationMs,
    needs_review: record.needsReview,
  }
}

const PAGE_SIZE = 1000

/**
 * Reads every row a query matches. The API returns at most 1,000 rows per
 * request, and a year of sessions is several times that, so a plain select
 * would silently truncate an export. `build` must apply a stable `.order()`.
 */
export async function fetchAll<T>(
  description: string,
  build: (from: number, to: number) => PromiseLike<QueryResult<T[]>>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await run(description, build(from, from + PAGE_SIZE - 1))
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}
