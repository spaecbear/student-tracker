import { useState } from 'react'
import { Button } from './Button'
import { useInstallPrompt } from '../hooks/useInstallPrompt'

interface Props {
  /** Slightly different framing on the first-run screen. */
  tone?: 'setup' | 'settings'
}

/**
 * Offers installation as a button rather than leaving it buried in Chrome's
 * menu. Falls back to written steps on a browser that gives no prompt event,
 * so there is always a way in that does not involve a console.
 */
export function InstallCard({ tone = 'settings' }: Props) {
  const { canInstall, installed, install } = useInstallPrompt()
  const [busy, setBusy] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  if (installed) {
    return tone === 'setup' ? null : (
      <section
        className="rounded-2xl border p-5"
        style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}
      >
        <h3 className="font-semibold">Installed on this device</h3>
        <p className="mt-1.5 text-sm">
          The app is running in its own window and works with no internet connection.
        </p>
      </section>
    )
  }

  return (
    <section
      className="rounded-2xl border p-5"
      style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
    >
      <h3 className="text-sm font-semibold tracking-[0.14em] uppercase">Install on this device</h3>
      <p className="mt-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
        Installing gives the app its own window with no address bar, puts it on the shelf, and
        makes the browser far less likely to clear the attendance records.
      </p>

      {canInstall ? (
        <Button
          variant="primary"
          className="mt-4"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void install()
              .then((outcome) => {
                if (outcome === 'dismissed') setDismissed(true)
              })
              .finally(() => setBusy(false))
          }}
        >
          {busy ? 'Opening the installer…' : 'Install app'}
        </Button>
      ) : (
        <div className="mt-4 text-sm" style={{ color: 'var(--text-muted)' }}>
          <p>
            This browser did not offer an install button. On a Chromebook you can always install
            by hand:
          </p>
          <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5">
            <li>Open the ⋮ menu at the top right of Chrome.</li>
            <li>
              Choose <strong>Cast, save and share</strong>.
            </li>
            <li>
              Choose <strong>Install page as app</strong>.
            </li>
          </ol>
        </div>
      )}

      {dismissed && (
        <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          No problem — the button stays here whenever you want it.
        </p>
      )}
    </section>
  )
}
