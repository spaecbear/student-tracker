import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { StorageError, type Teacher } from '../db'
import {
  emailToUsername,
  generateRecoveryCode,
  isValidUsername,
  normalizeUsername,
  usernameToEmail,
} from '../auth/password'
import { getSupabase } from '../lib/supabase'

/** The teacher view locks itself after this long without interaction. */
export const AUTO_LOCK_MS = 5 * 60_000

/**
 * - `checking`:  reading the saved session.
 * - `signedOut`: nobody is signed in on this device; the sign-in screen shows.
 * - `locked`:    a teacher is signed in (the class runs) but the teacher view
 *                wants their password again.
 * - `unlocked`:  the teacher view is open.
 */
export type AuthState = 'checking' | 'signedOut' | 'locked' | 'unlocked' | 'error'

export interface TeacherAuth {
  state: AuthState
  /** The teacher signed in on this device, locked or not; null when signed out. */
  teacher: Teacher | null
  error: string | null
  /** Set once after an account is created or the code is replaced, for the teacher to write down. */
  recoveryCode: string | null
  signUp: (displayName: string, username: string, password: string) => Promise<boolean>
  signIn: (username: string, password: string) => Promise<boolean>
  /** Re-checks the signed-in teacher's password to open the teacher view. */
  unlock: (password: string) => Promise<boolean>
  resetWithRecoveryCode: (username: string, code: string, newPassword: string) => Promise<boolean>
  /** Replaces the recovery code with a fresh one. Needs the teacher view to be unlocked. */
  replaceRecoveryCode: () => Promise<boolean>
  lock: () => void
  signOut: () => Promise<void>
  acknowledgeRecoveryCode: () => void
  clearError: () => void
}

function toTeacher(user: User): Teacher {
  const username = emailToUsername(user.email ?? '')
  const name = (user.user_metadata as { display_name?: string } | undefined)?.display_name
  return { id: user.id, username, displayName: name?.trim() || username }
}

/** Turns the few Auth messages teachers can actually hit into plain language. */
function friendly(message: string): string {
  if (/already registered|already exists/i.test(message)) {
    return 'That username is taken. Pick another.'
  }
  if (/invalid login credentials/i.test(message)) return 'That username and password do not match.'
  if (/email.*invalid|invalid.*email/i.test(message)) {
    return 'The server rejected that username. Ask whoever set up the app (see the setup guide).'
  }
  return message
}

/**
 * Teacher sign-in.
 *
 * The device stays signed in so the student view can read and write the class;
 * the teacher view re-asks for the password. It re-locks on inactivity, when
 * the app is backgrounded, and whenever the student view is shown, so an
 * unattended Chromebook is never a way into the roster.
 */
export function useTeacherAuth(): TeacherAuth {
  const [state, setState] = useState<AuthState>('checking')
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)

  const fail = useCallback((cause: unknown, fallback: string) => {
    setError(
      cause instanceof StorageError || cause instanceof Error ? cause.message : fallback,
    )
  }, [])

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | null = null
    try {
      const supabase = getSupabase()
      supabase.auth
        .getSession()
        .then(({ data }) => {
          if (cancelled) return
          const user = data.session?.user
          setTeacher(user ? toTeacher(user) : null)
          setState(user ? 'locked' : 'signedOut')
        })
        .catch((cause: unknown) => {
          if (cancelled) return
          fail(cause, 'Could not read the saved sign-in.')
          setState('error')
        })
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
          setTeacher(null)
          setState('signedOut')
        }
      })
      unsubscribe = () => data.subscription.unsubscribe()
    } catch (cause) {
      fail(cause, 'Could not start sign-in.')
      setState('error')
    }
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [fail])

  const lock = useCallback(() => {
    setState((current) => (current === 'unlocked' ? 'locked' : current))
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

  /** Stores a fresh recovery code for the signed-in teacher and queues it to be shown. */
  const issueRecoveryCode = useCallback(async (): Promise<boolean> => {
    const code = generateRecoveryCode()
    const { error: rpcError } = await getSupabase().rpc('set_recovery_code', { p_code: code })
    if (rpcError) throw new StorageError(`Could not save the recovery code: ${rpcError.message}`, rpcError)
    setRecoveryCode(code)
    return true
  }, [])

  const signIn = useCallback(
    async (username: string, password: string) => {
      setError(null)
      try {
        const { data, error: authError } = await getSupabase().auth.signInWithPassword({
          email: usernameToEmail(username),
          password,
        })
        if (authError || !data.user) {
          setError(friendly(authError?.message ?? 'Could not sign in.'))
          return false
        }
        setTeacher(toTeacher(data.user))
        setState('unlocked')
        return true
      } catch (cause) {
        fail(cause, 'Could not sign in.')
        return false
      }
    },
    [fail],
  )

  const signUp = useCallback(
    async (displayName: string, username: string, password: string) => {
      setError(null)
      if (!isValidUsername(username)) {
        setError('That username is not allowed.')
        return false
      }
      try {
        const { data, error: authError } = await getSupabase().auth.signUp({
          email: usernameToEmail(username),
          password,
          options: { data: { display_name: displayName.trim() } },
        })
        if (authError) {
          setError(friendly(authError.message))
          return false
        }
        if (!data.user || !data.session) {
          setError(
            'The account was created but the server wants an email confirmation first. Turn off "Confirm email" in Supabase (see the setup guide).',
          )
          return false
        }
        setTeacher(toTeacher(data.user))
        // The account exists from here on, so signing in already worked: a failure to
        // save the code must not hide that. The teacher can make one in Settings.
        try {
          await issueRecoveryCode()
        } catch (cause) {
          fail(cause, 'Could not save the recovery code.')
        }
        setState('unlocked')
        return true
      } catch (cause) {
        fail(cause, 'Could not create the account.')
        return false
      }
    },
    [fail, issueRecoveryCode],
  )

  const unlock = useCallback(
    async (password: string) => {
      setError(null)
      if (!teacher) return false
      return signIn(teacher.username, password)
    },
    [teacher, signIn],
  )

  const resetWithRecoveryCode = useCallback(
    async (username: string, code: string, newPassword: string) => {
      setError(null)
      try {
        const { data, error: rpcError } = await getSupabase().rpc('reset_password_with_code', {
          p_email: usernameToEmail(username),
          p_code: code,
          p_new_password: newPassword,
        })
        if (rpcError) {
          setError(rpcError.message)
          return false
        }
        if (data !== true) {
          setError('That username and recovery code do not match.')
          return false
        }
        return await signIn(normalizeUsername(username), newPassword)
      } catch (cause) {
        fail(cause, 'Could not reset the password.')
        return false
      }
    },
    [fail, signIn],
  )

  const replaceRecoveryCode = useCallback(async () => {
    setError(null)
    try {
      return await issueRecoveryCode()
    } catch (cause) {
      fail(cause, 'Could not make a new recovery code.')
      return false
    }
  }, [fail, issueRecoveryCode])

  const signOut = useCallback(async () => {
    setError(null)
    try {
      await getSupabase().auth.signOut()
    } catch (cause) {
      fail(cause, 'Could not sign out.')
      return
    }
    setTeacher(null)
    setRecoveryCode(null)
    setState('signedOut')
  }, [fail])

  const acknowledgeRecoveryCode = useCallback(() => setRecoveryCode(null), [])
  const clearError = useCallback(() => setError(null), [])

  return {
    state,
    teacher,
    error,
    recoveryCode,
    signUp,
    signIn,
    unlock,
    resetWithRecoveryCode,
    replaceRecoveryCode,
    lock,
    signOut,
    acknowledgeRecoveryCode,
    clearError,
  }
}
