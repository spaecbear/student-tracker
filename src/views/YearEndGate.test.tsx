import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkIn,
  checkOut,
  createClass,
  createStudent,
  getSetting,
  listSchoolYears,
  listSessionsForSchoolYear,
  type Class,
} from '../db'
import { localTimeOnDay } from '../domain'
import { DEFERRED_YEARS_SETTING, useYearEnd } from '../hooks/useYearEnd'
import { YearEndGate } from './YearEndGate'
import { signInTeacher } from '../test/helpers'

const LAST_YEAR = '2025-2026'
const THIS_YEAR = '2026-2027'
const MAY = new Date(2026, 4, 12, 12).getTime()
const SEPTEMBER = new Date(2026, 8, 15, 12).getTime()

const backupWrites = new Map<string, string>()
const downloads: string[] = []

vi.mock('../pwa/opfs', () => ({
  writeBackup: vi.fn(async (fileName: string, contents: string) => {
    backupWrites.set(fileName, contents)
    return new Blob([contents]).size
  }),
  listBackups: vi.fn(async () => []),
  readBackup: vi.fn(async () => null),
  deleteBackup: vi.fn(async () => false),
}))

vi.mock('../export/download', () => ({
  downloadCsv: vi.fn((fileName: string) => {
    downloads.push(fileName)
    return { fileName, bytes: 0 }
  }),
}))

let teacherId: string

beforeEach(async () => {
    backupWrites.clear()
  downloads.length = 0

  const teacher = signInTeacher()
  teacherId = teacher.id
})

afterEach(() => {
  vi.clearAllMocks()
})

async function seedYear(schoolYear: string, dayAt: number, name: string): Promise<Class> {
  const cls = await createClass(
    { teacherId, name, colorTheme: 'teal', schoolYear },
    dayAt,
  )
  const student = await createStudent(
    { classId: cls.id, lastName: 'Alvarez', firstName: 'Maya', grade: '10' },
    dayAt,
  )
  const session = await checkIn({
    studentId: student.id,
    classId: cls.id,
    schoolYear,
    checkInAt: localTimeOnDay(dayAt, 9, 14),
  })
  await checkOut(session.id, localTimeOnDay(dayAt, 10, 47))
  return cls
}

function Harness() {
  const yearEnd = useYearEnd(SEPTEMBER)
  if (yearEnd.stage === 'idle') return <p>Nothing outstanding</p>
  return <YearEndGate yearEnd={yearEnd} onFinished={() => undefined} />
}

describe('year-end gate', () => {
  it('stays out of the way when no year has expired', async () => {
    await seedYear(THIS_YEAR, SEPTEMBER, 'Period 3 Biology')
    render(<Harness />)
    expect(await screen.findByText('Nothing outstanding')).toBeInTheDocument()
  })

  it('blocks with the expired year named', async () => {
    await seedYear(LAST_YEAR, MAY, 'Period 3 Biology')
    render(<Harness />)
    expect(
      await screen.findByRole('heading', { name: /2025–2026 school year is over/ }),
    ).toBeInTheDocument()
  })

  it('refuses to delete before the export and the confirmation', async () => {
    await seedYear(LAST_YEAR, MAY, 'Period 3 Biology')
    const user = userEvent.setup()
    render(<Harness />)

    const deleteButton = await screen.findByRole('button', {
      name: "Delete last year's data",
    })
    expect(deleteButton).toBeDisabled()
    // The confirmation cannot even be ticked until the export has run.
    expect(screen.getByRole('checkbox')).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Export last year' }))
    await screen.findByText(/downloaded as/)
    expect(deleteButton).toBeDisabled()

    await user.click(screen.getByRole('checkbox'))
    expect(deleteButton).toBeEnabled()

    // Nothing has been deleted at any point up to here.
    expect(await listSessionsForSchoolYear(LAST_YEAR)).toHaveLength(1)
  })

  it('downloads both files and keeps an on-device backup copy', async () => {
    await seedYear(LAST_YEAR, MAY, 'Period 3 Biology')
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(await screen.findByRole('button', { name: 'Export last year' }))
    await screen.findByText(/downloaded as/)

    expect(downloads).toEqual([
      '2025-2026_all-sessions.csv',
      '2025-2026_student-totals.csv',
    ])
    expect([...backupWrites.keys()]).toEqual(downloads)
    expect(backupWrites.get('2025-2026_all-sessions.csv')).toContain('Alvarez,Maya')
    expect(screen.getAllByText(/backup copy kept on this device/)).toHaveLength(2)
  })

  it('deletes only the expired year once confirmed', async () => {
    await seedYear(LAST_YEAR, MAY, 'Old Biology')
    await seedYear(THIS_YEAR, SEPTEMBER, 'New Biology')
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(await screen.findByRole('button', { name: 'Export last year' }))
    await screen.findByText(/downloaded as/)
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: "Delete last year's data" }))

    expect(await screen.findByRole('heading', { name: 'That year is cleared' })).toBeInTheDocument()
    await waitFor(async () => expect(await listSchoolYears()).toEqual([THIS_YEAR]))
    expect(await listSessionsForSchoolYear(LAST_YEAR)).toEqual([])
    expect(await listSessionsForSchoolYear(THIS_YEAR)).toHaveLength(1)
  })

  it('keeps everything when the teacher defers, and records the dismissal', async () => {
    await seedYear(LAST_YEAR, MAY, 'Period 3 Biology')
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(await screen.findByRole('button', { name: /keep the data and remind me/i }))

    expect(await screen.findByText('Nothing outstanding')).toBeInTheDocument()
    expect(await listSessionsForSchoolYear(LAST_YEAR)).toHaveLength(1)
    expect(await getSetting<string[]>(DEFERRED_YEARS_SETTING, [])).toEqual([LAST_YEAR])
  })

  it('says so on a later launch when the prompt was already put off once', async () => {
    await seedYear(LAST_YEAR, MAY, 'Period 3 Biology')
    const user = userEvent.setup()
    const first = render(<Harness />)
    await user.click(await screen.findByRole('button', { name: /keep the data and remind me/i }))
    await screen.findByText('Nothing outstanding')
    first.unmount()

    render(<Harness />)
    expect(await screen.findByText(/You put this off last time/)).toBeInTheDocument()
  })

  it('warns when the browser kept no backup copy', async () => {
    const opfs = await import('../pwa/opfs')
    vi.mocked(opfs.writeBackup).mockResolvedValue(null)
    await seedYear(LAST_YEAR, MAY, 'Period 3 Biology')
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(await screen.findByRole('button', { name: 'Export last year' }))
    expect(await screen.findAllByText(/kept no on-device backup copy/)).toHaveLength(2)
  })
})
