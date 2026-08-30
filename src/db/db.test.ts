import { beforeEach, describe, expect, it } from 'vitest'
import { IDBKeyRange, IDBFactory } from 'fake-indexeddb'
import {
  AlreadyCheckedInError,
  ClassLimitReachedError,
  MAX_ACTIVE_CLASSES,
  listTeachers,
  remainingClassSlots,
  checkIn,
  checkOut,
  correctSession,
  createClass,
  createManualSession,
  createStudent,
  createStudents,
  createTeacher,
  deactivateStudent,
  deleteClassCascade,
  deleteSchoolYearSessions,
  deleteSession,
  deleteStudentPermanently,
  findOpenSession,
  flagForReview,
  getPrimaryTeacher,
  getSetting,
  getStudent,
  listAllOpenSessions,
  listClasses,
  listOpenSessions,
  listSchoolYears,
  listSessionsForSchoolYear,
  listSessionsInRange,
  listSessionsNeedingReview,
  listStudents,
  reactivateStudent,
  setSetting,
  updateClass,
  updateStudent,
} from './index'
import { resetDBConnectionForTests } from './schema'

const YEAR = '2026-2027'
const T0 = Date.UTC(2026, 8, 15, 13, 14) // 2026-09-15
const MINUTE = 60_000
const DAY = 86_400_000

// Each test gets a brand-new in-memory IndexedDB rather than deleting the old
// one, which would block on the still-open connection.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange
  resetDBConnectionForTests()
})

/** The device's single teacher account, created once per test. */
async function theTeacher() {
  return (
    (await getPrimaryTeacher()) ??
    (await createTeacher(
      {
        displayName: 'Amanda',
        passwordHash: 'hash',
        salt: 'salt',
        recoveryHash: 'recovery',
        iterations: 1000,
      },
      T0,
    ))
  )
}

async function makeClass(name = 'Period 3 Biology') {
  const teacher = await theTeacher()
  return createClass(
    { teacherId: teacher.id, name, colorTheme: 'teal', schoolYear: YEAR },
    T0,
  )
}

describe('teachers', () => {
  const base = { passwordHash: 'h', salt: 's', recoveryHash: 'r', iterations: 1000 }

  it('stores the account and returns it as the device owner', async () => {
    const created = await createTeacher({ displayName: 'Amanda', ...base }, T0)
    expect((await getPrimaryTeacher())?.id).toBe(created.id)
  })

  it('holds several accounts, oldest first', async () => {
    await createTeacher({ displayName: 'Amanda', ...base }, T0)
    await createTeacher({ displayName: 'Dave', ...base }, T0 + MINUTE)
    expect((await listTeachers()).map((t) => t.displayName)).toEqual(['Amanda', 'Dave'])
    expect((await getPrimaryTeacher())?.displayName).toBe('Amanda')
  })

  it('reports nothing before setup', async () => {
    expect(await getPrimaryTeacher()).toBeUndefined()
  })
})

