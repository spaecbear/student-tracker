import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createClass, createStudent } from './db'
import { schoolYearForDate } from './domain'
import { fakeSupabase } from './test/fakeSupabase'
import { signInTeacher } from './test/helpers'

const PASSWORD = 'Bio Room 214!'

vi.mock('./audio/tones', () => ({ playCue: vi.fn() }))

beforeEach(async () => {
  localStorage.clear()

  const now = Date.now()
  const teacher = signInTeacher('Amanda', PASSWORD)
  const cls = await createClass(
    {
      teacherId: teacher.id,
      name: 'Period 3 Biology',
      colorTheme: 'teal',
      schoolYear: schoolYearForDate(now),
    },
    now,
  )
  await createStudent(
    { classId: cls.id, firstName: 'Maya', lastName: 'Alvarez', grade: '10' },
    now,
  )
})

async function openTeacherView(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Teacher' }))
  await user.type(await screen.findByLabelText('Password'), PASSWORD)
  await user.click(screen.getByRole('button', { name: 'Unlock' }))
  return screen.findByRole('button', { name: 'Add student' })
}

describe('teacher access from the student view', () => {
  it('asks for the password on the way in', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Teacher' }))
    expect(await screen.findByRole('heading', { name: 'Teacher access' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add student' })).not.toBeInTheDocument()
  })

  it('locks again on the way back to the cards, so a second visit re-authenticates', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openTeacherView(user)

    await user.click(screen.getByRole('button', { name: 'Back to class' }))
    expect(await screen.findByRole('heading', { name: 'Period 3 Biology' })).toBeInTheDocument()

    // The whole point: a student tapping Teacher must not walk straight in.
    await user.click(screen.getByRole('button', { name: 'Teacher' }))
    expect(await screen.findByRole('heading', { name: 'Teacher access' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add student' })).not.toBeInTheDocument()
  })

  it('locks even when the teacher backs out of the password prompt itself', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openTeacherView(user)
    await user.click(screen.getByRole('button', { name: 'Lock' }))

    // Leaving from the locked gate returns to the cards, still locked.
    await user.click(await screen.findByRole('button', { name: 'Back to class' }))
    await user.click(await screen.findByRole('button', { name: 'Teacher' }))
    expect(await screen.findByRole('heading', { name: 'Teacher access' })).toBeInTheDocument()
  })

  it('re-opens with the right password after locking', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openTeacherView(user)
    await user.click(screen.getByRole('button', { name: 'Back to class' }))
    await screen.findByRole('heading', { name: 'Period 3 Biology' })

    await openTeacherView(user)
    expect(screen.getByRole('button', { name: 'Add student' })).toBeInTheDocument()
  })

  it('still refuses a wrong password on the second visit', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openTeacherView(user)
    await user.click(screen.getByRole('button', { name: 'Back to class' }))
    await screen.findByRole('heading', { name: 'Period 3 Biology' })

    await user.click(screen.getByRole('button', { name: 'Teacher' }))
    await user.type(await screen.findByLabelText('Password'), 'guess')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('do not match')
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Add student' })).not.toBeInTheDocument(),
    )
  })
})

describe('signing in to the device', () => {
  it('shows the sign-in screen, not the class, when nobody is signed in', async () => {
    fakeSupabase().signInAs(null)
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByText('Alvarez, Maya')).not.toBeInTheDocument()
  })

  it('signs in with a username and password and shows that teacher’s class', async () => {
    fakeSupabase().signInAs(null)
    const user = userEvent.setup()
    render(<App />)
    await user.type(await screen.findByLabelText('Username'), 'Amanda')
    await user.type(screen.getByLabelText('Password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Period 3 Biology' })).toBeInTheDocument()
    expect(await screen.findByText(/Maya/)).toBeInTheDocument()
  })

  it('says so plainly when the password is wrong', async () => {
    fakeSupabase().signInAs(null)
    const user = userEvent.setup()
    render(<App />)
    await user.type(await screen.findByLabelText('Username'), 'amanda')
    await user.type(screen.getByLabelText('Password'), 'nope-nope')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('do not match')
  })

  it('creates an account and makes the teacher confirm the recovery code before going on', async () => {
    fakeSupabase().signInAs(null)
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Create a teacher account' }))
    await user.type(screen.getByLabelText('Your name'), 'Dave Chen')
    await user.type(screen.getByLabelText('Username'), 'dchen')
    await user.type(screen.getByLabelText('New password'), 'chem-lab-2')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(
      await screen.findByRole('heading', { name: /write this recovery code down/i }),
    ).toBeInTheDocument()
    const done = screen.getByRole('button', { name: 'I have written it down' })
    expect(done).toBeDisabled()
    await user.click(screen.getByRole('checkbox'))
    await user.click(done)
    // Dave has no classes yet, so the empty state follows.
    expect(await screen.findByRole('heading', { name: 'No class set up yet' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /write this recovery code down/i })).toBeNull()
  })

  it('rejects a short password before contacting the server', async () => {
    fakeSupabase().signInAs(null)
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Create a teacher account' }))
    await user.type(screen.getByLabelText('Username'), 'dchen')
    await user.type(screen.getByLabelText('New password'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('at least 6')
    expect(fakeSupabase().users.some((u) => u.email.startsWith('dchen'))).toBe(false)
  })
})
