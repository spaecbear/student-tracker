import {
  checkIn,
  checkOut,
  createClass,
  createStudents,
  createTeacher,
  flagForReview,
  getPrimaryTeacher,
  listClasses,
  type Class,
} from '../db'
import { MINUTE_MS, localTimeOnDay, schoolYearForDate, startOfLocalDay } from '../domain'
import { THEME_KEYS } from '../themes'

/**
 * Dev-only fixture data. Thirty students with a few weeks of plausible
 * sessions, so the export and year-lifecycle work can be exercised without
 * clicking through check-ins by hand. Never imported by production code paths.
 */

const ROSTER: ReadonlyArray<readonly [string, string, string]> = [
  ['Alvarez', 'Maya', '10'],
  ['Baptiste', 'Noel', '10'],
  ['Brooks', 'Dev', '10'],
  ['Cardenas', 'Iris', '9'],
  ['Chen', 'Wesley', '11'],
  ['Cole', 'Amara', '10'],
  ['Delgado', 'Rafa', '9'],
  ['Ellis', 'Jonah', '10'],
  ['Farah', 'Sadia', '11'],
  ['Fitzgerald', 'Quinn', '10'],
  ['Gagnon', 'Elise', '9'],
  ['Haddad', 'Yusuf', '10'],
  ['Ibarra', 'Lucia', '11'],
  ['Jensen', 'Marek', '10'],
  ['Kaur', 'Simran', '9'],
  ['Lindqvist', 'Tove', '10'],
  ['Mbeki', 'Thandi', '11'],
  ['Moreau', 'Celeste', '10'],
  ['Nakamura', 'Ren', '9'],
  ['Okonkwo', 'Chidi', '10'],
  ['Petrov', 'Anya', '11'],
  ['Quiroga', 'Mateo', '10'],
  ['Rasmussen', 'Freya', '9'],
  ['Silva', 'Bruno', '10'],
  ['Tran', 'Linh', '11'],
  ['Ubaldo', 'Nina', '10'],
  ['Vasquez', 'Emilio', '9'],
  ['Whitfield', 'Cora', '10'],
  ['Yamamoto', 'Kenji', '11'],
  ['Zieliński', 'Igor', '10'],
]

/** Deterministic PRNG so a reseed produces the same data to compare against. */
function makeRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296
    return state / 4_294_967_296
  }
}

function isWeekday(at: number): boolean {
  const day = new Date(at).getDay()
  return day !== 0 && day !== 6
}

export interface SeedOptions {
  /** School days of history to generate, ending today. */
  days?: number
  className?: string
  now?: number
}

export interface SeedResult {
  classId: string
  students: number
  sessions: number
}

export async function seedDemoData(options: SeedOptions = {}): Promise<SeedResult> {
  const now = options.now ?? Date.now()
  const days = options.days ?? 20
  const schoolYear = schoolYearForDate(now)
  const random = makeRandom(20260915)

  const teacher =
    (await getPrimaryTeacher()) ??
    (await createTeacher(
      {
        displayName: 'Amanda',
        // Placeholder only — the real credential is set in the teacher view.
        passwordHash: '',
        salt: '',
        recoveryHash: '',
        iterations: 0,
      },
      now,
    ))

  const existing = await listClasses(schoolYear)
  const cls: Class =
    existing.find((c) => c.name === (options.className ?? 'Period 3 Biology')) ??
    (await createClass(
      {
        teacherId: teacher.id,
        name: options.className ?? 'Period 3 Biology',
        colorTheme: THEME_KEYS[0] ?? 'teal',
        schoolYear,
      },
      now,
    ))

  const students = await createStudents(
    ROSTER.map(([lastName, firstName, grade], index) => ({
      classId: cls.id,
      lastName,
      firstName,
      grade,
      studentId: String(10_100 + index * 7),
    })),
    now,
  )

  let sessionCount = 0
  const today = startOfLocalDay(now)

  for (let back = days; back >= 1; back -= 1) {
    const day = startOfLocalDay(today - back * 86_400_000)
    if (!isWeekday(day)) continue

    for (const student of students) {
      if (random() > 0.86) continue // absent

      const inAt = localTimeOnDay(day, 9, 5 + Math.floor(random() * 15))
      const session = await checkIn({
        studentId: student.id,
        classId: cls.id,
        schoolYear,
        checkInAt: inAt,
      })
      sessionCount += 1

      if (random() < 0.04) {
        // Forgot to check out: left unclosed and flagged, exactly as the
        // abandoned-session sweep would leave it for the teacher to fix.
        await flagForReview(session.id)
      } else {
        await checkOut(session.id, inAt + (40 + Math.floor(random() * 55)) * MINUTE_MS)
      }
    }
  }

  // A handful of students are in the room right now.
  for (const student of students.slice(0, 6)) {
    await checkIn({
      studentId: student.id,
      classId: cls.id,
      schoolYear,
      checkInAt: now - Math.floor(10 + random() * 70) * MINUTE_MS,
    })
    sessionCount += 1
  }

  return { classId: cls.id, students: students.length, sessions: sessionCount }
}