describe('class limit', () => {
  it(`allows ${MAX_ACTIVE_CLASSES} active classes and refuses the next`, async () => {
    const teacher = await theTeacher()
    for (let i = 0; i < MAX_ACTIVE_CLASSES; i += 1) {
      await createClass(
        { teacherId: teacher.id, name: `Period ${i}`, colorTheme: 'teal', schoolYear: YEAR },
        T0,
      )
    }
    expect(await remainingClassSlots(YEAR, teacher.id)).toBe(0)
    await expect(
      createClass(
        { teacherId: teacher.id, name: 'One too many', colorTheme: 'teal', schoolYear: YEAR },
        T0,
      ),
    ).rejects.toBeInstanceOf(ClassLimitReachedError)
    expect(await listClasses(YEAR)).toHaveLength(MAX_ACTIVE_CLASSES)
  })

  it('frees a slot when a class is archived', async () => {
    const teacher = await theTeacher()
    const created = []
    for (let i = 0; i < MAX_ACTIVE_CLASSES; i += 1) {
      created.push(
        await createClass(
          { teacherId: teacher.id, name: `Period ${i}`, colorTheme: 'teal', schoolYear: YEAR },
          T0,
        ),
      )
    }
    await updateClass(created[0]?.id as string, { archived: true })

    expect(await remainingClassSlots(YEAR, teacher.id)).toBe(1)
    await expect(
      createClass(
        { teacherId: teacher.id, name: 'Replacement', colorTheme: 'teal', schoolYear: YEAR },
        T0,
      ),
    ).resolves.toBeDefined()
  })

  it('counts the limit per teacher, so one cannot fill another\'s slots', async () => {
    const amanda = await theTeacher()
    const dave = await createTeacher(
      {
        displayName: 'Dave',
        passwordHash: 'h',
        salt: 's',
        recoveryHash: 'r',
        iterations: 1000,
      },
      T0 + MINUTE,
    )
    for (let i = 0; i < MAX_ACTIVE_CLASSES; i += 1) {
      await createClass(
        { teacherId: amanda.id, name: `Period ${i}`, colorTheme: 'teal', schoolYear: YEAR },
        T0,
      )
    }
    expect(await remainingClassSlots(YEAR, amanda.id)).toBe(0)
    expect(await remainingClassSlots(YEAR, dave.id)).toBe(MAX_ACTIVE_CLASSES)
    await expect(
      createClass(
        { teacherId: dave.id, name: 'Daves class', colorTheme: 'rose', schoolYear: YEAR },
        T0,
      ),
    ).resolves.toBeDefined()
  })

  it('shows each teacher only their own classes', async () => {
    const amanda = await theTeacher()
    const dave = await createTeacher(
      {
        displayName: 'Dave',
        passwordHash: 'h',
        salt: 's',
        recoveryHash: 'r',
        iterations: 1000,
      },
      T0 + MINUTE,
    )
    await createClass(
      { teacherId: amanda.id, name: 'Biology', colorTheme: 'teal', schoolYear: YEAR },
      T0,
    )
    await createClass(
      { teacherId: dave.id, name: 'Chemistry', colorTheme: 'rose', schoolYear: YEAR },
      T0,
    )

    expect((await listClasses(YEAR, { teacherId: amanda.id })).map((c) => c.name)).toEqual([
      'Biology',
    ])
    expect((await listClasses(YEAR, { teacherId: dave.id })).map((c) => c.name)).toEqual([
      'Chemistry',
    ])
    // The student view is device-level and still sees whatever is set up.
    expect(await listClasses(YEAR)).toHaveLength(2)
  })

  it('counts the limit per school year', async () => {
    const teacher = await theTeacher()
    for (let i = 0; i < MAX_ACTIVE_CLASSES; i += 1) {
      await createClass(
        { teacherId: teacher.id, name: `Period ${i}`, colorTheme: 'teal', schoolYear: YEAR },
        T0,
      )
    }
    await expect(
      createClass(
        { teacherId: teacher.id, name: 'Next year', colorTheme: 'teal', schoolYear: '2027-2028' },
        T0,
      ),
    ).resolves.toBeDefined()
  })
})

describe('classes', () => {
  it('lists only non-archived classes for the given school year', async () => {
    const cls = await makeClass()
    await createClass(
      { teacherId: cls.teacherId, name: 'Old', colorTheme: 'teal', schoolYear: '2025-2026' },
      T0,
    )
    const archived = await createClass(
      { teacherId: cls.teacherId, name: 'Archived', colorTheme: 'amber', schoolYear: YEAR },
      T0,
    )
    await updateClass(archived.id, { archived: true })

    expect((await listClasses(YEAR)).map((c) => c.name)).toEqual(['Period 3 Biology'])
    expect((await listClasses(YEAR, { includeArchived: true })).map((c) => c.name)).toEqual([
      'Archived',
      'Period 3 Biology',
    ])
    expect(await listSchoolYears()).toEqual(['2025-2026', YEAR])
  })

  it('cascades a hard delete to students and sessions', async () => {
    const cls = await makeClass()
    const other = await makeClass('Period 4')
    const student = await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      T0,
    )
    const keeper = await createStudent(
      { classId: other.id, firstName: 'Dev', lastName: 'Brooks', grade: '10' },
      T0,
    )
    await checkIn({ studentId: student.id, classId: cls.id, schoolYear: YEAR, checkInAt: T0 })
    await checkIn({ studentId: keeper.id, classId: other.id, schoolYear: YEAR, checkInAt: T0 })

    await deleteClassCascade(cls.id)

    expect(await listStudents(cls.id)).toEqual([])
    expect(await listSessionsInRange(cls.id, 0, T0 * 2)).toEqual([])
    expect(await listStudents(other.id)).toHaveLength(1)
    expect(await findOpenSession(keeper.id)).toBeDefined()
  })
})

