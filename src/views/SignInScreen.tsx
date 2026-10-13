import { useState, type FormEvent } from 'react'
import { Button } from '../components/Button'
import { Field } from '../components/Field'
import {
  MIN_PASSWORD_LENGTH,
  USERNAME_HINT,
  isValidUsername,
} from '../auth/password'
import type { TeacherAuth } from '../hooks/useTeacherAuth'

interface Props {
  auth: TeacherAuth
}

type Mode = 'signin' | 'create' | 'recover'

const COPY: Record<Mode, { heading: string; blurb: string; submit: string }> = {
  signin: {
    heading: 'Sign in',
    blurb: 'Sign in once on this device. Students then tap their names with no login of their own.',
    submit: 'Sign in',
  },
  create: {
    heading: 'Create a teacher account',
    blurb: 'Pick a username and password. You will get a recovery code to write down — it is the only way back in if you forget the password.',
    submit: 'Create account',
  },
  recover: {
    heading: 'Reset with your recovery code',
    blurb: 'Enter your username and the code you wrote down when you made the account, then choose a new password.',
    submit: 'Reset password',
  },
}

/** Shown whenever nobody is signed in on this device. */
export function SignInScreen({ auth }: Props) {
  const [mode, setMode] = useState<Mode>('signin')
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const copy = COPY[mode]
  const needsNewPassword = mode !== 'signin'

  function switchMode(next: Mode) {
    setMode(next)
    setLocalError(null)
    auth.clearError()
    setPassword('')
    setCode('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLocalError(null)

    if (mode === 'create' && !isValidUsername(username)) {
      setLocalError(`Username: ${USERNAME_HINT}`)
      return
    }
    if (needsNewPassword && password.length < MIN_PASSWORD_LENGTH) {
      setLocalError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }

    setBusy(true)
    try {
      if (mode === 'create') await auth.signUp(displayName.trim() || username.trim(), username, password)
      else if (mode === 'recover') await auth.resetWithRecoveryCode(username, code, password)
      else await auth.signIn(username, password)
    } finally {
      setBusy(false)
      setPassword('')
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
      <form
        onSubmit={submit}
        className="rounded-3xl border p-8"
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <p
          className="text-xs font-semibold tracking-[0.2em] uppercase"
          style={{ color: 'var(--accent)' }}
        >
          Classroom Time Tracker
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{copy.heading}</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          {copy.blurb}
        </p>

        <div className="mt-6 flex flex-col gap-4">
          {mode === 'create' && (
            <Field
              label="Your name"
              value={displayName}
              placeholder="Ms. Alvarez"
              autoComplete="name"
              onChange={(event) => setDisplayName(event.target.value)}
            />
          )}

          <Field
            label="Username"
            value={username}
            autoFocus
            autoCapitalize="none"
            autoComplete="username"
            onChange={(event) => setUsername(event.target.value)}
            {...(mode === 'create' ? { hint: USERNAME_HINT } : {})}
          />

          {mode === 'recover' && (
            <Field
              label="Recovery code"
              value={code}
              placeholder="K7QM-3F9T-XR2W-8HND"
              autoCapitalize="characters"
              onChange={(event) => setCode(event.target.value)}
            />
          )}

          <Field
            label={needsNewPassword ? 'New password' : 'Password'}
            type="password"
            value={password}
            autoComplete={needsNewPassword ? 'new-password' : 'current-password'}
            onChange={(event) => setPassword(event.target.value)}
            {...(needsNewPassword ? { hint: `At least ${MIN_PASSWORD_LENGTH} characters.` } : {})}
          />
        </div>

        {(localError ?? auth.error) && (
          <p role="alert" className="mt-4 text-sm font-medium" style={{ color: 'var(--danger)' }}>
            {localError ?? auth.error}
          </p>
        )}

        <Button type="submit" variant="primary" disabled={busy} className="mt-6 w-full">
          {busy ? 'Working…' : copy.submit}
        </Button>

        <div className="mt-5 flex flex-col items-start gap-2 text-sm">
          {mode === 'signin' ? (
            <>
              <button
                type="button"
                onClick={() => switchMode('recover')}
                className="underline"
                style={{ color: 'var(--text-muted)' }}
              >
                I forgot my password
              </button>
              <button
                type="button"
                onClick={() => switchMode('create')}
                className="underline"
                style={{ color: 'var(--text-muted)' }}
              >
                Create a teacher account
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="underline"
              style={{ color: 'var(--text-muted)' }}
            >
              Back to sign in
            </button>
          )}
        </div>
      </form>
    </main>
  )
}
