import { describe, expect, it } from 'vitest'
import type { Session, Student } from '../db/types'
import {
  buildSessionCsv,
  buildSessionRows,
  buildSummaryCsv,
  buildSummaryRows,
  countExportRows,
  escapeCsvField,
  exportFileName,
} from './csv'
import { HOUR_MS, MINUTE_MS } from './time'

const YEAR = '2026-2027'
const DAY1 = new Date(2026, 8, 15, 9, 14).getTime()

function student(id: string, lastName: string, firstName: string, over: Partial<Student> = {}): Student {
  return {
    id,
    classId: 'c1',
    firstName,
    lastName,
    grade: '10',
    active: true,
    createdAt: 0,
    ...over,
  }
}

function session(
  id: string,
  studentId: string,
  checkInAt: number,
  checkOutAt: number | null,
  over: Partial<Session> = {},
): Session {
  return {
    id,
    studentId,
    classId: 'c1',
    schoolYear: YEAR,
    checkInAt,
    checkOutAt,
    durationMs: checkOutAt === null ? null : checkOutAt - checkInAt,
    needsReview: false,
    openMarker: checkOutAt === null ? 1 : 0,
    ...over,
  }
}

const maya = student('m', 'Alvarez', 'Maya', { studentId: '10442' })
const dev = student('d', 'Brooks', 'Dev', { studentId: '10118' })

describe('escapeCsvField', () => {
  it('leaves plain fields alone', () => {
    expect(escapeCsvField('Alvarez')).toBe('Alvarez')
    expect(escapeCsvField('')).toBe('')
  })

  it('quotes commas, quotes, and newlines', () => {
    expect(escapeCsvField('Alvarez, Jr.')).toBe('"Alvarez, Jr."')
    expect(escapeCsvField('He said "hi"')).toBe('"He said ""hi"""')
    expect(escapeCsvField('two\nlines')).toBe('"two\nlines"')
  })

  it('neutralizes fields a spreadsheet would read as a formula', () => {
    expect(escapeCsvField('=1+1')).toBe(`"'=1+1"`)
    expect(escapeCsvField('-Ramirez')).toBe(`"'-Ramirez"`)
  })
})

describe('buildSessionRows', () => {
  it('matches the documented header and row shape', () => {
    const rows = buildSessionRows({
      students: [maya, dev],
      sessions: [
        session('s1', 'm', DAY1, DAY1 + 93 * MINUTE_MS),
        session('s2', 'd', DAY1 + 2 * MINUTE_MS, DAY1 + 93 * MINUTE_MS),
      ],
      now: DAY1 + 5 * HOUR_MS,
    })
    expect(rows[0]).toEqual([
      'Last Name',
      'First Name',
      'Grade',
      'Student ID',
      'Date',
      'Check In',
      'Check Out',
      'Duration',
    ])
    expect(rows[1]).toEqual([
      'Alvarez',
      'Maya',
      '10',
      '10442',
      '2026-09-15',
      '09:14',
      '10:47',
      '01:33',
    ])
    expect(rows[2]?.[7]).toBe('01:31')
  })

  it('orders rows by check-in time', () => {
    const rows = buildSessionRows({
      students: [maya, dev],
      sessions: [
        session('late', 'd', DAY1 + HOUR_MS, DAY1 + 2 * HOUR_MS),
        session('early', 'm', DAY1, DAY1 + HOUR_MS),
      ],
      now: DAY1,
    })
    expect(rows.slice(1).map((r) => r[0])).toEqual(['Alvarez', 'Brooks'])
  })

  it('leaves the student ID blank when there is none', () => {
    const rows = buildSessionRows({
      students: [student('x', 'Ng', 'Sam')],
      sessions: [session('s', 'x', DAY1, DAY1 + HOUR_MS)],
      now: DAY1,
    })
    expect(rows[1]?.[3]).toBe('')
  })

  it('leaves a session with no check-out visibly blank rather than guessing', () => {
    const rows = buildSessionRows({
      students: [maya],
      sessions: [session('s', 'm', DAY1, null, { needsReview: true })],
      now: DAY1 + 7 * HOUR_MS,
    })
    // The blank duration is the flag: no time is invented to fill the gap.
    expect(rows[1]?.slice(4)).toEqual(['2026-09-15', '09:14', '', ''])
  })

  it('exports an open session with a blank check-out and duration', () => {
    const rows = buildSessionRows({
      students: [maya],
      sessions: [session('s', 'm', DAY1, null)],
      now: DAY1 + HOUR_MS,
    })
    expect(rows[1]?.slice(5)).toEqual(['09:14', '', ''])
  })

  it('exports a session that crosses midnight on its check-in date with its real duration', () => {
    const checkIn = new Date(2026, 8, 15, 23, 40).getTime()
    const checkOut = new Date(2026, 8, 16, 0, 25).getTime()
    const rows = buildSessionRows({
      students: [maya],
      sessions: [session('s', 'm', checkIn, checkOut)],
      now: checkOut,
    })
    expect(rows[1]?.slice(4, 8)).toEqual(['2026-09-15', '23:40', '00:25', '00:45'])
  })

  it('reports real elapsed time across a DST transition', () => {
    // 2026-11-01 01:00 EDT -> the clock repeats 1:00, so 00:30 to 02:00 is 2.5 hours.
    const checkIn = new Date(2026, 10, 1, 0, 30).getTime()
    const checkOut = checkIn + 150 * MINUTE_MS
    const rows = buildSessionRows({
      students: [maya],
      sessions: [session('s', 'm', checkIn, checkOut)],
      now: checkOut,
    })
    expect(rows[1]?.[7]).toBe('02:30')
  })

  it('skips sessions whose student was hard-deleted', () => {
    const rows = buildSessionRows({
      students: [maya],
      sessions: [session('s', 'ghost', DAY1, DAY1 + HOUR_MS)],
      now: DAY1,
    })
    expect(rows).toHaveLength(1)
    expect(countExportRows(rows)).toBe(0)
  })

  it('includes a soft-deleted student, whose history must not develop holes', () => {
    const rows = buildSessionRows({
      students: [student('g', 'Zamora', 'Kit', { active: false })],
      sessions: [session('s', 'g', DAY1, DAY1 + HOUR_MS)],
      now: DAY1,
    })
    expect(countExportRows(rows)).toBe(1)
  })

  it('emits CRLF-delimited text with escaped fields', () => {
    const csv = buildSessionCsv({
      students: [student('x', 'Alvarez, Jr.', 'Maya')],
      sessions: [session('s', 'x', DAY1, DAY1 + HOUR_MS)],
      now: DAY1,
    })
    const lines = csv.split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]?.startsWith('"Alvarez, Jr.",Maya')).toBe(true)
  })

  it('produces a header-only file for an empty range', () => {
    const csv = buildSessionCsv({ students: [maya], sessions: [], now: DAY1 })
    expect(csv.split('\r\n')).toHaveLength(1)
  })
})

