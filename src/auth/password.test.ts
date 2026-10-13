import { describe, expect, it } from 'vitest'
import {
  emailToUsername,
  generateRecoveryCode,
  isValidUsername,
  normalizeRecoveryCode,
  normalizeUsername,
  usernameToEmail,
} from './password'

describe('usernames', () => {
  it('ignores case and surrounding spaces', () => {
    expect(normalizeUsername('  MsAlvarez ')).toBe('msalvarez')
  })

  it('accepts letters, numbers, dots, dashes and underscores', () => {
    for (const ok of ['amanda', 'ms.alvarez', 'room_214', 'mr-chen', 'AMANDA1']) {
      expect(isValidUsername(ok)).toBe(true)
    }
  })

  it('rejects the too short, the too long, and anything that is not a plain name', () => {
    for (const bad of ['ab', 'a'.repeat(31), 'has space', 'at@sign', '-leading', '', 'émile']) {
      expect(isValidUsername(bad)).toBe(false)
    }
  })

  it('maps to a synthetic email and back', () => {
    const email = usernameToEmail('MsAlvarez')
    expect(email).toMatch(/^msalvarez@.+\..+$/)
    expect(emailToUsername(email)).toBe('msalvarez')
  })
})

describe('recovery code', () => {
  it('is grouped, readable, and free of ambiguous letters', () => {
    const code = generateRecoveryCode()
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/)
    expect(code).not.toMatch(/[ILOU]/)
  })

  it('is different every time', () => {
    expect(new Set(Array.from({ length: 20 }, generateRecoveryCode)).size).toBe(20)
  })

  it('normalizes punctuation and case, however the teacher wrote it down', () => {
    expect(normalizeRecoveryCode(' k7qm-3f9t ')).toBe('K7QM3F9T')
    const code = generateRecoveryCode()
    const plain = normalizeRecoveryCode(code)
    expect(normalizeRecoveryCode(code.toLowerCase())).toBe(plain)
    expect(normalizeRecoveryCode(code.replaceAll('-', ' '))).toBe(plain)
  })
})
