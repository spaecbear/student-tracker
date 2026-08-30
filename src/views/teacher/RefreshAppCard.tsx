import { useState } from 'react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { clearAppShellCache } from '../../pwa/refresh'

/**
 * Last-resort fix for a stale or broken app cache, as a button rather than
 * something a teacher would have to open DevTools to do.
 *
 * It clears the cached program files only. Attendance records live in a
 * separate store and are deliberately left alone — deleting those is the
 * year-end purge's job, behind its own export and confirmation.
 */
export function RefreshAppCard() {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function refresh() {
    setBusy(true)
    try {
      await clearAppShellCache()
      window.location.reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="rounded-2xl border p-5"
      style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
    >
      <h3 className="text-sm font-semibold tracking-[0.14em] uppercase">
        If the app looks wrong or out of date
      </h3>
      <p className="mt-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
        Downloads a fresh copy of the app and restarts it. Use this if an update does not seem to
        have arrived, or something looks broken.{' '}
        <strong>Your classes, students, and attendance records are not affected.</strong>
      </p>
      <Button className="mt-4" onClick={() => setConfirming(true)}>
        Get a fresh copy
      </Button>

      {confirming && (
        <Modal
          title="Get a fresh copy of the app?"
          description="The app will restart. Nothing you have recorded is deleted."
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Button onClick={() => setConfirming(false)}>Cancel</Button>
              <Button variant="primary" disabled={busy} onClick={() => void refresh()}>
                {busy ? 'Refreshing…' : 'Refresh and restart'}
              </Button>
            </>
          }
        >
          <ul
            className="flex list-disc flex-col gap-2 pl-5 text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            <li>Kept: every class, student, and session on this device.</li>
            <li>Kept: your password and recovery code.</li>
            <li>Replaced: the app's own program files, downloaded again.</li>
            <li>
              You need to be online for this. Offline, the app would have nothing to download.
            </li>
          </ul>
        </Modal>
      )}
    </section>
  )
}
