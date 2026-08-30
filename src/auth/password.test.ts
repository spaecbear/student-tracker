import { describe, expect, it } from 'vitest'
import {
  changePassword,
  constantTimeEquals,
  createCredential,
  deriveHash,
  generateRecoveryCode,
  generateSalt,
  normalizeRecoveryCode,
  verifyPassword,
  verifyRecoveryCode,
} from './password'

// Real PBKDF2 at production strength is deliberately slow; the tests exercise
// the same code path with a low iteration count.
const ITERATIONS = 1000

describe('deriveHash', () => {
  it('is deterministic for the same password, salt, and iteration count', async () => {
    const salt = generateSalt()
    const a = await deriveHash('hunter2', salt, ITERATIONS)
    const b = await deriveHash('hunter2', salt, ITERATIONS)
    expect(a).toBe(b)
  })

  it('differs by password, by salt, and by iteration count', async () => {
    const salt = generateSalt()
    const base = await deriveHash('hunter2', salt, ITERATIONS)
    expect(await deriveHash('hunter3', salt, ITERATIONS)).not.toBe(base)
    expect(await deriveHash('hunter2', generateSalt(), ITERATIONS)).not.toBe(base)
    expect(await deriveHash('hunter2', salt, ITERATIONS + 1)).not.toBe(base)
  })
})

describe('generateSalt', () => {
  it('produces a fresh 16-byte salt each call', () => {
    const salts = new Set(Array.from({ length: 20 }, generateSalt))
    expect(salts.size).toBe(20)
    expect(atob([...salts][0] as string)).toHaveLength(16)
  })
})

describe('createCredential and verifyPassword', () => {
  it('accepts the right password and rejects everything else', async () => {
    const credential = await createCredential('Bio Room 214!', ITERATIONS)
    expect(await verifyPassword('Bio Room 214!', credential)).toBe(true)
    expect(await verifyPassword('bio room 214!', credential)).toBe(false)
    expect(await verifyPassword('', credential)).toBe(false)
    expect(await verifyPassword('Bio Room 214', credential)).toBe(false)
  })

  it('never stores the password itself', async () => {
    const credential = await createCredential('Bio Room 214!', ITERATIONS)
    expect(JSON.stringify(credential)).not.toContain('Bio Room 214!')
  })

  it('salts each account separately', async () => {
    const a = await createCredential('same', ITERATIONS)
    const b = await createCredential('same', ITERATIONS)
    expect(a.salt).not.toBe(b.salt)
    expect(a.passwordHash).not.toBe(b.passwordHash)
  })

  it('refuses to authenticate against an unset credential', async () => {
    expect(
      await verifyPassword('anything', {
        passwordHash: '',
        salt: generateSalt(),
        iterations: ITERATIONS,
      }),
    ).toBe(false)
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

  it('is accepted however the teacher wrote it down', async () => {
    const credential = await createCredential('pw', ITERATIONS)
    const code = credential.recoveryCode
    expect(await verifyRecoveryCode(code, credential)).toBe(true)
    expect(await verifyRecoveryCode(code.toLowerCase(), credential)).toBe(true)
    expect(await verifyRecoveryCode(code.replaceAll('-', ' '), credential)).toBe(true)
    expect(await verifyRecoveryCode(code.replaceAll('-', ''), credential)).toBe(true)
  })

  it('rejects a wrong code and an unset one', async () => {
    const credential = await createCredential('pw', ITERATIONS)
    expect(await verifyRecoveryCode('AAAA-BBBB-CCCC-DDDD', credential)).toBe(false)
    expect(await verifyRecoveryCode('', { ...credential, recoveryHash: '' })).toBe(false)
  })

  it('normalizes punctuation and case', () => {
    expect(normalizeRecoveryCode(' k7qm-3f9t ')).toBe('K7QM3F9T')
  })

  it('is not interchangeable with the password', async () => {
    const credential = await createCredential('pw', ITERATIONS)
    expect(await verifyPassword(credential.recoveryCode, credential)).toBe(false)
    expect(await verifyRecoveryCode('pw', credential)).toBe(false)
  })
})

describe('changePassword', () => {
  it('keeps the salt so the recovery code still works', async () => {
    const credential = await createCredential('old', ITERATIONS)
    const changed = await changePassword('new', credential)
    expect(changed.salt).toBe(credential.salt)
    expect(await verifyPassword('new', { ...credential, ...changed })).toBe(true)
    expect(await verifyPassword('old', { ...credential, ...changed })).toBe(false)
    expect(await verifyRecoveryCode(credential.recoveryCode, { ...credential, ...changed })).toBe(
      true,
    )
  })
})

describe('constantTimeEquals', () => {
  it('compares by value and handles differing lengths', () => {
    expect(constantTimeEquals('abc', 'abc')).toBe(true)
    expect(constantTimeEquals('abc', 'abd')).toBe(false)
    expect(constantTimeEquals('abc', 'abcd')).toBe(false)
    expect(constantTimeEquals('', '')).toBe(true)
  })
})
