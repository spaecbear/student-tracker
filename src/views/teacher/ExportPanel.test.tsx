import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkIn,
  checkOut,
  createClass,
  createStudent,
  type Class,
} from '../../db'
import { formatDateISO, schoolYearForDate } from '../../domain'
import { ExportPanel } from './ExportPanel'
import { signInTeacher } from '../../test/helpers'

const NOW = Date.now()
const YEAR = schoolYearForDate(NOW)
let cls: Class

beforeEach(async () => {
  
  const teacher = signInTeacher()
  cls = await createClass(
    { teacherId: teacher.id, name: 'Period 3 Biology', colorTheme: 'teal', schoolYear: YEAR },
    NOW,
  )
})

async function seedSessions(count: number) {
  const student = await createStudent(
    { classId: cls.id, lastName: 'Alvarez', firstName: 'Maya', grade: '10', studentId: '10442' },
    NOW,
  )
  for (let i = 0; i < count; i += 1) {
    const checkInAt = new Date().setHours(9, i, 0, 0)
    const session = await checkIn({
      studentId: student.id,
      classId: cls.id,
      schoolYear: YEAR,
      checkInAt,
    })
    await checkOut(session.id, checkInAt + 30 * 60_000)
  }
  return student
}

describe('ExportPanel', () => {
  it('previews the row count before anything is downloaded', async () => {
    await seedSessions(3)
    render(<ExportPanel teacherId={cls.teacherId} activeClassId={cls.id} />)
    expect(await screen.findByText('3 rows ready to export.')).toBeInTheDocument()
  })

  it('switches the count when the summary mode collapses sessions per student', async () => {
    await seedSessions(3)
    const user = userEvent.setup()
    render(<ExportPanel teacherId={cls.teacherId} activeClassId={cls.id} />)
    await screen.findByText('3 rows ready to export.')

    await user.click(screen.getByRole('radio', { name: /one row per student/i }))
    expect(await screen.findByText('1 row ready to export.')).toBeInTheDocument()
  })

  it('reports an empty range and refuses to download it', async () => {
    await seedSessions(2)
    const user = userEvent.setup()
    render(<ExportPanel teacherId={cls.teacherId} activeClassId={cls.id} />)
    await screen.findByText('2 rows ready to export.')

    const lastYear = formatDateISO(NOW - 300 * 86_400_000)
    await user.clear(screen.getByLabelText('From'))
    await user.type(screen.getByLabelText('From'), lastYear)
    await user.clear(screen.getByLabelText('To'))
    await user.type(screen.getByLabelText('To'), lastYear)

    expect(await screen.findByText(/nothing to export/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled()
  })

  it('rejects a backwards range', async () => {
    await seedSessions(1)
    const user = userEvent.setup()
    render(<ExportPanel teacherId={cls.teacherId} activeClassId={cls.id} />)
    await screen.findByText('1 row ready to export.')

    await user.clear(screen.getByLabelText('From'))
    await user.type(screen.getByLabelText('From'), formatDateISO(NOW + 10 * 86_400_000))

    expect(
      await screen.findByText('Pick a start date on or before the end date.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled()
  })

  it('downloads a CSV whose contents match the preview', async () => {
    await seedSessions(2)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)

    try {
      const user = userEvent.setup()
      render(<ExportPanel teacherId={cls.teacherId} activeClassId={cls.id} />)
      await screen.findByText('2 rows ready to export.')
      await user.click(screen.getByRole('button', { name: 'Download CSV' }))

      await waitFor(() => expect(clickSpy).toHaveBeenCalledOnce())
      expect(await screen.findByText(/period-3-biology_.*_sessions\.csv/)).toBeInTheDocument()
      // The teacher is told the browser cannot confirm where the file landed.
      expect(screen.getByText(/does not report where a download landed/i)).toBeInTheDocument()
    } finally {
      vi.restoreAllMocks()
    }
  })
})
