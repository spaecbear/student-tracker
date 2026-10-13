import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StorageError } from '../db'
import type { Session, Student } from '../db/types'
import { StudentView } from './StudentView'
import type { Classroom } from '../hooks/useClassroom'
import { CONFIRM_TIMEOUT_MS } from '../components/ConfirmDialog'
import { playCue } from '../audio/tones'

vi.mock('../audio/tones', () => ({ playCue: vi.fn() }))

const NOW = new Date(2026, 8, 15, 10, 0).getTime()
const MINUTE = 60_000

function student(id: string, lastName: string, firstName: string): Student {
  return {
    id,
    classId: 'c1',
    firstName,
    lastName,
    grade: '10',
    active: true,
    createdAt: 0,
  }
}

function openSession(id: string, studentId: string, checkInAt: number): Session {
  return {
    id,
    studentId,
    classId: 'c1',
    schoolYear: '2026-2027',
    checkInAt,
    checkOutAt: null,
    durationMs: null,
    needsReview: false,
  }
}

function classroom(over: Partial<Classroom> = {}): Classroom {
  return {
    status: 'ready',
    classes: [],
    activeClass: {
      id: 'c1',
      teacherId: 't1',
      name: 'Period 3 Biology',
      colorTheme: 'teal',
      schoolYear: '2026-2027',
      createdAt: 0,
      archived: false,
    },
    students: [student('s1', 'Alvarez', 'Maya'), student('s2', 'Brooks', 'Dev')],
    sessions: [openSession('open1', 's2', NOW - 83 * MINUTE)],
    error: null,
    selectClass: vi.fn(),
    checkIn: vi.fn().mockResolvedValue(undefined),
    checkOut: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn(),
    dismissError: vi.fn(),
    ...over,
  }
}

function renderView(room = classroom()) {
  render(
    <StudentView
      classroom={room}
      clockNow={NOW}
      durationNow={NOW}
      onOpenTeacherView={vi.fn()}
    />,
  )
  return room
}

afterEach(() => {
  vi.useRealTimers()
  vi.mocked(playCue).mockClear()
})