describe('students', () => {
  it('sorts the roster by last name then first name', async () => {
    const cls = await makeClass()
    await createStudents(
      [
        { classId: cls.id, firstName: 'Dev', lastName: 'Brooks', grade: '10' },
        { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
        { classId: cls.id, firstName: 'Ana', lastName: 'Alvarez', grade: '9' },
      ],
      T0,
    )
    expect((await listStudents(cls.id)).map((s) => `${s.lastName},${s.firstName}`)).toEqual([
      'Alvarez,Ana',
      'Alvarez,Maya',
      'Brooks,Dev',
    ])
  })

  it('soft-deletes by default and can reactivate', async () => {
    const cls = await makeClass()
    const student = await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      T0,
    )
    await deactivateStudent(student.id)
    expect(await listStudents(cls.id)).toEqual([])
    expect(await listStudents(cls.id, { includeInactive: true })).toHaveLength(1)
    expect(await getStudent(student.id)).toBeDefined()

    await reactivateStudent(student.id)
    expect(await listStudents(cls.id)).toHaveLength(1)
  })

  it('keeps sessions intact through a soft delete', async () => {
    const cls = await makeClass()
    const student = await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      T0,
    )
    const session = await checkIn({
      studentId: student.id,
      classId: cls.id,
      schoolYear: YEAR,
      checkInAt: T0,
    })
    await checkOut(session.id, T0 + 90 * MINUTE)
    await deactivateStudent(student.id)
    expect(await listSessionsInRange(cls.id, T0, T0 + MINUTE)).toHaveLength(1)
  })

  it('hard delete removes the student and only their sessions', async () => {
    const cls = await makeClass()
    const [gone, kept] = await createStudents(
      [
        { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
        { classId: cls.id, firstName: 'Dev', lastName: 'Brooks', grade: '10' },
      ],
      T0,
    )
    if (!gone || !kept) throw new Error('fixture failed')
    const open = await checkIn({
      studentId: gone.id,
      classId: cls.id,
      schoolYear: YEAR,
      checkInAt: T0,
    })
    await checkOut(open.id, T0 + MINUTE)
    await checkIn({ studentId: gone.id, classId: cls.id, schoolYear: YEAR, checkInAt: T0 + 2 * MINUTE })
    await checkIn({ studentId: kept.id, classId: cls.id, schoolYear: YEAR, checkInAt: T0 })

    await deleteStudentPermanently(gone.id)

    expect(await getStudent(gone.id)).toBeUndefined()
    const remaining = await listSessionsInRange(cls.id, 0, T0 * 2)
    expect(remaining.map((s) => s.studentId)).toEqual([kept.id])
  })

  it('updates editable fields without touching createdAt', async () => {
    const cls = await makeClass()
    const student = await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      T0,
    )
    const updated = await updateStudent(student.id, { grade: '11', studentId: '10442' })
    expect(updated).toMatchObject({ grade: '11', studentId: '10442', createdAt: T0 })
  })
})

