import { useState } from 'react'
import { InstallCard } from '../components/InstallCard'

interface Props {
  onOpenTeacherView: () => void
  /** Only provided in dev builds. */
  onSeed?: () => Promise<void>
}

/**
 * Shown before any class exists. The teacher view (phase 4) will be the real
 * way in; until then a dev build can populate a demo roster from here.
 */
export function EmptyState({ onOpenTeacherView, onSeed }: Props) {
  const [busy, setBusy] = useState(false)

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-6">
      <p
        className="text-xs font-semibold tracking-[0.2em] uppercase"
        style={{ color: 'var(--accent)' }}
      >
        Classroom Time Tracker
      </p>
      <h1 className="text-4xl font-semibold tracking-tight">No class set up yet</h1>
      <p className="text-lg" style={{ color: 'var(--text-muted)' }}>
        A teacher needs to create a class and add students before anyone can check in.
      </p>
      <button
        type="button"
        onClick={onOpenTeacherView}
        className="min-h-16 self-start rounded-2xl px-6 text-lg font-semibold"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        Set up as teacher
      </button>

      <div className="mt-2">
        <InstallCard tone="setup" />
      </div>

      {onSeed && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void onSeed().finally(() => setBusy(false))
          }}
          className="min-h-14 self-start rounded-2xl border px-6 font-medium disabled:opacity-60"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          {busy ? 'Building demo data…' : 'Load demo class (dev only)'}
        </button>
      )}
    </main>
  )
}
