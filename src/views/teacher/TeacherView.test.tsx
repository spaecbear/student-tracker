import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkIn,
  createClass,
  createStudent,
  createTeacher,
  flagForReview,
  getSession,
  listSessionsInRange,
  listStudents,
  type Class,
} from '../../db'
import { resetDBConnectionForTests } from '../../db/schema'
import { createCredential } from '../../auth/password'
import type { Classroom } from '../../hooks/useClassroom'
import { TeacherView } from './TeacherView'
import { useTeacherAuth } from '../../hooks/useTeacherAuth'
import { useAppSettings } from '../../hooks/useAppSettings'
import { useColorScheme } from '../../hooks/useColorScheme'
import { schoolYearForDate } from '../../domain'

const PASSWORD = 'Bio Room 214!'
const ITERATIONS = 1000

let cls: Class

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange
  resetDBConnectionForTests()

  const now = Date.now()
  const credential = await createCredential(PASSWORD, ITERATIONS)
  const teacher = await createTeacher(
    {
      displayName: 'Amanda',
      passwordHash: credential.passwordHash,
      salt: credential.salt,
      iterations: credential.iterations,
      recoveryHash: credential.recoveryHash,
    },
    now,
  )
  cls = await createClass(
    {
      teacherId: teacher.id,
      name: 'Period 3 Biology',
      colorTheme: 'teal',
      schoolYear: schoolYearForDate(now),
    },
    now,
  )
})

function classroom(over: Partial<Classroom> = {}): Classroom {
  return {
    status: 'ready',
    classes: [cls],
    activeClass: cls,
    students: [],
    sessions: [],
    error: null,
    selectClass: vi.fn(),
    checkIn: vi.fn(),
    checkOut: vi.fn(),
    refresh: vi.fn(),
    dismissError: vi.fn(),
    ...over,
  }
}

function Harness({ room = classroom() }: { room?: Classroom }) {
  const auth = useTeacherAuth()
  const colorScheme = useColorScheme()
  const settings = useAppSettings()
  return (
    <TeacherView
      auth={auth}
      classroom={room}
      colorScheme={colorScheme}
      settings={settings}
      onExit={vi.fn()}
    />
  )
}

async function unlock(user: ReturnType<typeof userEvent.setup>) {
  render(<Harness />)
  const field = await screen.findByLabelText('Password')
  await user.type(field, PASSWORD)
  await user.click(screen.getByRole('button', { name: 'Unlock' }))
  await screen.findByRole('heading', { name: 'Period 3 Biology' })
}