describe('buildSummaryRows', () => {
  const sessions = [
    session('s1', 'm', DAY1, DAY1 + 90 * MINUTE_MS),
    session('s2', 'm', DAY1 + 3 * HOUR_MS, DAY1 + 4 * HOUR_MS),
    session('s3', 'd', DAY1, DAY1 + 45 * MINUTE_MS),
  ]

  it('totals each student across the range, sorted by last name', () => {
    const rows = buildSummaryRows({ students: [dev, maya], sessions, now: DAY1 })
    expect(rows[0]).toEqual([
      'Last Name',
      'First Name',
      'Grade',
      'Student ID',
      'Sessions',
      'Total Duration',
    ])
    expect(rows[1]).toEqual(['Alvarez', 'Maya', '10', '10442', '2', '02:30'])
    expect(rows[2]).toEqual(['Brooks', 'Dev', '10', '10118', '1', '00:45'])
  })

  it('omits students with no sessions in the range', () => {
    const rows = buildSummaryRows({
      students: [maya, dev, student('z', 'Ng', 'Sam')],
      sessions,
      now: DAY1,
    })
    expect(countExportRows(rows)).toBe(2)
  })

  it('counts an open session but contributes no time for it', () => {
    const rows = buildSummaryRows({
      students: [maya],
      sessions: [session('open', 'm', DAY1, null)],
      now: DAY1 + 10 * HOUR_MS,
    })
    expect(rows[1]?.slice(4)).toEqual(['1', '00:00'])
  })

  it('accumulates past 24 hours without wrapping', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      session(`s${i}`, 'm', DAY1 + i * 1000, DAY1 + i * 1000 + 90 * MINUTE_MS),
    )
    const rows = buildSummaryRows({ students: [maya], sessions: many, now: DAY1 })
    expect(rows[1]?.[5]).toBe('30:00')
  })

  it('serializes to CRLF text', () => {
    expect(buildSummaryCsv({ students: [maya], sessions, now: DAY1 }).split('\r\n')).toHaveLength(2)
  })
})

describe('exportFileName', () => {
  it('slugifies the class name and stamps the range', () => {
    expect(exportFileName('Period 3 Biology', DAY1, DAY1 + 86_400_000, 'sessions')).toBe(
      'period-3-biology_2026-09-15_2026-09-16_sessions.csv',
    )
    expect(exportFileName('  ???  ', DAY1, DAY1, 'summary')).toBe(
      'class_2026-09-15_2026-09-15_summary.csv',
    )
  })
})
