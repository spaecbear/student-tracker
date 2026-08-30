import { describe, expect, it } from 'vitest'
import {
  expiredSchoolYears,
  isSchoolYearExpired,
  schoolYearEndAt,
  schoolYearForDate,
  schoolYearLabel,
  schoolYearStartYear,
} from './schoolYear'
import { formatDateISO } from './time'

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime()

describe('schoolYearForDate', () => {
  it('starts a new year on 8/1', () => {
    expect(schoolYearForDate(at(2026, 7, 31))).toBe('2025-2026')
    expect(schoolYearForDate(at(2026, 8, 1))).toBe('2026-2027')
    expect(schoolYearForDate(at(2026, 12, 31))).toBe('2026-2027')
  })

  it('keeps January through May in the year that began the prior August', () => {
    expect(schoolYearForDate(at(2027, 1, 1))).toBe('2026-2027')
    expect(schoolYearForDate(at(2027, 5, 31))).toBe('2026-2027')
  })

  it('leaves June and July on the prior year, which stays active', () => {
    expect(schoolYearForDate(at(2027, 6, 1))).toBe('2026-2027')
    expect(schoolYearForDate(at(2027, 6, 30))).toBe('2026-2027')
    expect(schoolYearForDate(at(2027, 7, 31))).toBe('2026-2027')
  })
})

describe('school year keys', () => {
  it('parses a start year and rejects malformed keys', () => {
    expect(schoolYearStartYear('2026-2027')).toBe(2026)
    for (const value of ['2026-2028', '2026', '26-27', '']) {
      expect(schoolYearStartYear(value)).toBeNull()
    }
  })

  it('compares years for expiry', () => {
    expect(isSchoolYearExpired('2025-2026', '2026-2027')).toBe(true)
    expect(isSchoolYearExpired('2026-2027', '2026-2027')).toBe(false)
    expect(isSchoolYearExpired('2027-2028', '2026-2027')).toBe(false)
  })

  it('never reports a malformed key as expired', () => {
    expect(isSchoolYearExpired('garbage', '2026-2027')).toBe(false)
  })

  it('lists stored years older than the active one, oldest first', () => {
    const stored = ['2026-2027', '2024-2025', '2025-2026', '2024-2025']
    expect(expiredSchoolYears(stored, at(2026, 9, 15))).toEqual(['2024-2025', '2025-2026'])
  })

  it('reports nothing expired during the June gap', () => {
    expect(expiredSchoolYears(['2026-2027'], at(2027, 6, 15))).toEqual([])
  })

  it('resolves the 6/1 end date and a readable label', () => {
    expect(formatDateISO(schoolYearEndAt('2026-2027') as number)).toBe('2027-06-01')
    expect(schoolYearEndAt('nope')).toBeNull()
    expect(schoolYearLabel('2026-2027')).toBe('2026–2027 school year')
  })
})
