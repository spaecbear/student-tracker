import { Button } from '../../components/Button'
import { useStorageStatus } from '../../hooks/useStorageStatus'
import { formatBytes } from '../../pwa/storage'

const STATE_COPY = {
  persisted: {
    title: 'Storage is protected',
    body: 'Chrome has agreed not to clear this app’s data to free up space. Attendance records are safe until you delete them.',
    tone: 'good',
  },
  'not-persisted': {
    title: 'Storage is not protected yet',
    body: 'Chrome may clear this app’s data if the device runs low on space, which would delete the year’s attendance. Installing the app to the shelf usually earns the grant.',
    tone: 'warn',
  },
  unsupported: {
    title: 'This browser cannot protect storage',
    body: 'It gives no guarantee that data survives low-space conditions. Export regularly rather than relying on this device.',
    tone: 'warn',
  },
} as const

/**
 * Surfaces whether `navigator.storage.persist()` was granted. A silent refusal
 * is the failure mode worth catching: everything looks fine right up until a
 * year of data is gone.
 */
export function DevicePanel() {
  const { status, requestAgain } = useStorageStatus()

  if (!status) {
    return <p style={{ color: 'var(--text-muted)' }}>Checking this device…</p>
  }

  const copy = STATE_COPY[status.state]
  const good = copy.tone === 'good'

  return (
    <div className="flex flex-col gap-6">
      <section
        className="rounded-2xl border p-5"
        style={{
          borderColor: good ? 'var(--accent)' : 'var(--warn-border)',
          background: good ? 'var(--accent-soft)' : 'var(--warn-surface)',
        }}
      >
        <h3 className="text-lg font-semibold">{copy.title}</h3>
        <p className="mt-1.5" style={{ color: good ? 'var(--text)' : 'var(--warn-text)' }}>
          {copy.body}
        </p>
        {status.state === 'not-persisted' && (
          <Button className="mt-4" onClick={() => void requestAgain()}>
            Ask again
          </Button>
        )}
      </section>

      <section
        className="rounded-2xl border p-5"
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <h3 className="text-sm font-semibold tracking-[0.14em] uppercase">Space used</h3>
        <p className="mt-2 text-2xl font-semibold tabular-nums">
          {formatBytes(status.usageBytes)}
          {status.quotaBytes !== null && (
            <span className="text-base font-normal" style={{ color: 'var(--text-muted)' }}>
              {' '}
              of {formatBytes(status.quotaBytes)} available
            </span>
          )}
        </p>
        <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          A full school year of one class is only a few hundred kilobytes, so running out of room
          is not a realistic worry. Eviction is.
        </p>
      </section>

      <section
        className="rounded-2xl border p-5"
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <h3 className="text-sm font-semibold tracking-[0.14em] uppercase">Good to know</h3>
        <ul
          className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm"
          style={{ color: 'var(--text-muted)' }}
        >
          <li>
            The app works with no internet connection once it has loaded. Everything is stored on
            this Chromebook and nothing is sent anywhere.
          </li>
          <li>
            Install it from the browser menu to get an app window with no address bar — and a
            better chance at the storage grant above.
          </li>
          <li>
            Durations come from the times recorded at each tap, so correcting the Chromebook’s
            clock will not rewrite past sessions. A session running <em>across</em> a clock change
            will be wrong; fix it on the Sessions tab.
          </li>
        </ul>
      </section>
    </div>
  )
}
