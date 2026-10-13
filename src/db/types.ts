/** Epoch milliseconds. Never store formatted time strings. */
export type EpochMs = number

/** School-year namespace key, e.g. "2026-2027". */
export type SchoolYear = string

export interface Teacher {
  /** The Supabase Auth user id. */
  id: string
  displayName: string
  /** What they type to sign in. Lowercase. */
  username: string
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
 * A student's *active* session is one with no check-out that has not been
 * flagged `needsReview`. A session abandoned on an earlier day is still
 * unclosed, but is no longer the student's active one. The database enforces
 * at most one active session per student.
 */
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
}

/** Small per-teacher key/value store for app-level state (sound, active class, flags). */
export interface SettingRecord {
  key: string
  value: unknown
}
