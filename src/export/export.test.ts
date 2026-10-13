import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkIn,
  checkOut,
  createClass,
  createStudent,
  deactivateStudent,
  type Class,
} from '../db'
import { localTimeOnDay, schoolYearForDate } from '../domain'
import { buildExport, loadExportInput } from './buildExport'
import { downloadCsv } from './download'
import { signInTeacher } from '../test/helpers'

const DAY = 86_400_000
const TODAY = new Date(2026, 8, 15, 12).getTime()
const YESTERDAY = TODAY - DAY
const YEAR = schoolYearForDate(TODAY)

let cls: Class

beforeEach(async () => {
  
  const teacher = signInTeacher()
  cls = await createClass(
    { teacherId: teacher.id, name: 'Period 3 Biology', colorTheme: 'teal', schoolYear: YEAR },
    TODAY,
  )
})

async function addStudent(lastName: string, firstName: string, studentId?: string) {
  return createStudent(
    {
      classId: cls.id,
      lastName,
      firstName,
      grade: '10',
      ...(studentId ? { studentId } : {}),
    },
    TODAY,
  )
}

async function addSession(studentId: string, dayAt: number, inHour: number, outMinutes: number) {
  const checkInAt = localTimeOnDay(dayAt, inHour, 14)
  const session = await checkIn({ studentId, classId: cls.id, schoolYear: YEAR, checkInAt })
  return checkOut(session.id, checkInAt + outMinutes * 60_000)
}

describe('loadExportInput', () => {
  it('widens the range to whole local days at both ends', async () => {
    const student = await addStudent('Alvarez', 'Maya')
    await addSession(student.id, YESTERDAY, 7, 30) // early morning
    await addSession(student.id, TODAY, 23, 15) // late evening

    // Passing midday instants at both ends must still catch both sessions.
    const input = await loadExportInput(cls.id, YESTERDAY, TODAY, TODAY)
    expect(input.sessions).toHaveLength(2)
  })

  it('includes soft-deleted students so past exports keep their rows', async () => {
    const student = await addStudent('Zamora', 'Kit')
    await addSession(student.id, TODAY, 9, 60)
    await deactivateStudent(student.id)

    const input = await loadExportInput(cls.id, TODAY, TODAY, TODAY)
    expect(input.students.map((s) => s.lastName)).toEqual(['Zamora'])
    expect(input.sessions).toHaveLength(1)
  })
})

describe('buildExport', () => {
  it('builds the session CSV with a row per session and a matching count', async () => {
    const maya = await addStudent('Alvarez', 'Maya', '10442')
    const dev = await addStudent('Brooks', 'Dev', '10118')
    await addSession(maya.id, TODAY, 9, 93)
    await addSession(dev.id, TODAY, 9, 91)
    await addSession(maya.id, YESTERDAY, 9, 45)

    const built = await buildExport({
      classId: cls.id,
      className: cls.name,
      fromAt: TODAY,
      toAt: TODAY,
      mode: 'sessions',
      now: TODAY,
    })

    expect(built.rowCount).toBe(2)
    expect(built.csv.split('\r\n')).toHaveLength(3)
    expect(built.csv).toContain('Alvarez,Maya,10,10442,2026-09-15,09:14,10:47,01:33')
    expect(built.fileName).toBe('period-3-biology_2026-09-15_2026-09-15_sessions.csv')
  })

  it('builds the summary CSV with one row per student', async () => {
    const maya = await addStudent('Alvarez', 'Maya', '10442')
    await addSession(maya.id, TODAY, 9, 90)
    await addSession(maya.id, TODAY, 13, 60)

    const built = await buildExport({
      classId: cls.id,
      className: cls.name,
      fromAt: TODAY,
      toAt: TODAY,
      mode: 'summary',
      now: TODAY,
    })

    expect(built.rowCount).toBe(1)
    expect(built.csv).toContain('Alvarez,Maya,10,10442,2,02:30')
    expect(built.fileName.endsWith('_summary.csv')).toBe(true)
  })

  it('reports zero rows for a range with no sessions', async () => {
    const maya = await addStudent('Alvarez', 'Maya')
    await addSession(maya.id, TODAY, 9, 30)

    const built = await buildExport({
      classId: cls.id,
      className: cls.name,
      fromAt: TODAY - 30 * DAY,
      toAt: TODAY - 20 * DAY,
      mode: 'sessions',
      now: TODAY,
    })
    expect(built.rowCount).toBe(0)
    expect(built.csv.split('\r\n')).toHaveLength(1)
  })

  it('exports only the requested class', async () => {
    const other = await createClass(
      { teacherId: cls.teacherId, name: 'Period 4', colorTheme: 'rose', schoolYear: YEAR },
      TODAY,
    )
    const mine = await addStudent('Alvarez', 'Maya')
    const theirs = await createStudent(
      { classId: other.id, lastName: 'Brooks', firstName: 'Dev', grade: '10' },
      TODAY,
    )
    await addSession(mine.id, TODAY, 9, 30)
    const session = await checkIn({
      studentId: theirs.id,
      classId: other.id,
      schoolYear: YEAR,
      checkInAt: localTimeOnDay(TODAY, 9, 14),
    })
    await checkOut(session.id, localTimeOnDay(TODAY, 10, 0))

    const built = await buildExport({
      classId: cls.id,
      className: cls.name,
      fromAt: TODAY,
      toAt: TODAY,
      mode: 'sessions',
      now: TODAY,
    })
    expect(built.rowCount).toBe(1)
    expect(built.csv).not.toContain('Brooks')
  })

  it('leaves a still-open session without a check-out or duration', async () => {
    const maya = await addStudent('Alvarez', 'Maya')
    await checkIn({
      studentId: maya.id,
      classId: cls.id,
      schoolYear: YEAR,
      checkInAt: localTimeOnDay(TODAY, 9, 14),
    })

    const built = await buildExport({
      classId: cls.id,
      className: cls.name,
      fromAt: TODAY,
      toAt: TODAY,
      mode: 'sessions',
      now: TODAY,
    })
    expect(built.rows[1]?.slice(5)).toEqual(['09:14', '', ''])
  })
})

describe('downloadCsv', () => {
  it('saves a UTF-8 CSV under the given name and cleans up the object URL', () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    vi.useFakeTimers()

    try {
      const result = downloadCsv('roster.csv', 'Last Name\r\nZieliński')

      expect(clickSpy).toHaveBeenCalledOnce()
      const blob = createSpy.mock.calls[0]?.[0] as Blob
      expect(blob.type).toBe('text/csv;charset=utf-8')
      // Leading BOM, so Excel on Windows does not mangle accented names.
      expect(result.bytes).toBeGreaterThan('Last Name\r\nZieliński'.length)
      expect(result.fileName).toBe('roster.csv')

      // The link must not be left behind in the document.
      expect(document.querySelector('a[download]')).toBeNull()

      vi.advanceTimersByTime(1000)
      expect(revokeSpy).toHaveBeenCalledWith('blob:fake')
    } finally {
      vi.useRealTimers()
      vi.restoreAllMocks()
    }
  })
})