describe('teacher gate', () => {
  it('asks for the password before showing anything', async () => {
    render(<Harness />)
    expect(await screen.findByRole('heading', { name: 'Teacher access' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add student' })).not.toBeInTheDocument()
  })

  it('rejects a wrong password and stays locked', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(await screen.findByLabelText('Password'), 'guess')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('does not match')
    expect(screen.queryByRole('button', { name: 'Add student' })).not.toBeInTheDocument()
  })

  it('opens the roster with the right password and can lock again', async () => {
    const user = userEvent.setup()
    await unlock(user)
    expect(screen.getByRole('button', { name: 'Add student' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Lock' }))
    expect(await screen.findByRole('heading', { name: 'Teacher access' })).toBeInTheDocument()
  })

  it('offers the recovery path', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(await screen.findByRole('button', { name: /forgot my password/i }))
    expect(screen.getByLabelText('Recovery code')).toBeInTheDocument()
  })
})

describe('roster management', () => {
  it('adds a student and shows them on the roster', async () => {
    const user = userEvent.setup()
    await unlock(user)

    await user.type(screen.getByLabelText('First name'), 'Maya')
    await user.type(screen.getByLabelText('Last name'), 'Alvarez')
    await user.type(screen.getByLabelText('Grade'), '10')
    await user.type(screen.getByLabelText('Student ID'), '10442')
    await user.click(screen.getByRole('button', { name: 'Add student' }))

    expect(await screen.findByText('Alvarez, Maya')).toBeInTheDocument()
    expect(screen.getByText(/Grade 10 · ID 10442/)).toBeInTheDocument()
    await waitFor(async () => expect(await listStudents(cls.id)).toHaveLength(1))
  })

  it('soft-deletes on Remove and can restore', async () => {
    await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      Date.now(),
    )
    const user = userEvent.setup()
    await unlock(user)

    await user.click(await screen.findByRole('button', { name: 'Remove' }))
    expect(await screen.findByText(/Removed \(1\)/)).toBeInTheDocument()
    await waitFor(async () => expect(await listStudents(cls.id)).toHaveLength(0))
    expect(await listStudents(cls.id, { includeInactive: true })).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(async () => expect(await listStudents(cls.id)).toHaveLength(1))
  })

  it('requires an explicit confirmation before a permanent delete', async () => {
    const student = await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      Date.now(),
    )
    await checkIn({
      studentId: student.id,
      classId: cls.id,
      schoolYear: schoolYearForDate(Date.now()),
      checkInAt: Date.now(),
    })
    const user = userEvent.setup()
    await unlock(user)

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/every session they have ever recorded/i)).toBeInTheDocument()

    // Backing out changes nothing.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(await listStudents(cls.id, { includeInactive: true })).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))
    await waitFor(async () =>
      expect(await listStudents(cls.id, { includeInactive: true })).toHaveLength(0),
    )
    expect(await listSessionsInRange(cls.id, 0, Date.now() + 1000)).toHaveLength(0)
  })

  it('bulk-adds a pasted list and skips names already on the roster', async () => {
    await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      Date.now(),
    )
    const user = userEvent.setup()
    await unlock(user)

    await user.click(await screen.findByRole('button', { name: 'Paste a list' }))
    await user.type(
      screen.getByLabelText('Student list'),
      'Alvarez, Maya, 10{Enter}Brooks, Dev, 10, 10118{Enter}Mononym',
    )

    expect(screen.getByText(/already on the roster/)).toBeInTheDocument()
    expect(screen.getByText(/Line 3/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add 1 student' }))
    await waitFor(async () => expect(await listStudents(cls.id)).toHaveLength(2))
  })
})

describe('session correction', () => {
  it('closes an open session and corrects its times', async () => {
    const student = await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      Date.now(),
    )
    const checkInAt = new Date().setHours(9, 14, 0, 0)
    await checkIn({
      studentId: student.id,
      classId: cls.id,
      schoolYear: schoolYearForDate(Date.now()),
      checkInAt,
    })

    const user = userEvent.setup()
    await unlock(user)
    await user.click(screen.getByRole('button', { name: 'Sessions' }))

    expect(await screen.findByText('still in')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close now' }))
    await waitFor(() => expect(screen.queryByText('still in')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const outField = screen.getByLabelText('Check out (24-hour)')
    await user.clear(outField)
    await user.type(outField, '10:47')
    await user.click(screen.getByRole('button', { name: 'Save times' }))

    await waitFor(async () => {
      const [saved] = await listSessionsInRange(cls.id, 0, Date.now() + 86_400_000)
      expect(saved?.durationMs).toBe(93 * 60_000)
    })
    expect(await screen.findByText('01:33')).toBeInTheDocument()
  })

  it('lists a session that never got a check-out, without inventing a time', async () => {
    const student = await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      Date.now(),
    )
    const yesterday = new Date(Date.now() - 86_400_000).setHours(9, 14, 0, 0)
    const session = await checkIn({
      studentId: student.id,
      classId: cls.id,
      schoolYear: schoolYearForDate(yesterday),
      checkInAt: yesterday,
    })
    await flagForReview(session.id)

    const user = userEvent.setup()
    await unlock(user)
    await user.click(screen.getByRole('button', { name: 'Sessions' }))

    expect(await screen.findByText(/never got a check-out/)).toBeInTheDocument()
    expect(screen.getByText('Alvarez, Maya')).toBeInTheDocument()

    // The teacher supplies the real time; nothing was guessed for her.
    await user.click(screen.getByRole('button', { name: 'Set check-out' }))
    const outField = screen.getByLabelText('Check out (24-hour)')
    await user.type(outField, '10:47')
    await user.click(screen.getByRole('button', { name: 'Save times' }))

    await waitFor(async () => {
      const saved = await getSession(session.id)
      expect(saved?.durationMs).toBe(93 * 60_000)
      expect(saved?.needsReview).toBe(false)
    })
    await waitFor(() =>
      expect(screen.queryByText(/never got a check-out/)).not.toBeInTheDocument(),
    )
  })

  it('adds a session for a student who never tapped in at all', async () => {
    const student = await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      Date.now(),
    )
    const user = userEvent.setup()
    await unlock(user)
    await user.click(screen.getByRole('button', { name: 'Sessions' }))
    await user.click(await screen.findByRole('button', { name: 'Add a session' }))

    await user.type(screen.getByLabelText('Check in (24-hour)'), '09:14')
    await user.type(screen.getByLabelText('Check out (24-hour)'), '10:47')
    await user.click(screen.getByRole('button', { name: 'Add session' }))

    await waitFor(async () => {
      const [added] = await listSessionsInRange(cls.id, 0, Date.now() + 86_400_000)
      expect(added?.studentId).toBe(student.id)
      expect(added?.durationMs).toBe(93 * 60_000)
      expect(added?.needsReview).toBe(false)
    })
    expect(await screen.findByText('01:33')).toBeInTheDocument()
  })

  it('adds a session with no check-out yet and puts it on the review list', async () => {
    await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      Date.now(),
    )
    const user = userEvent.setup()
    await unlock(user)
    await user.click(screen.getByRole('button', { name: 'Sessions' }))
    await user.click(await screen.findByRole('button', { name: 'Add a session' }))

    await user.type(screen.getByLabelText('Check in (24-hour)'), '09:14')
    await user.click(screen.getByRole('button', { name: 'Add session' }))

    expect(await screen.findByText(/never got a check-out/)).toBeInTheDocument()
  })

  it('refuses a malformed time rather than storing a guess', async () => {
    await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      Date.now(),
    )
    const user = userEvent.setup()
    await unlock(user)
    await user.click(screen.getByRole('button', { name: 'Sessions' }))
    await user.click(await screen.findByRole('button', { name: 'Add a session' }))

    await user.type(screen.getByLabelText('Check in (24-hour)'), '25:99')
    await user.click(screen.getByRole('button', { name: 'Add session' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('24-hour clock')
    expect(await listSessionsInRange(cls.id, 0, Date.now() + 86_400_000)).toHaveLength(0)
  })

  it('deletes an erroneous session only after confirmation', async () => {
    const student = await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      Date.now(),
    )
    await checkIn({
      studentId: student.id,
      classId: cls.id,
      schoolYear: schoolYearForDate(Date.now()),
      checkInAt: new Date().setHours(9, 14, 0, 0),
    })

    const user = userEvent.setup()
    await unlock(user)
    await user.click(screen.getByRole('button', { name: 'Sessions' }))
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete session' }))

    await waitFor(async () =>
      expect(await listSessionsInRange(cls.id, 0, Date.now() + 86_400_000)).toHaveLength(0),
    )
  })
})

describe('two teachers sharing one device', () => {
  /** Dave joins the device; Amanda's Period 3 Biology already exists. */
  async function addDave() {
    const credential = await createCredential('chem-lab-2', ITERATIONS)
    const dave = await createTeacher(
      {
        displayName: 'Dave',
        passwordHash: credential.passwordHash,
        salt: credential.salt,
        iterations: credential.iterations,
        recoveryHash: credential.recoveryHash,
      },
      Date.now() + 1000,
    )
    const chemistry = await createClass(
      {
        teacherId: dave.id,
        name: 'Period 4 Chemistry',
        colorTheme: 'rose',
        schoolYear: schoolYearForDate(Date.now()),
      },
      Date.now(),
    )
    await createStudent(
      { classId: chemistry.id, firstName: 'Dev', lastName: 'Brooks', grade: '11' },
      Date.now(),
    )
    return { dave, chemistry }
  }

  async function signInAs(user: ReturnType<typeof userEvent.setup>, name: string, password: string) {
    render(<Harness />)
    const picker = await screen.findByLabelText('Teacher')
    await user.selectOptions(picker, screen.getByRole('option', { name }))
    await user.type(screen.getByLabelText('Password'), password)
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
  }

  it('offers a teacher picker once there is more than one account', async () => {
    await addDave()
    render(<Harness />)
    const picker = await screen.findByLabelText('Teacher')
    expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Amanda',
      'Dave',
    ])
  })

  it('shows each teacher only their own roster', async () => {
    await addDave()
    await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      Date.now(),
    )

    const user = userEvent.setup()
    await signInAs(user, 'Dave', 'chem-lab-2')

    expect(await screen.findByRole('heading', { name: 'Period 4 Chemistry' })).toBeInTheDocument()
    expect(await screen.findByText('Brooks, Dev')).toBeInTheDocument()
    // Amanda's student must not be reachable from Dave's session.
    expect(screen.queryByText('Alvarez, Maya')).not.toBeInTheDocument()
  })

  it('lists only the signed-in teacher’s classes', async () => {
    await addDave()
    const user = userEvent.setup()
    await signInAs(user, 'Dave', 'chem-lab-2')
    await screen.findByRole('heading', { name: 'Period 4 Chemistry' })

    await user.click(screen.getByRole('button', { name: 'Classes' }))
    // Appears twice: the header and its row in the list.
    await waitFor(() => expect(screen.getAllByText('Period 4 Chemistry').length).toBe(2))
    expect(screen.queryByText('Period 3 Biology')).not.toBeInTheDocument()
  })

  it('offers only their own classes for export', async () => {
    await addDave()
    const user = userEvent.setup()
    await signInAs(user, 'Dave', 'chem-lab-2')
    await screen.findByRole('heading', { name: 'Period 4 Chemistry' })

    await user.click(screen.getByRole('button', { name: 'Export' }))
    const picker = await screen.findByLabelText('Class')
    expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Period 4 Chemistry',
    ])
  })

  it('does not fall through to another teacher’s class when the card wall shows it', async () => {
    const { dave } = await addDave()
    await createStudent(
      { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
      Date.now(),
    )

    // The device is showing Amanda's class; Dave signs in anyway.
    const user = userEvent.setup()
    render(<Harness room={classroom({ activeClass: cls })} />)
    const picker = await screen.findByLabelText('Teacher')
    await user.selectOptions(picker, screen.getByRole('option', { name: 'Dave' }))
    await user.type(screen.getByLabelText('Password'), 'chem-lab-2')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))

    expect(await screen.findByRole('heading', { name: 'Period 4 Chemistry' })).toBeInTheDocument()
    expect(screen.queryByText('Alvarez, Maya')).not.toBeInTheDocument()
    expect(dave.id).not.toBe(cls.teacherId)
  })

  it('tells a brand-new teacher to make a class rather than showing someone else’s', async () => {
    const credential = await createCredential('newbie-pass', ITERATIONS)
    await createTeacher(
      {
        displayName: 'Sam',
        passwordHash: credential.passwordHash,
        salt: credential.salt,
        iterations: credential.iterations,
        recoveryHash: credential.recoveryHash,
      },
      Date.now() + 1000,
    )

    const user = userEvent.setup()
    await signInAs(user, 'Sam', 'newbie-pass')

    expect(await screen.findByText(/Create a class first/)).toBeInTheDocument()
    expect(screen.queryByText('Period 3 Biology')).not.toBeInTheDocument()
  })
})
