import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { Field } from '../../components/Field'
import type { TeacherAuth } from '../../hooks/useTeacherAuth'

interface Props {
  auth: TeacherAuth
  onCancel: () => void
}

const MIN_PASSWORD_LENGTH = 6

type Mode = 'signin' | 'recover' | 'create'

/**
 * First-run setup, the everyday sign-in, the recovery path, and adding another
 * teacher to a shared room.
 *
 * Adding an account asks for an existing password or recovery code first.
 * Without that, this screen would be a way around the very gate it guards: a
 * student could make an account and walk into the teacher view.
 */
export function PasswordGate({ auth, onCancel }: Props) {
  const isFirstRun = auth.state === 'setup'
  const [mode, setMode] = useState<Mode>('signin')
  const [teacherId, setTeacherId] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [code, setCode] = useState('')
  const [proof, setProof] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const signedInTeachers = auth.teachers.filter((t) => t.passwordHash !== '')

  useEffect(() => {
    setTeacherId((current) => current || (signedInTeachers[0]?.id ?? ''))
  }, [signedInTeachers])

  function switchMode(next: Mode) {
    setMode(next)
    setLocalError(null)
    auth.clearError()
    setPassword('')
    setCode('')
    setProof('')
  }

  const needsNewPassword = isFirstRun || mode !== 'signin'

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLocalError(null)

    if (needsNewPassword && password.length < MIN_PASSWORD_LENGTH) {
      setLocalError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (mode === 'create' && !isFirstRun && proof.trim() === '') {
      setLocalError('Enter an existing password or recovery code to add an account.')
      return
    }

    setBusy(true)
    try {
      const name = displayName.trim() || 'Teacher'
      if (isFirstRun) await auth.createFirstAccount(name, password)
      else if (mode === 'create') await auth.addAccount(proof, name, password)
      else if (mode === 'recover') await auth.resetWithRecoveryCode(teacherId, code, password)
      else await auth.unlock(teacherId, password)
    } finally {
      setBusy(false)
      setPassword('')
    }
  }

  const heading = isFirstRun
    ? 'Set a teacher password'
    : mode === 'create'
      ? 'Add another teacher'
      : mode === 'recover'
        ? 'Reset with your recovery code'
        : 'Teacher access'

  const blurb = isFirstRun
    ? 'This keeps the roster and session records out of student hands. It is a classroom lock, not high security.'
    : mode === 'create'
      ? 'For a room shared by more than one teacher. The new account gets its own classes — it will not see anyone else’s roster.'
      : mode === 'recover'
        ? 'Enter the code you wrote down when you set the password, then choose a new one.'
        : 'Enter your password to manage the roster, classes, and session records.'

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
          Teacher only
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{heading}</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          {blurb}
        </p>

        <div className="mt-6 flex flex-col gap-4">
          {!isFirstRun && mode !== 'create' && signedInTeachers.length > 1 && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Teacher</span>
              <select
                value={teacherId}
                aria-label="Teacher"
                onChange={(event) => setTeacherId(event.target.value)}
                className="min-h-11 w-full rounded-xl border px-3"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
              >
                {signedInTeachers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.displayName}
                  </option>
                ))}
              </select>
            </label>
          )}

          {mode === 'create' && !isFirstRun && (
            <Field
              label="Existing password or recovery code"
              value={proof}
              hint="Any teacher already set up on this device. This is what stops a student adding themselves."
              onChange={(event) => setProof(event.target.value)}
            />
          )}

          {(isFirstRun || mode === 'create') && (
            <Field
              label="Your name"
              value={displayName}
              placeholder="Teacher"
              autoComplete="name"
              onChange={(event) => setDisplayName(event.target.value)}
            />
          )}

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
            autoFocus
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

        <div className="mt-6 flex gap-3">
          <Button type="button" onClick={onCancel} className="flex-1">
            Back to class
          </Button>
          <Button type="submit" variant="primary" disabled={busy} className="flex-[2]">
            {busy
              ? 'Working…'
              : isFirstRun
                ? 'Set password'
                : mode === 'create'
                  ? 'Create account'
                  : mode === 'recover'
                    ? 'Reset password'
                    : 'Unlock'}
          </Button>
        </div>

        {!isFirstRun && (
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
                  Add another teacher to this device
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
        )}
      </form>
    </main>
  )
}
