/**
 * Parsing for the teacher's bulk-add box. Pure text in, plain records out —
 * the caller decides what to write. Accepts what a teacher would realistically
 * paste: a column of names, a CSV export, or a tab-separated spreadsheet copy.
 */

export interface ParsedStudent {
  firstName: string
  lastName: string
  grade: string
  studentId?: string
}

export interface RosterParseError {
  /** 1-based line number as the teacher sees it in the textarea. */
  line: number
  text: string
  message: string
}

export interface RosterParseResult {
  students: ParsedStudent[]
  errors: RosterParseError[]
}

const HEADER_PATTERN = /^\s*(last\s*name|last)\b/i

function splitFields(line: string): string[] {
  const separator = line.includes('\t') ? '\t' : ','
  return line.split(separator).map((field) => field.trim())
}

/** "Alvarez Maya" or "Maya Alvarez" — the trailing token is the last name. */
function parseWhitespaceName(text: string): ParsedStudent | null {
  const parts = text.split(/\s+/).filter(Boolean)
  if (parts.length < 2) return null
  const lastName = parts[parts.length - 1] as string
  const firstName = parts.slice(0, -1).join(' ')
  return { firstName, lastName, grade: '' }
}

export function parseRosterText(input: string): RosterParseResult {
  const students: ParsedStudent[] = []
  const errors: RosterParseError[] = []

  input.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim()
    if (line === '') return
    if (index === 0 && HEADER_PATTERN.test(line)) return

    const fields = splitFields(line)
    const hasSeparator = fields.length > 1

    if (!hasSeparator) {
      const parsed = parseWhitespaceName(line)
      if (!parsed) {
        errors.push({
          line: index + 1,
          text: line,
          message: 'Needs a first and last name.',
        })
        return
      }
      students.push(parsed)
      return
    }

    const [lastName = '', firstName = '', grade = '', studentId = ''] = fields
    if (lastName === '' || firstName === '') {
      errors.push({
        line: index + 1,
        text: line,
        message: 'Needs both a last name and a first name.',
      })
      return
    }

    const student: ParsedStudent = { lastName, firstName, grade }
    if (studentId !== '') student.studentId = studentId
    students.push(student)
  })

  return { students, errors }
}

/** Case- and space-insensitive key for spotting duplicates against a roster. */
export function studentKey(student: Pick<ParsedStudent, 'firstName' | 'lastName'>): string {
  return `${student.lastName.trim().toLowerCase()}|${student.firstName.trim().toLowerCase()}`
}

/** Splits parsed students into the ones to add and the ones already on the roster. */
export function partitionNewStudents<T extends Pick<ParsedStudent, 'firstName' | 'lastName'>>(
  parsed: readonly ParsedStudent[],
  existing: readonly T[],
): { toAdd: ParsedStudent[]; duplicates: ParsedStudent[] } {
  const seen = new Set(existing.map(studentKey))
  const toAdd: ParsedStudent[] = []
  const duplicates: ParsedStudent[] = []
  for (const student of parsed) {
    const key = studentKey(student)
    if (seen.has(key)) {
      duplicates.push(student)
    } else {
      seen.add(key)
      toAdd.push(student)
    }
  }
  return { toAdd, duplicates }
}
