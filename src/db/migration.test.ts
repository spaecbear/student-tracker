import { openDB } from 'idb'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { DB_NAME, closeDB, resetDBConnectionForTests } from './schema'
import { getSession, listSessionsNeedingReview } from './sessions'
import { listStudents } from './students'

const T0 = Date.UTC(2026, 8, 15, 13, 14)

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange
  resetDBConnectionForTests()
})

/** Builds the schema exactly as version 1 shipped it, including `autoClosed`. */
async function seedVersion1Database() {
  const db = await openDB(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore('teachers', { keyPath: 'id' })
      const classes = database.createObjectStore('classes', { keyPath: 'id' })
      classes.createIndex('by-school-year', 'schoolYear')
      const students = database.createObjectStore('students', { keyPath: 'id' })
      students.createIndex('by-class', 'classId')
      const sessions = database.createObjectStore('sessions', { keyPath: 'id' })
      sessions.createIndex('by-class-checkin', ['classId', 'checkInAt'])
      sessions.createIndex('by-student-open', ['studentId', 'openMarker'])
      sessions.createIndex('by-school-year', 'schoolYear')
      database.createObjectStore('settings', { keyPath: 'key' })
    },
  })

  await db.put('students', {
    id: 'student-1',
    classId: 'class-1',
    firstName: 'Maya',
    lastName: 'Alvarez',
    grade: '10',
    active: true,
    createdAt: T0,
  })

  const base = {
    studentId: 'student-1',
    classId: 'class-1',
    schoolYear: '2026-2027',
    checkInAt: T0,
  }

  // A session v1 auto-closed at its guessed 16:00.
  await db.put('sessions', {
    ...base,
    id: 'guessed',
    checkOutAt: T0 + 6 * 3_600_000,
    durationMs: 6 * 3_600_000,
    autoClosed: true,
    openMarker: 0,
  })
  // A session the student actually closed.
  await db.put('sessions', {
    ...base,
    id: 'real',
    checkOutAt: T0 + 93 * 60_000,
    durationMs: 93 * 60_000,
    autoClosed: false,
    openMarker: 0,
  })
  // A session still open when the app was last closed.
  await db.put('sessions', {
    ...base,
    id: 'open',
    checkOutAt: null,
    durationMs: null,
    autoClosed: false,
    openMarker: 1,
  })

  db.close()
}

describe('migrating a version 1 database', () => {
  it('flags a previously guessed check-out for review instead of trusting it', async () => {
    await seedVersion1Database()

    const migrated = await getSession('guessed')

    expect(migrated?.needsReview).toBe(true)
    expect(migrated).not.toHaveProperty('autoClosed')
    // The guessed time is kept rather than discarded, so the teacher has
    // something to correct rather than a blank.
    expect(migrated?.checkOutAt).toBe(T0 + 6 * 3_600_000)
    await closeDB()
  })

  it('leaves genuinely recorded sessions alone', async () => {
    await seedVersion1Database()

    const real = await getSession('real')
    expect(real).toMatchObject({
      needsReview: false,
      checkOutAt: T0 + 93 * 60_000,
      durationMs: 93 * 60_000,
    })

    const open = await getSession('open')
    expect(open).toMatchObject({ needsReview: false, checkOutAt: null, openMarker: 1 })
    await closeDB()
  })

  it('surfaces the migrated guesses on the review list', async () => {
    await seedVersion1Database()
    expect((await listSessionsNeedingReview('class-1')).map((s) => s.id)).toEqual(['guessed'])
    await closeDB()
  })

  it('carries every other store across untouched', async () => {
    await seedVersion1Database()
    expect((await listStudents('class-1')).map((s) => s.lastName)).toEqual(['Alvarez'])
    await closeDB()
  })
})
