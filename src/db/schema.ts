import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
  type StoreNames,
} from 'idb'
import type { Class, SettingRecord, Session, Student, Teacher } from './types'

export const DB_NAME = 'classroom-time-tracker'
export const DB_VERSION = 2

export interface TrackerDB extends DBSchema {
  teachers: {
    key: string
    value: Teacher
  }
  classes: {
    key: string
    value: Class
    indexes: { 'by-school-year': string }
  }
  students: {
    key: string
    value: Student
    indexes: { 'by-class': string }
  }
  sessions: {
    key: string
    value: Session
    indexes: {
      /** Date-range export within a class. */
      'by-class-checkin': [string, number]
      /** Open-session lookup; see OpenMarker in types.ts. */
      'by-student-open': [string, number]
      /** Year-end purge and year detection. */
      'by-school-year': string
    }
  }
  settings: {
    key: string
    value: SettingRecord
  }
}

/**
 * Base class for deliberate, expected data-layer rejections (as opposed to
 * storage failures). `withDB` lets these through unwrapped.
 */
export class DataError extends Error {}

/** Thrown for any storage failure so callers can surface it instead of swallowing it. */
export class StorageError extends Error {
  override readonly name = 'StorageError'

  constructor(message: string, cause?: unknown) {
    super(message, { cause })
  }
}

let dbPromise: Promise<IDBPDatabase<TrackerDB>> | null = null

function createMigrations(
  db: IDBPDatabase<TrackerDB>,
  oldVersion: number,
  transaction: IDBPTransaction<TrackerDB, StoreNames<TrackerDB>[], 'versionchange'>,
): void {
  if (oldVersion < 1) {
    db.createObjectStore('teachers', { keyPath: 'id' })

    const classes = db.createObjectStore('classes', { keyPath: 'id' })
    classes.createIndex('by-school-year', 'schoolYear')

    const students = db.createObjectStore('students', { keyPath: 'id' })
    students.createIndex('by-class', 'classId')

    const sessions = db.createObjectStore('sessions', { keyPath: 'id' })
    sessions.createIndex('by-class-checkin', ['classId', 'checkInAt'])
    sessions.createIndex('by-student-open', ['studentId', 'openMarker'])
    sessions.createIndex('by-school-year', 'schoolYear')

    db.createObjectStore('settings', { keyPath: 'key' })
  }

  if (oldVersion === 1) {
    // v1 guessed a check-out time for abandoned sessions and recorded it as
    // `autoClosed`. v2 stops guessing: such a session stays open and is flagged
    // for the teacher instead. Any session v1 auto-closed keeps its (guessed)
    // time but is flagged, so those guesses surface for correction rather than
    // silently becoming fact.
    void transaction
      .objectStore('sessions')
      .openCursor()
      .then(async function migrate(cursor): Promise<void> {
        if (!cursor) return
        const legacy = cursor.value as Session & { autoClosed?: boolean }
        const { autoClosed, ...rest } = legacy
        await cursor.update({ ...rest, needsReview: autoClosed === true })
        return migrate(await cursor.continue())
      })
  }
}

export function getDB(): Promise<IDBPDatabase<TrackerDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TrackerDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        createMigrations(db, oldVersion, transaction)
      },
      blocked() {
        console.warn('Database upgrade blocked by another open tab.')
      },
      terminated() {
        // Connection died (eviction, crash). Force a reopen on next access.
        dbPromise = null
      },
    }).catch((error: unknown) => {
      dbPromise = null
      throw new StorageError('Could not open the local database.', error)
    })
  }
  return dbPromise
}

/** Runs `fn` and rewraps any storage failure as a StorageError with context. */
export async function withDB<T>(
  description: string,
  fn: (db: IDBPDatabase<TrackerDB>) => Promise<T>,
): Promise<T> {
  const db = await getDB()
  try {
    return await fn(db)
  } catch (error) {
    if (error instanceof StorageError || error instanceof DataError) throw error
    throw new StorageError(`Storage operation failed: ${description}`, error)
  }
}

/** Closes the cached connection, e.g. before a version upgrade or in tests. */
export async function closeDB(): Promise<void> {
  const pending = dbPromise
  dbPromise = null
  if (!pending) return
  try {
    ;(await pending).close()
  } catch {
    // Already closed or never opened; nothing to release.
  }
}

/** Test-only: drops the cached connection so a fresh DB can be opened. */
export function resetDBConnectionForTests(): void {
  dbPromise = null
}

export function newId(): string {
  return crypto.randomUUID()
}
