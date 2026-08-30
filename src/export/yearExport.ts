import { listClasses, listSessionsForSchoolYear, listStudents, type SchoolYear } from '../db'
import {
  SESSION_CSV_HEADERS,
  SUMMARY_CSV_HEADERS,
  buildSessionRows,
  buildSummaryRows,
  toCsv,
  type ExportInput,
} from '../domain'

export interface YearExportFile {
  fileName: string
  csv: string
  rowCount: number
}

export interface YearExport {
  schoolYear: SchoolYear
  files: YearExportFile[]
  totalRows: number
  classNames: string[]
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'class'
  )
}

/**
 * Builds the whole-year export: one row per session across every class, and a
 * per-student summary. Both carry a Class column, since a year's file spans
 * classes that the ordinary date-range export never mixes.
 *
 * Archived classes are included. So are soft-deleted students — this is the
 * last copy of the year, and it should not have holes in it.
 */
export async function buildYearExport(
  schoolYear: SchoolYear,
  now: number = Date.now(),
): Promise<YearExport> {
  const classes = await listClasses(schoolYear, { includeArchived: true })
  const allSessions = await listSessionsForSchoolYear(schoolYear)

  const sessionRows: string[][] = []
  const summaryRows: string[][] = []
  // Seeded so a year with no classes still exports a valid header-only file.
  let sessionHeader: string[] = ['Class', ...SESSION_CSV_HEADERS]
  let summaryHeader: string[] = ['Class', ...SUMMARY_CSV_HEADERS]

  for (const cls of classes) {
    const students = await listStudents(cls.id, { includeInactive: true })
    const input: ExportInput = {
      students,
      sessions: allSessions.filter((session) => session.classId === cls.id),
      now,
    }

    const [ownSessionHeader = [], ...ownSessionRows] = buildSessionRows(input)
    const [ownSummaryHeader = [], ...ownSummaryRows] = buildSummaryRows(input)
    sessionHeader = ['Class', ...ownSessionHeader]
    summaryHeader = ['Class', ...ownSummaryHeader]
    for (const row of ownSessionRows) sessionRows.push([cls.name, ...row])
    for (const row of ownSummaryRows) summaryRows.push([cls.name, ...row])
  }

  const files: YearExportFile[] = [
    {
      fileName: `${slug(schoolYear)}_all-sessions.csv`,
      csv: toCsv([sessionHeader, ...sessionRows]),
      rowCount: sessionRows.length,
    },
    {
      fileName: `${slug(schoolYear)}_student-totals.csv`,
      csv: toCsv([summaryHeader, ...summaryRows]),
      rowCount: summaryRows.length,
    },
  ]

  return {
    schoolYear,
    files,
    totalRows: sessionRows.length,
    classNames: classes.map((cls) => cls.name),
  }
}
