import { useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { Field } from '../../components/Field'
import type { TeacherAuth } from '../../hooks/useTeacherAuth'

interface Props {
  auth: TeacherAuth
  onCancel: () => void
}

/**
 * The teacher view's lock. The device is already signed in so the class can
 * run; this asks for the password again before the roster and records open.
 */
export function PasswordGate({ auth, onCancel }: Props) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await auth.unlock(password)
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
          Teacher only
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Teacher access</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          Signed in as {auth.teacher?.displayName ?? 'a teacher'}. Enter your password to manage the
          roster, classes, and session records.
        </p>

        <div className="mt-6">
          <Field
            label="Password"
            type="password"
            value={password}
            autoFocus
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {auth.error && (
          <p role="alert" className="mt-4 text-sm font-medium" style={{ color: 'var(--danger)' }}>
            {auth.error}
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <Button type="button" onClick={onCancel} className="flex-1">
            Back to class
          </Button>
          <Button type="submit" variant="primary" disabled={busy} className="flex-[2]">
            {busy ? 'Working…' : 'Unlock'}
          </Button>
        </div>

        <div className="mt-5 text-sm">
          <button
            type="button"
            onClick={() => void auth.signOut()}
            className="underline"
            style={{ color: 'var(--text-muted)' }}
          >
            Not {auth.teacher?.displayName ?? 'you'}? Sign out of this device
          </button>
        </div>
      </form>
    </main>
  )
}
