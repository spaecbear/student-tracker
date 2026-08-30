import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createClass, createStudent, createTeacher } from './db'
import { resetDBConnectionForTests } from './db/schema'
import { createCredential } from './auth/password'
import { schoolYearForDate } from './domain'

const PASSWORD = 'Bio Room 214!'
const ITERATIONS = 1000

vi.mock('./audio/tones', () => ({ playCue: vi.fn() }))

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange
  resetDBConnectionForTests()
  localStorage.clear()

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

    expect(await screen.findByRole('alert')).toHaveTextContent('does not match')
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Add student' })).not.toBeInTheDocument(),
    )
  })
})
