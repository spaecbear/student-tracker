import type { SchoolYear } from '../db/types'

/**
 * A school year runs 8/1 through 6/1.
 *
 *   - 8/1 onward            -> "{thisYear}-{nextYear}"
 *   - before 6/1            -> "{lastYear}-{thisYear}"
 *   - June and July         -> the gap; the prior year stays active, so it
 *                              resolves the same as "before 6/1"
 */
export const SCHOOL_YEAR_START_MONTH = 7 // August, zero-indexed
export const SCHOOL_YEAR_END_MONTH = 5 // June, zero-indexed

export function schoolYearForDate(at: number): SchoolYear {
  const d = new Date(at)
  const year = d.getFullYear()
  return d.getMonth() >= SCHOOL_YEAR_START_MONTH
    ? `${year}-${year + 1}`
    : `${year - 1}-${year}`
}

/** The calendar year a school-year key starts in, or null if malformed. */
export function schoolYearStartYear(schoolYear: SchoolYear): number | null {
  const match = /^(\d{4})-(\d{4})$/.exec(schoolYear)
  if (!match) return null
  const [, start, end] = match
  const startYear = Number(start)
  if (Number(end) !== startYear + 1) return null
  return startYear
}

/** True when `candidate` belongs to a year that ended before `current` began. */
export function isSchoolYearExpired(candidate: SchoolYear, current: SchoolYear): boolean {
  const candidateStart = schoolYearStartYear(candidate)
  const currentStart = schoolYearStartYear(current)
  if (candidateStart === null || currentStart === null) return false
  return candidateStart < currentStart
}

/** Every stored year older than the active one, oldest first. */
export function expiredSchoolYears(
  storedYears: readonly SchoolYear[],
  at: number,
): SchoolYear[] {
  const current = schoolYearForDate(at)
  return [...new Set(storedYears)]
    .filter((year) => isSchoolYearExpired(year, current))
    .sort()
}

/** Instant of 6/1 that closes the given school year — the purge-gate trigger. */
export function schoolYearEndAt(schoolYear: SchoolYear): number | null {
  const startYear = schoolYearStartYear(schoolYear)
  if (startYear === null) return null
  return new Date(startYear + 1, SCHOOL_YEAR_END_MONTH, 1).getTime()
}

export function schoolYearLabel(schoolYear: SchoolYear): string {
  const startYear = schoolYearStartYear(schoolYear)
  return startYear === null ? schoolYear : `${startYear}–${startYear + 1} school year`
}
