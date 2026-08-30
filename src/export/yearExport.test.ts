import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  checkIn,
  checkOut,
  createClass,
  createStudent,
  createTeacher,
  deactivateStudent,
  deleteSchoolYearData,
  listClasses,
  listSchoolYears,
  listSessionsForSchoolYear,
  listStudents,
  updateClass,
  type Class,
} from '../db'
import { resetDBConnectionForTests } from '../db/schema'
import { localTimeOnDay } from '../domain'
import { buildYearExport } from './yearExport'

const LAST_YEAR = '2025-2026'
const THIS_YEAR = '2026-2027'
const MAY = new Date(2026, 4, 12, 12).getTime()
const SEPTEMBER = new Date(2026, 8, 15, 12).getTime()

let teacherId: string

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange
  resetDBConnectionForTests()
  const teacher = await createTeacher(
    { displayName: 'Amanda', passwordHash: '', salt: '', iterations: 0, recoveryHash: '' },
    MAY,
  )
  teacherId = teacher.id
})

async function makeClass(name: string, schoolYear: string, createdAt: number): Promise<Class> {
  return createClass({ teacherId, name, colorTheme: 'teal', schoolYear }, createdAt)
}

async function addSession(
  cls: Class,
  studentId: string,
  dayAt: number,
  hour: number,
  minutes: number,
) {
  const checkInAt = localTimeOnDay(dayAt, hour, 14)
  const session = await checkIn({
    studentId,
    classId: cls.id,
    schoolYear: cls.schoolYear,
    checkInAt,
  })
  return checkOut(session.id, checkInAt + minutes * 60_000)
}

describe('buildYearExport', () => {
  it('spans every class in the year, tagging each row with its class', async () => {
    const bio = await makeClass('Period 3 Biology', LAST_YEAR, MAY)
    const chem = await makeClass('Period 4 Chemistry', LAST_YEAR, MAY)
    const maya = await createStudent(
      { classId: bio.id, lastName: 'Alvarez', firstName: 'Maya', grade: '10', studentId: '10442' },
      MAY,
    )
    const dev = await createStudent(
      { classId: chem.id, lastName: 'Brooks', firstName: 'Dev', grade: '10' },
      MAY,
    )
    await addSession(bio, maya.id, MAY, 9, 93)
    await addSession(chem, dev.id, MAY, 11, 45)

    const built = await buildYearExport(LAST_YEAR, SEPTEMBER)
    const [sessionsFile, summaryFile] = built.files

    expect(built.totalRows).toBe(2)
    expect(built.classNames).toEqual(['Period 3 Biology', 'Period 4 Chemistry'])
    expect(sessionsFile?.fileName).toBe('2025-2026_all-sessions.csv')
    expect(sessionsFile?.csv.split('\r\n')[0]).toBe(
      'Class,Last Name,First Name,Grade,Student ID,Date,Check In,Check Out,Duration',
    )
    expect(sessionsFile?.csv).toContain('Period 3 Biology,Alvarez,Maya,10,10442,2026-05-12,09:14')
    expect(sessionsFile?.csv).toContain('Period 4 Chemistry,Brooks,Dev,10,,2026-05-12,11:14')
    expect(summaryFile?.fileName).toBe('2025-2026_student-totals.csv')
    expect(summaryFile?.csv).toContain('Period 3 Biology,Alvarez,Maya,10,10442,1,01:33')
  })

  it('includes archived classes and removed students', async () => {
    const bio = await makeClass('Period 3 Biology', LAST_YEAR, MAY)
    await updateClass(bio.id, { archived: true })
    const kit = await createStudent(
      { classId: bio.id, lastName: 'Zamora', firstName: 'Kit', grade: '9' },
      MAY,
    )
    await addSession(bio, kit.id, MAY, 9, 30)
    await deactivateStudent(kit.id)

    const built = await buildYearExport(LAST_YEAR, SEPTEMBER)
    expect(built.totalRows).toBe(1)
    expect(built.files[0]?.csv).toContain('Zamora')
  })

  it('never mixes in the current year', async () => {
    const old = await makeClass('Old Biology', LAST_YEAR, MAY)
    const current = await makeClass('New Biology', THIS_YEAR, SEPTEMBER)
    const oldStudent = await createStudent(
      { classId: old.id, lastName: 'Alvarez', firstName: 'Maya', grade: '10' },
      MAY,
    )
    const newStudent = await createStudent(
      { classId: current.id, lastName: 'Brooks', firstName: 'Dev', grade: '11' },
      SEPTEMBER,
    )
    await addSession(old, oldStudent.id, MAY, 9, 30)
    await addSession(current, newStudent.id, SEPTEMBER, 9, 30)

    const built = await buildYearExport(LAST_YEAR, SEPTEMBER)
    expect(built.totalRows).toBe(1)
    expect(built.files[0]?.csv).not.toContain('Brooks')
  })

  it('produces valid header-only files for a year with nothing in it', async () => {
    const built = await buildYearExport(LAST_YEAR, SEPTEMBER)
    expect(built.totalRows).toBe(0)
    expect(built.files[0]?.csv.split('\r\n')).toHaveLength(1)
    expect(built.files[0]?.csv.startsWith('Class,Last Name')).toBe(true)
  })
})

describe('deleteSchoolYearData', () => {
  it('removes one year entirely and leaves the current year alone', async () => {
    const old = await makeClass('Old Biology', LAST_YEAR, MAY)
    const current = await makeClass('New Biology', THIS_YEAR, SEPTEMBER)
    const oldStudent = await createStudent(
      { classId: old.id, lastName: 'Alvarez', firstName: 'Maya', grade: '10' },
      MAY,
    )
    const newStudent = await createStudent(
      { classId: current.id, lastName: 'Brooks', firstName: 'Dev', grade: '11' },
      SEPTEMBER,
    )
    await addSession(old, oldStudent.id, MAY, 9, 30)
    await addSession(old, oldStudent.id, MAY, 13, 30)
    await addSession(current, newStudent.id, SEPTEMBER, 9, 30)

    const result = await deleteSchoolYearData(LAST_YEAR)

    expect(result).toEqual({ classes: 1, students: 1, sessions: 2 })
    expect(await listSchoolYears()).toEqual([THIS_YEAR])
    expect(await listSessionsForSchoolYear(LAST_YEAR)).toEqual([])
    expect(await listStudents(old.id, { includeInactive: true })).toEqual([])

    expect(await listClasses(THIS_YEAR)).toHaveLength(1)
    expect(await listSessionsForSchoolYear(THIS_YEAR)).toHaveLength(1)
    expect(await listStudents(current.id)).toHaveLength(1)
  })

  it('is a no-op for a year that holds nothing', async () => {
    expect(await deleteSchoolYearData(LAST_YEAR)).toEqual({
      classes: 0,
      students: 0,
      sessions: 0,
    })
  })
})
