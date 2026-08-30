import { useCallback, useEffect, useRef, useState } from 'react'
import {
  StorageError,
  createTeacher,
  listTeachers,
  updateTeacher,
  type Teacher,
} from '../db'
import {
  changePassword,
  createCredential,
  verifyPassword,
  verifyRecoveryCode,
} from '../auth/password'

/** The teacher view locks itself after this long without interaction. */
export const AUTO_LOCK_MS = 5 * 60_000

export type AuthState = 'checking' | 'setup' | 'locked' | 'unlocked' | 'error'

export interface TeacherAuth {
  state: AuthState
  /** Every account on this device, for the sign-in picker. */
  teachers: Teacher[]
  /** The signed-in teacher, or null while locked. */
  teacher: Teacher | null
  error: string | null
  /** Set once after an account is created or reset, for the teacher to write down. */
  recoveryCode: string | null
  createFirstAccount: (displayName: string, password: string) => Promise<boolean>
  addAccount: (proof: string, displayName: string, password: string) => Promise<boolean>
  unlock: (teacherId: string, password: string) => Promise<boolean>
  resetWithRecoveryCode: (
    teacherId: string,
    code: string,
    newPassword: string,
  ) => Promise<boolean>
  lock: () => void
  acknowledgeRecoveryCode: () => void
  clearError: () => void
}

/**
 * Password gate for the teacher view.
 *
 * A device can hold several accounts — a room shared by two teachers across
 * periods — and each one only ever sees its own classes. It re-locks on
 * inactivity, when the app is backgrounded, and whenever the student view is
 * shown, so an unattended Chromebook is never a way in.
 */
export function useTeacherAuth(): TeacherAuth {
  const [state, setState] = useState<AuthState>('checking')
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)

  const fail = useCallback((cause: unknown, fallback: string) => {
    setError(cause instanceof StorageError ? cause.message : fallback)
  }, [])

  const loadTeachers = useCallback(async (): Promise<Teacher[]> => {
    const found = await listTeachers()
    setTeachers(found)
    return found
  }, [])

  useEffect(() => {
    let cancelled = false
    loadTeachers()
      .then((found) => {
        if (cancelled) return
        // An account with no password hash is a half-finished setup, not a login.
        setState(found.some((t) => t.passwordHash !== '') ? 'locked' : 'setup')
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        fail(cause, 'Could not read the teacher accounts.')
        setState('error')
      })
    return () => {
      cancelled = true
    }
  }, [loadTeachers, fail])

  const lock = useCallback(() => {
    setState((current) => (current === 'unlocked' ? 'locked' : current))
    setTeacher(null)
    setError(null)
  }, [])

  // Inactivity auto-lock, armed only while unlocked.
  useEffect(() => {
    if (state !== 'unlocked') return

    const reset = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(lock, AUTO_LOCK_MS)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') lock()
    }

    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'wheel']
    for (const event of events) window.addEventListener(event, reset, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    reset()

    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      for (const event of events) window.removeEventListener(event, reset)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [state, lock])

  const saveAccount = useCallback(
    async (displayName: string, password: string): Promise<boolean> => {
      const credential = await createCredential(password)
      const fields = {
        displayName,
        passwordHash: credential.passwordHash,
        salt: credential.salt,
        iterations: credential.iterations,
        recoveryHash: credential.recoveryHash,
      }
      // Reuse a half-finished account rather than stranding it alongside a new one.
      const unfinished = (await listTeachers()).find((t) => t.passwordHash === '')
      const saved = unfinished
        ? await updateTeacher(unfinished.id, fields)
        : await createTeacher(fields, Date.now())

      await loadTeachers()
      setTeacher(saved)
      setRecoveryCode(credential.recoveryCode)
      setState('unlocked')
      return true
    },
    [loadTeachers],
  )

  const createFirstAccount = useCallback(
    async (displayName: string, password: string) => {
      setError(null)
      try {
        return await saveAccount(displayName, password)
      } catch (cause) {
        fail(cause, 'Could not save the password.')
        return false
      }
    },
    [saveAccount, fail],
  )

  /**
   * Adds another teacher to this device. `proof` must be an existing account's
   * password or recovery code: without it the sign-in screen would be a way
   * around the very gate it is guarding.
   */
  const addAccount = useCallback(
    async (proof: string, displayName: string, password: string) => {
      setError(null)
      try {
        const existing = await listTeachers()
        const authorized = await existing.reduce(
          async (matched, candidate) =>
            (await matched) ||
            (await verifyPassword(proof, candidate)) ||
            (await verifyRecoveryCode(proof, candidate)),
          Promise.resolve(false),
        )
        if (!authorized) {
          setError(
            'That is not a password or recovery code for an account on this device. Ask the teacher who set it up.',
          )
          return false
        }
        return await saveAccount(displayName, password)
      } catch (cause) {
        fail(cause, 'Could not create the account.')
        return false
      }
    },
    [saveAccount, fail],
  )

  const unlock = useCallback(
    async (teacherId: string, password: string) => {
      setError(null)
      try {
        const match = teachers.find((t) => t.id === teacherId)
        if (!match) {
          setError('Pick which teacher is signing in.')
          return false
        }
        if (await verifyPassword(password, match)) {
          setTeacher(match)
          setState('unlocked')
          return true
        }
        setError('That password does not match.')
        return false
      } catch (cause) {
        fail(cause, 'Could not check the password.')
        return false
      }
    },
    [teachers, fail],
  )

  const resetWithRecoveryCode = useCallback(
    async (teacherId: string, code: string, newPassword: string) => {
      setError(null)
      try {
        const match = teachers.find((t) => t.id === teacherId)
        if (!match) {
          setError('Pick which teacher is signing in.')
          return false
        }
        if (!(await verifyRecoveryCode(code, match))) {
          setError('That recovery code does not match.')
          return false
        }
        const credential = await changePassword(newPassword, match)
        const saved = await updateTeacher(match.id, { passwordHash: credential.passwordHash })
        await loadTeachers()
        setTeacher(saved)
        setState('unlocked')
        return true
      } catch (cause) {
        fail(cause, 'Could not reset the password.')
        return false
      }
    },
    [teachers, loadTeachers, fail],
  )

  const acknowledgeRecoveryCode = useCallback(() => setRecoveryCode(null), [])
  const clearError = useCallback(() => setError(null), [])

  return {
    state,
    teachers,
    teacher,
    error,
    recoveryCode,
    createFirstAccount,
    addAccount,
    unlock,
    resetWithRecoveryCode,
    lock,
    acknowledgeRecoveryCode,
    clearError,
  }
}