describe('sessions', () => {
  it('opens a session with a null checkout and finds it by student', async () => {
    const cls = await makeClass()
    const student = await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      T0,
    )
    const session = await checkIn({
      studentId: student.id,
      classId: cls.id,
      schoolYear: YEAR,
      checkInAt: T0,
    })
    expect(session).toMatchObject({ checkOutAt: null, durationMs: null, needsReview: false })
    expect((await findOpenSession(student.id))?.id).toBe(session.id)
    expect(await listOpenSessions(cls.id)).toHaveLength(1)
  })

  it('refuses a second open session for the same student', async () => {
    const cls = await makeClass()
    const student = await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      T0,
    )
    await checkIn({ studentId: student.id, classId: cls.id, schoolYear: YEAR, checkInAt: T0 })
    await expect(
      checkIn({ studentId: student.id, classId: cls.id, schoolYear: YEAR, checkInAt: T0 + MINUTE }),
    ).rejects.toBeInstanceOf(AlreadyCheckedInError)
  })

  it('stores the duration on checkout and clears the open marker', async () => {
    const cls = await makeClass()
    const student = await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      T0,
    )
    const open = await checkIn({
      studentId: student.id,
      classId: cls.id,
      schoolYear: YEAR,
      checkInAt: T0,
    })
    const closed = await checkOut(open.id, T0 + 93 * MINUTE)
    expect(closed.durationMs).toBe(93 * MINUTE)
    expect(closed.openMarker).toBe(0)
    expect(await findOpenSession(student.id)).toBeUndefined()
    expect(await listOpenSessions(cls.id)).toEqual([])
  })

  it('allows a new session after checking out', async () => {
    const cls = await makeClass()
    const student = await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      T0,
    )
    const first = await checkIn({
      studentId: student.id,
      classId: cls.id,
      schoolYear: YEAR,
      checkInAt: T0,
    })
    await checkOut(first.id, T0 + MINUTE)
    const second = await checkIn({
      studentId: student.id,
      classId: cls.id,
      schoolYear: YEAR,
      checkInAt: T0 + 2 * MINUTE,
    })
    expect(second.id).not.toBe(first.id)
  })

  it('flags an abandoned session without closing it or inventing a time', async () => {
    const cls = await makeClass()
    const student = await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      T0,
    )
    const open = await checkIn({
      studentId: student.id,
      classId: cls.id,
      schoolYear: YEAR,
      checkInAt: T0,
    })

    const flagged = await flagForReview(open.id)

    expect(flagged.needsReview).toBe(true)
    expect(flagged.checkOutAt).toBeNull()
    expect(flagged.durationMs).toBeNull()
    // It is off the card wall, so the student can check in again today.
    expect(await findOpenSession(student.id)).toBeUndefined()
    expect(await listOpenSessions(cls.id)).toEqual([])
    expect((await listSessionsNeedingReview(cls.id)).map((s) => s.id)).toEqual([open.id])

    const fresh = await checkIn({
      studentId: student.id,
      classId: cls.id,
      schoolYear: YEAR,
      checkInAt: T0 + DAY,
    })
    expect(fresh.id).not.toBe(open.id)
  })

  it('clears the review flag once the teacher supplies a check-out time', async () => {
    const cls = await makeClass()
    const student = await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      T0,
    )
    const open = await checkIn({
      studentId: student.id,
      classId: cls.id,
      schoolYear: YEAR,
      checkInAt: T0,
    })
    await flagForReview(open.id)

    const resolved = await correctSession(open.id, { checkOutAt: T0 + 93 * MINUTE }, T0 + DAY)

    expect(resolved).toMatchObject({ needsReview: false, durationMs: 93 * MINUTE })
    expect(await listSessionsNeedingReview(cls.id)).toEqual([])
  })

  it('lists sessions needing review oldest first', async () => {
    const cls = await makeClass()
    const student = await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      T0,
    )
    for (const offset of [2 * DAY, 0, DAY]) {
      const s = await createManualSession({
        studentId: student.id,
        classId: cls.id,
        schoolYear: YEAR,
        checkInAt: T0 + offset,
        checkOutAt: null,
      })
      expect(s.needsReview).toBe(true)
    }
    expect((await listSessionsNeedingReview(cls.id)).map((s) => s.checkInAt)).toEqual([
      T0,
      T0 + DAY,
      T0 + 2 * DAY,
    ])
  })

  it('queries a date range by check-in, inclusive of both bounds', async () => {
    const cls = await makeClass()
    const student = await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      T0,
    )
    for (const offset of [-MINUTE, 0, MINUTE, 2 * MINUTE, 3 * MINUTE]) {
      const s = await checkIn({
        studentId: student.id,
        classId: cls.id,
        schoolYear: YEAR,
        checkInAt: T0 + offset,
      })
      await checkOut(s.id, T0 + offset + 30_000)
    }
    const rows = await listSessionsInRange(cls.id, T0, T0 + 2 * MINUTE)
    expect(rows.map((s) => s.checkInAt)).toEqual([T0, T0 + MINUTE, T0 + 2 * MINUTE])
  })

  it('scopes range queries to one class', async () => {
    const a = await makeClass('A')
    const b = await makeClass('B')
    const sa = await createStudent({ classId: a.id, firstName: 'A', lastName: 'A', grade: '9' }, T0)
    const sb = await createStudent({ classId: b.id, firstName: 'B', lastName: 'B', grade: '9' }, T0)
    await checkIn({ studentId: sa.id, classId: a.id, schoolYear: YEAR, checkInAt: T0 })
    await checkIn({ studentId: sb.id, classId: b.id, schoolYear: YEAR, checkInAt: T0 })

    expect(await listSessionsInRange(a.id, 0, T0 * 2)).toHaveLength(1)
    expect(await listOpenSessions(b.id)).toHaveLength(1)
    expect(await listAllOpenSessions()).toHaveLength(2)
  })

  it('adds a manual session without ever becoming the active one', async () => {
    const cls = await makeClass()
    const student = await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      T0,
    )
    // A live check-in exists; adding a past visit must not collide with it.
    const live = await checkIn({
      studentId: student.id,
      classId: cls.id,
      schoolYear: YEAR,
      checkInAt: T0,
    })

    const added = await createManualSession({
      studentId: student.id,
      classId: cls.id,
      schoolYear: YEAR,
      checkInAt: T0 - DAY,
      checkOutAt: T0 - DAY + 45 * MINUTE,
    })

    expect(added).toMatchObject({ durationMs: 45 * MINUTE, needsReview: false, openMarker: 0 })
    expect((await findOpenSession(student.id))?.id).toBe(live.id)
    expect(await listSessionsInRange(cls.id, T0 - DAY, T0 + MINUTE)).toHaveLength(2)
  })

  it('re-derives duration and open state when a session is corrected', async () => {
    const cls = await makeClass()
    const student = await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      T0,
    )
    const open = await checkIn({
      studentId: student.id,
      classId: cls.id,
      schoolYear: YEAR,
      checkInAt: T0,
    })
    const closed = await correctSession(open.id, { checkOutAt: T0 + 60 * MINUTE })
    expect(closed).toMatchObject({ durationMs: 60 * MINUTE, openMarker: 0 })

    const shifted = await correctSession(open.id, { checkInAt: T0 + 10 * MINUTE })
    expect(shifted.durationMs).toBe(50 * MINUTE)

    const reopened = await correctSession(open.id, { checkOutAt: null }, T0)
    expect(reopened).toMatchObject({ durationMs: null, openMarker: 1, needsReview: false })
    expect(await findOpenSession(student.id)).toBeDefined()
  })

  it('sends a session reopened on an earlier day back to the review list', async () => {
    const cls = await makeClass()
    const student = await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      T0,
    )
    const open = await checkIn({
      studentId: student.id,
      classId: cls.id,
      schoolYear: YEAR,
      checkInAt: T0,
    })
    await checkOut(open.id, T0 + 30 * MINUTE)

    // Clearing the check-out a week later cannot make it today's live session.
    const reopened = await correctSession(open.id, { checkOutAt: null }, T0 + 7 * DAY)

    expect(reopened).toMatchObject({ openMarker: 0, needsReview: true })
    expect(await findOpenSession(student.id)).toBeUndefined()
  })

  it('deletes a single erroneous session', async () => {
    const cls = await makeClass()
    const student = await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      T0,
    )
    const open = await checkIn({
      studentId: student.id,
      classId: cls.id,
      schoolYear: YEAR,
      checkInAt: T0,
    })
    await deleteSession(open.id)
    expect(await findOpenSession(student.id)).toBeUndefined()
  })

  it('purges one school year and leaves the others alone', async () => {
    const cls = await makeClass()
    const student = await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      T0,
    )
    const older = await checkIn({
      studentId: student.id,
      classId: cls.id,
      schoolYear: '2025-2026',
      checkInAt: T0 - 400 * 24 * 3600_000,
    })
    await checkOut(older.id, T0 - 400 * 24 * 3600_000 + MINUTE)
    await checkIn({ studentId: student.id, classId: cls.id, schoolYear: YEAR, checkInAt: T0 })

    expect(await deleteSchoolYearSessions('2025-2026')).toBe(1)
    expect(await listSessionsForSchoolYear('2025-2026')).toEqual([])
    expect(await listSessionsForSchoolYear(YEAR)).toHaveLength(1)
  })
})

describe('settings', () => {
  it('round-trips values and returns the fallback when unset', async () => {
    expect(await getSetting('soundEnabled', false)).toBe(false)
    await setSetting('soundEnabled', true)
    expect(await getSetting('soundEnabled', false)).toBe(true)
  })
})
