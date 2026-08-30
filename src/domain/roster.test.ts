import { describe, expect, it } from 'vitest'
import { parseRosterText, partitionNewStudents, studentKey } from './roster'

describe('parseRosterText', () => {
  it('parses comma-separated last, first, grade, id', () => {
    const result = parseRosterText('Alvarez, Maya, 10, 10442')
    expect(result.errors).toEqual([])
    expect(result.students[0]).toEqual({
      lastName: 'Alvarez',
      firstName: 'Maya',
      grade: '10',
      studentId: '10442',
    })
  })

  it('omits the student ID when the column is absent or blank', () => {
    expect(parseRosterText('Alvarez, Maya, 10').students[0]).not.toHaveProperty('studentId')
    expect(parseRosterText('Alvarez, Maya, 10, ').students[0]).not.toHaveProperty('studentId')
  })

  it('accepts a tab-separated paste from a spreadsheet', () => {
    const result = parseRosterText('Brooks\tDev\t10\t10118')
    expect(result.students[0]).toMatchObject({ lastName: 'Brooks', firstName: 'Dev' })
  })

  it('accepts a plain column of names, treating the last token as the surname', () => {
    const result = parseRosterText('Maya Alvarez\nDev Brooks\nAna Maria Delgado')
    expect(result.errors).toEqual([])
    expect(result.students).toEqual([
      { firstName: 'Maya', lastName: 'Alvarez', grade: '' },
      { firstName: 'Dev', lastName: 'Brooks', grade: '' },
      { firstName: 'Ana Maria', lastName: 'Delgado', grade: '' },
    ])
  })

  it('skips a header row and blank lines', () => {
    const result = parseRosterText(
      'Last Name,First Name,Grade,Student ID\n\nAlvarez, Maya, 10\n\n  \nBrooks, Dev, 10\n',
    )
    expect(result.students).toHaveLength(2)
    expect(result.errors).toEqual([])
  })

  it('reports unusable lines by their line number without dropping the good ones', () => {
    const result = parseRosterText('Alvarez, Maya, 10\nMononym\n, Dev, 10')
    expect(result.students).toHaveLength(1)
    expect(result.errors).toEqual([
      { line: 2, text: 'Mononym', message: 'Needs a first and last name.' },
      { line: 3, text: ', Dev, 10', message: 'Needs both a last name and a first name.' },
    ])
  })

  it('trims surrounding whitespace on every field', () => {
    expect(parseRosterText('  Alvarez ,  Maya ,  10 ').students[0]).toEqual({
      lastName: 'Alvarez',
      firstName: 'Maya',
      grade: '10',
    })
  })

  it('returns nothing for empty input', () => {
    expect(parseRosterText('')).toEqual({ students: [], errors: [] })
    expect(parseRosterText('\n\n  \n')).toEqual({ students: [], errors: [] })
  })
})

describe('partitionNewStudents', () => {
  const existing = [{ firstName: 'Maya', lastName: 'Alvarez' }]

  it('separates students already on the roster, ignoring case and spacing', () => {
    const parsed = parseRosterText('  alvarez , MAYA , 10\nBrooks, Dev, 10').students
    const { toAdd, duplicates } = partitionNewStudents(parsed, existing)
    expect(toAdd.map((s) => s.lastName)).toEqual(['Brooks'])
    expect(duplicates.map((s) => s.lastName)).toEqual(['alvarez'])
  })

  it('treats a name repeated within the paste as a duplicate too', () => {
    const parsed = parseRosterText('Brooks, Dev, 10\nBrooks, Dev, 10').students
    const { toAdd, duplicates } = partitionNewStudents(parsed, [])
    expect(toAdd).toHaveLength(1)
    expect(duplicates).toHaveLength(1)
  })

  it('builds a stable comparison key', () => {
    expect(studentKey({ firstName: ' Maya ', lastName: 'Alvarez' })).toBe('alvarez|maya')
  })
})
