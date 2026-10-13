/**
 * Credential helpers for the teacher gate.
 *
 * Passwords are never handled here: Supabase Auth hashes and checks them.
 * What lives here is the username convention and the recovery code.
 */
import { AUTH_EMAIL_DOMAIN } from '../lib/supabase'

export const MIN_PASSWORD_LENGTH = 6

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,29}$/

/** Usernames are case-insensitive; this is the form that is stored and compared. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(normalizeUsername(username))
}

export const USERNAME_HINT =
  '3 to 30 characters: letters, numbers, dots, dashes or underscores.'

/** The synthetic email Supabase Auth stores for a username. */
export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${AUTH_EMAIL_DOMAIN}`
}

export function emailToUsername(email: string): string {
  return email.split('@')[0] ?? email
}

/** Crockford-style alphabet: no I, L, O, U, so a handwritten code stays readable. */
const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const RECOVERY_GROUPS = 4
const RECOVERY_GROUP_LENGTH = 4

/** 16 characters from a 32-letter alphabet: 80 bits, so it cannot be guessed. */
export function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(
    new Uint8Array(RECOVERY_GROUPS * RECOVERY_GROUP_LENGTH),
  )
  const chars = [...bytes].map(
    (byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length] as string,
  )
  return Array.from({ length: RECOVERY_GROUPS }, (_, group) =>
    chars.slice(group * RECOVERY_GROUP_LENGTH, (group + 1) * RECOVERY_GROUP_LENGTH).join(''),
  ).join('-')
}

/** Accepts the code however it was written down: spacing, dashes, and case are ignored. */
export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^0-9a-zA-Z]/g, '').toUpperCase()
}
