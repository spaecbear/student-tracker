/**
 * Password handling for the teacher gate.
 *
 * This is PBKDF2-SHA256 via Web Crypto against a random salt. It is not
 * defense against someone with physical access and time — nothing running
 * locally in a browser could be. It is a lock that stops a curious
 * ninth-grader from editing the roster, which is the actual threat model.
 */

export const PBKDF2_ITERATIONS = 310_000
const KEY_LENGTH_BITS = 256
const SALT_BYTES = 16

export interface Credential {
  passwordHash: string
  salt: string
  iterations: number
}

export interface NewCredential extends Credential {
  recoveryHash: string
  /** Shown once at setup for the teacher to write down. Never stored in the clear. */
  recoveryCode: string
}

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (const byte of view) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function generateSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)))
}

export async function deriveHash(
  secret: string,
  salt: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<string> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: fromBase64(salt) as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    material,
    KEY_LENGTH_BITS,
  )
  return toBase64(bits)
}

/** Length-independent, value-independent comparison. */
export function constantTimeEquals(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  let diff = left.length ^ right.length
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
  }
  return diff === 0
}

/** Crockford-style alphabet: no I, L, O, U, so a handwritten code stays readable. */
const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const RECOVERY_GROUPS = 4
const RECOVERY_GROUP_LENGTH = 4

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

export async function createCredential(
  password: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<NewCredential> {
  const salt = generateSalt()
  const recoveryCode = generateRecoveryCode()
  // One salt covers both secrets; the inputs differ, so the derived keys do too.
  const [passwordHash, recoveryHash] = await Promise.all([
    deriveHash(password, salt, iterations),
    deriveHash(normalizeRecoveryCode(recoveryCode), salt, iterations),
  ])
  return { passwordHash, salt, iterations, recoveryHash, recoveryCode }
}

export async function verifyPassword(
  password: string,
  credential: Credential,
): Promise<boolean> {
  if (credential.passwordHash === '') return false
  const candidate = await deriveHash(password, credential.salt, credential.iterations)
  return constantTimeEquals(candidate, credential.passwordHash)
}

export async function verifyRecoveryCode(
  code: string,
  credential: Credential & { recoveryHash: string },
): Promise<boolean> {
  if (credential.recoveryHash === '') return false
  const candidate = await deriveHash(
    normalizeRecoveryCode(code),
    credential.salt,
    credential.iterations,
  )
  return constantTimeEquals(candidate, credential.recoveryHash)
}

/** Re-derives the password hash against the existing salt, for a password change. */
export async function changePassword(
  password: string,
  credential: Credential,
): Promise<Credential> {
  return {
    salt: credential.salt,
    iterations: credential.iterations,
    passwordHash: await deriveHash(password, credential.salt, credential.iterations),
  }
}
