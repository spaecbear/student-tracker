/** Epoch milliseconds. Never store formatted time strings. */
export type EpochMs = number

/** School-year namespace key, e.g. "2026-2027". */
export type SchoolYear = string

export interface Teacher {
  id: string
  displayName: string
  /** PBKDF2-derived key, base64. */
  passwordHash: string
  /** Random salt, base64. */
  salt: string
  /** PBKDF2 iteration count in force when the hash was derived. */
  iterations: number
  /** Hash of the printable recovery code, base64. */
  recoveryHash: string
  createdAt: EpochMs
}

export interface Class {
  id: string
  teacherId: string
  name: string
  /** Theme key, e.g. "teal". Matches a key in src/themes. */
  colorTheme: string
  schoolYear: SchoolYear
  createdAt: EpochMs
  archived: boolean
}

export interface Student {
  id: string
  classId: string
  firstName: string
  lastName: string
  grade: string
  /** Optional school-assigned ID. */
  studentId?: string
  /** Soft delete: false hides the card but preserves session history. */
  active: boolean
  createdAt: EpochMs
}

/**
 * IndexedDB cannot index `null`, so an open session would fall out of a
 * [studentId, checkOutAt] index entirely. `openMarker` is a stored mirror of
 * "is this the student's *active* session" (1 = active, 0 = not) so the lookup
 * stays indexed. It is maintained exclusively by the functions in
 * `db/sessions.ts`.
 *
 * Note this is not simply `checkOutAt === null`: a session abandoned on an
 * earlier day is still unclosed, but is no longer the student's active one —
 * see `needsReview`.
 */
export type OpenMarker = 0 | 1

export interface Session {
  id: string
  studentId: string
  classId: string
  schoolYear: SchoolYear
  checkInAt: EpochMs
  checkOutAt: EpochMs | null
  /** Computed on checkout and stored so export does no math. */
  durationMs: number | null
  /**
   * True when a session was left open past its own day. The app never guesses
   * a check-out time; the session stays unclosed and waits for the teacher to
   * enter the real one.
   */
  needsReview: boolean
  openMarker: OpenMarker
}

/** Small key/value store for app-level state (theme, sound, flags). */
export interface SettingRecord {
  key: string
  value: unknown
}
