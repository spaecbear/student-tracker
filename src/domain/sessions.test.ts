import { describe, expect, it } from 'vitest'
import type { Session, Student } from '../db/types'
import {
  buildRosterColumns,
  findAbandonedSessions,
  findOpenSessionFor,
  needsReview,
  totalTimeToday,
} from './sessions'
import { HOUR_MS, MINUTE_MS } from './time'

const YEAR = '2026-2027'
const NOW = new Date(2026, 8, 15, 10, 0).getTime()

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

describe('findOpenSessionFor', () => {
  const sessions = [
    session('s1', 'a', NOW - 3 * HOUR_MS, NOW - 2 * HOUR_MS),
    session('s2', 'a', NOW - HOUR_MS, null),
    session('s3', 'b', NOW - HOUR_MS, NOW),
  ]

  it('finds the open session and ignores closed ones', () => {
    expect(findOpenSessionFor('a', sessions)?.id).toBe('s2')
    expect(findOpenSessionFor('b', sessions)).toBeUndefined()
    expect(findOpenSessionFor('missing', sessions)).toBeUndefined()
  })
})

describe('findAbandonedSessions', () => {
  const today = session('today', 'a', new Date(2026, 8, 15, 7, 30).getTime(), null)
  const yesterday = session('yesterday', 'b', new Date(2026, 8, 14, 9, 14).getTime(), null)
  const closed = session(
    'closed',
    'c',
    new Date(2026, 8, 14, 9, 14).getTime(),
    new Date(2026, 8, 14, 10, 0).getTime(),
  )

  it('finds only open sessions from an earlier day', () => {
    expect(findAbandonedSessions([today, yesterday, closed], NOW).map((s) => s.id)).toEqual([
      'yesterday',
    ])
  })

  it('leaves a long-running session opened today alone', () => {
    const earlyToday = session('early', 'a', new Date(2026, 8, 15, 0, 5).getTime(), null)
    expect(findAbandonedSessions([earlyToday], NOW)).toEqual([])
  })

  it('never invents a check-out time — it only identifies them', () => {
    const [found] = findAbandonedSessions([yesterday], NOW)
    expect(found?.checkOutAt).toBeNull()
    expect(found?.durationMs).toBeNull()
  })

  it('finds a session abandoned weeks ago, not just yesterday', () => {
    const old = session('old', 'd', NOW - 30 * 24 * HOUR_MS, null)
    expect(findAbandonedSessions([old], NOW).map((s) => s.id)).toEqual(['old'])
  })
})

describe('needsReview', () => {
  it('follows the flag, not the timestamps', () => {
    const flagged = session('a', 'a', NOW - 24 * HOUR_MS, null, { needsReview: true })
    expect(needsReview(flagged)).toBe(true)
    expect(needsReview(session('b', 'b', NOW, null))).toBe(false)
  })

  it('still flags a session carrying a check-out time a previous version guessed', () => {
    const migrated = session('c', 'c', NOW - 24 * HOUR_MS, NOW - 18 * HOUR_MS, {
      needsReview: true,
    })
    expect(needsReview(migrated)).toBe(true)
  })
})

describe('totalTimeToday', () => {
  it('sums only sessions that started today, counting an open one against now', () => {
    const sessions = [
      session('s1', 'a', new Date(2026, 8, 14, 9, 0).getTime(), new Date(2026, 8, 14, 10, 0).getTime()),
      session('s2', 'a', new Date(2026, 8, 15, 8, 0).getTime(), new Date(2026, 8, 15, 8, 30).getTime()),
      session('s3', 'a', NOW - 15 * MINUTE_MS, null),
    ]
    expect(totalTimeToday('a', sessions, NOW)).toBe(45 * MINUTE_MS)
    expect(totalTimeToday('b', sessions, NOW)).toBe(0)
  })
})

describe('buildRosterColumns', () => {
  const students = [
    student('s-brooks', 'Brooks', 'Dev'),
    student('s-maya', 'Alvarez', 'Maya'),
    student('s-ana', 'Alvarez', 'Ana'),
    student('s-gone', 'Zamora', 'Kit', { active: false }),
  ]
  const sessions = [
    session('open-maya', 's-maya', NOW - 83 * MINUTE_MS, null),
    session('done-brooks', 's-brooks', NOW - 2 * HOUR_MS, NOW - HOUR_MS),
    session('open-gone', 's-gone', NOW - 10 * MINUTE_MS, null),
  ]

  it('splits students into In and Out and sorts each by last then first name', () => {
    const columns = buildRosterColumns(students, sessions, NOW)
    expect(columns.in.map((c) => c.student.id)).toEqual(['s-maya'])
    expect(columns.out.map((c) => c.student.id)).toEqual(['s-ana', 's-brooks'])
  })

  it('omits soft-deleted students from both columns', () => {
    const columns = buildRosterColumns(students, sessions, NOW)
    const ids = [...columns.in, ...columns.out].map((c) => c.student.id)
    expect(ids).not.toContain('s-gone')
  })

  it('gives In cards a live duration and Out cards their total for today', () => {
    const columns = buildRosterColumns(students, sessions, NOW)
    expect(columns.in[0]?.durationMs).toBe(83 * MINUTE_MS)
    expect(columns.in[0]?.openSession?.id).toBe('open-maya')
    const brooks = columns.out.find((c) => c.student.id === 's-brooks')
    expect(brooks?.durationMs).toBe(HOUR_MS)
    expect(brooks?.openSession).toBeNull()
  })

  it('recomputes from now rather than incrementing, so a later now grows the duration', () => {
    const later = buildRosterColumns(students, sessions, NOW + 30 * MINUTE_MS)
    expect(later.in[0]?.durationMs).toBe(113 * MINUTE_MS)
  })

  it('handles an empty roster', () => {
    expect(buildRosterColumns([], [], NOW)).toEqual({ in: [], out: [] })
  })
})
