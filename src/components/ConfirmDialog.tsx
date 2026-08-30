import { useEffect, useRef, useState } from 'react'
import { formatTime12 } from '../domain'
import type { Student } from '../db/types'

/** How long the confirmation waits before dismissing itself. */
export const CONFIRM_TIMEOUT_MS = 5000

export interface PendingAction {
  student: Student
  action: 'in' | 'out'
  /** The instant the student tapped; shown so they can verify it. */
  at: number
  sessionId?: string
}

interface Props {
  pending: PendingAction
  onConfirm: (pending: PendingAction) => void
  onCancel: () => void
}

/**
 * The tap-to-confirm step. It exists so a student brushing the screen on the
 * way past cannot silently create a phantom session. It dismisses itself so an
 * abandoned dialog never blocks the next student.
 */
export function ConfirmDialog({ pending, onConfirm, onCancel }: Props) {
  const [remaining, setRemaining] = useState(CONFIRM_TIMEOUT_MS)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const checkingIn = pending.action === 'in'

  useEffect(() => {
    confirmRef.current?.focus()
    const startedAt = Date.now()
    const id = window.setInterval(() => {
      const left = CONFIRM_TIMEOUT_MS - (Date.now() - startedAt)
      if (left <= 0) {
        window.clearInterval(id)
        onCancel()
      } else {
        setRemaining(left)
      }
    }, 100)
    return () => window.clearInterval(id)
  }, [onCancel])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgb(0 0 0 / 0.55)' }}
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-3xl border shadow-2xl"
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className="px-8 pt-8 pb-6 text-center">
          <p
            className="text-sm font-semibold tracking-[0.18em] uppercase"
            style={{ color: 'var(--accent)' }}
          >
            {checkingIn ? 'Checking in' : 'Checking out'}
          </p>
          <h2 id="confirm-title" className="mt-3 text-4xl font-semibold tracking-tight">
            {pending.student.firstName} {pending.student.lastName}
          </h2>
          <p className="mt-2 text-lg" style={{ color: 'var(--text-muted)' }}>
            {checkingIn ? 'In at' : 'Out at'} {formatTime12(pending.at)}
          </p>
        </div>

        <div className="flex gap-3 px-8 pb-8">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-16 flex-1 rounded-2xl border text-lg font-medium"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onConfirm(pending)}
            className="min-h-16 flex-[2] rounded-2xl text-xl font-semibold"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            {checkingIn ? "Yes, I'm in" : "Yes, I'm out"}
          </button>
        </div>

        <div
          className="h-1.5 w-full"
          style={{ background: 'var(--surface-sunken)' }}
          aria-hidden="true"
        >
          <div
            className="h-full"
            style={{
              width: `${(remaining / CONFIRM_TIMEOUT_MS) * 100}%`,
              background: 'var(--accent)',
              transition: 'width 100ms linear',
            }}
          />
        </div>
      </div>
    </div>
  )
}
