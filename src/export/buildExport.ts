import { listSessionsInRange, listStudents } from '../db'
import {
  buildSessionRows,
  buildSummaryRows,
  countExportRows,
  endOfLocalDay,
  exportFileName,
  startOfLocalDay,
  toCsv,
  type ExportInput,
} from '../domain'

export type ExportMode = 'sessions' | 'summary'

export interface ExportRequest {
  classId: string
  className: string
  /** Any instant on the first day of the range; widened to local midnight. */
  fromAt: number
  /** Any instant on the last day of the range; widened to end of local day. */
  toAt: number
  mode: ExportMode
  now?: number
}

export interface BuiltExport {
  rows: string[][]
  /** Data rows, excluding the header — what the preview reports. */
  rowCount: number
  csv: string
  fileName: string
}

/**
 * Reads a class's sessions for a date range and renders them through the
 * domain formatters. Soft-deleted students are included: their history is
 * exactly what must not develop holes.
 */
export async function loadExportInput(
  classId: string,
  fromAt: number,
  toAt: number,
  now: number = Date.now(),
): Promise<ExportInput> {
  const [sessions, students] = await Promise.all([
    listSessionsInRange(classId, startOfLocalDay(fromAt), endOfLocalDay(toAt)),
    listStudents(classId, { includeInactive: true }),
  ])
  return { sessions, students, now }
}

export async function buildExport(request: ExportRequest): Promise<BuiltExport> {
  const now = request.now ?? Date.now()
  const input = await loadExportInput(request.classId, request.fromAt, request.toAt, now)
  const rows =
    request.mode === 'sessions' ? buildSessionRows(input) : buildSummaryRows(input)
  return {
    rows,
    rowCount: countExportRows(rows),
    csv: toCsv(rows),
    fileName: exportFileName(request.className, request.fromAt, request.toAt, request.mode),
  }
}