describe('StudentView', () => {
  it('shows the class name and the current time', () => {
    renderView()
    expect(screen.getByRole('heading', { name: 'Period 3 Biology' })).toBeInTheDocument()
    expect(screen.getByText('10:00 AM')).toBeInTheDocument()
  })

  it('puts checked-out students in Out and checked-in students in In', () => {
    renderView()
    const out = screen.getByRole('heading', { name: /out/i }).closest('section')
    const inColumn = screen.getByRole('heading', { name: /^in$/i }).closest('section')
    expect(within(out as HTMLElement).getByText('Alvarez, Maya')).toBeInTheDocument()
    expect(within(inColumn as HTMLElement).getByText('Brooks, Dev')).toBeInTheDocument()
  })

  it('shows check-in time and live duration on an In card', () => {
    renderView()
    expect(screen.getByText('In at 8:37 AM')).toBeInTheDocument()
    expect(screen.getByText('01:23')).toBeInTheDocument()
  })

  it('counts each column', () => {
    renderView()
    const out = screen.getByRole('heading', { name: /out/i }).closest('section')
    expect(within(out as HTMLElement).getByText('1')).toBeInTheDocument()
  })

  it('asks for confirmation before checking a student in', async () => {
    const user = userEvent.setup()
    const room = renderView()
    await user.click(screen.getByRole('button', { name: 'Check in Maya Alvarez' }))

    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText('Checking in')).toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { name: 'Maya Alvarez' })).toBeInTheDocument()
    expect(room.checkIn).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: /yes, i'm in/i }))
    expect(room.checkIn).toHaveBeenCalledWith('s1')
  })

  it('checks a student out through their open session', async () => {
    const user = userEvent.setup()
    const room = renderView()
    await user.click(screen.getByRole('button', { name: 'Check out Dev Brooks' }))

    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText('Checking out')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /yes, i'm out/i }))
    expect(room.checkOut).toHaveBeenCalledWith('open1')
  })

  it('records nothing when the student cancels', async () => {
    const user = userEvent.setup()
    const room = renderView()
    await user.click(screen.getByRole('button', { name: 'Check in Maya Alvarez' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(room.checkIn).not.toHaveBeenCalled()
  })

  it('dismisses itself after the timeout so a brushed screen records nothing', () => {
    vi.useFakeTimers()
    const room = classroom()
    render(<StudentView classroom={room} clockNow={NOW} durationNow={NOW} onOpenTeacherView={vi.fn()} />)

    // fireEvent rather than userEvent: userEvent's own async waits do not
    // cooperate with fake timers here.
    fireEvent.click(screen.getByRole('button', { name: 'Check in Maya Alvarez' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(CONFIRM_TIMEOUT_MS + 200)
    })

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(room.checkIn).not.toHaveBeenCalled()
  })

  it('recomputes durations from the tick rather than incrementing', () => {
    const room = classroom()
    const { rerender } = render(
      <StudentView
        classroom={room}
        clockNow={NOW}
        durationNow={NOW}
        onOpenTeacherView={vi.fn()}
      />,
    )
    expect(screen.getByText('01:23')).toBeInTheDocument()

    rerender(
      <StudentView
        classroom={room}
        clockNow={NOW + 30 * MINUTE}
        durationNow={NOW + 30 * MINUTE}
        onOpenTeacherView={vi.fn()}
      />,
    )
    expect(screen.getByText('01:53')).toBeInTheDocument()
  })

  it('surfaces a storage failure instead of hiding it', () => {
    renderView(classroom({ error: new StorageError('Quota exceeded.') }))
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Quota exceeded.')
  })

  it('stays silent when sound is switched off, which is the default', async () => {
    const user = userEvent.setup()
    const room = classroom()
    render(
      <StudentView
        classroom={room}
        clockNow={NOW}
        durationNow={NOW}
        onOpenTeacherView={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Check in Maya Alvarez' }))
    await user.click(screen.getByRole('button', { name: /yes, i'm in/i }))
    expect(playCue).not.toHaveBeenCalled()
  })

  it('plays a rising cue in and a falling cue out when sound is on', async () => {
    const user = userEvent.setup()
    const room = classroom()
    render(
      <StudentView
        classroom={room}
        clockNow={NOW}
        durationNow={NOW}
        soundEnabled
        onOpenTeacherView={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Check in Maya Alvarez' }))
    await user.click(screen.getByRole('button', { name: /yes, i'm in/i }))
    expect(playCue).toHaveBeenCalledWith('in')

    await user.click(screen.getByRole('button', { name: 'Check out Dev Brooks' }))
    await user.click(screen.getByRole('button', { name: /yes, i'm out/i }))
    expect(playCue).toHaveBeenCalledWith('out')
  })

  it('does not play a cue for a cancelled tap', async () => {
    const user = userEvent.setup()
    render(
      <StudentView
        classroom={classroom()}
        clockNow={NOW}
        durationNow={NOW}
        soundEnabled
        onOpenTeacherView={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Check in Maya Alvarez' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(playCue).not.toHaveBeenCalled()
  })

  it('can hide the daily total on Out cards', () => {
    const room = classroom({
      sessions: [
        {
          id: 'done',
          studentId: 's1',
          classId: 'c1',
          schoolYear: '2026-2027',
          checkInAt: NOW - 2 * 60 * MINUTE,
          checkOutAt: NOW - 60 * MINUTE,
          durationMs: 60 * MINUTE,
          needsReview: false,
        },
      ],
    })
    const { rerender } = render(
      <StudentView
        classroom={room}
        clockNow={NOW}
        durationNow={NOW}
        onOpenTeacherView={vi.fn()}
      />,
    )
    expect(screen.getByText('today')).toBeInTheDocument()

    rerender(
      <StudentView
        classroom={room}
        clockNow={NOW}
        durationNow={NOW}
        showDailyTotal={false}
        onOpenTeacherView={vi.fn()}
      />,
    )
    expect(screen.queryByText('today')).not.toBeInTheDocument()
  })

  it('hides soft-deleted students', () => {
    const removed = { ...student('s3', 'Zamora', 'Kit'), active: false }
    renderView(classroom({ students: [student('s1', 'Alvarez', 'Maya'), removed] }))
    expect(screen.queryByText('Zamora, Kit')).not.toBeInTheDocument()
  })

  it('tells students what to do when nobody is in the room', () => {
    renderView(classroom({ sessions: [] }))
    expect(screen.getByText('Tap your name to check in.')).toBeInTheDocument()
  })
})
