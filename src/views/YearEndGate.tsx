import { useState } from 'react'
import { Button } from '../components/Button'
import { ErrorBanner } from '../components/ErrorBanner'
import { formatBytes } from '../pwa/storage'
import { schoolYearLabel } from '../domain'
import type { YearEnd } from '../hooks/useYearEnd'

interface Props {
  yearEnd: YearEnd
  /** Called once the gate is finished, so the app can reload the current year. */
  onFinished: () => void
}

/**
 * The blocking end-of-year screen. It stands in front of the whole app until
 * the teacher either finishes the export and confirms she has the file, or
 * defers — in which case the data stays untouched and this returns next launch.
 *
 * Nothing on this screen deletes anything until step three.
 */
export function YearEndGate({ yearEnd, onFinished }: Props) {
  const [confirmed, setConfirmed] = useState(false)
  const { stage, schoolYear, exported, backups, purge } = yearEnd
  const label = schoolYear ? schoolYearLabel(schoolYear) : 'the previous school year'

  if (stage === 'purged') {
    return (
      <Shell title="That year is cleared" eyebrow="Done">
        <p style={{ color: 'var(--text-muted)' }}>
          Deleted {purge?.sessions ?? 0} session{purge?.sessions === 1 ? '' : 's'} across{' '}
          {purge?.classes ?? 0} class{purge?.classes === 1 ? '' : 'es'} and{' '}
          {purge?.students ?? 0} student record{purge?.students === 1 ? '' : 's'}. The current
          school year is untouched.
        </p>
        <Button
          variant="primary"
          className="mt-6"
          onClick={() => {
            yearEnd.dismissPurgeNotice()
            onFinished()
          }}
        >
          Start this year
        </Button>
      </Shell>
    )
  }

  return (
    <Shell title={`${label} is over`} eyebrow="Before you start this year">
      <p style={{ color: 'var(--text-muted)' }}>
        Last year's attendance is still on this Chromebook. Export it, check that you actually have
        the file, and then it can be cleared. Nothing is deleted until you say so — if you close
        this, the data stays and you will see this screen again next time.
      </p>

      {yearEnd.previouslyDeferred && (
        <p
          className="mt-4 rounded-xl border px-4 py-3 text-sm"
          style={{
            borderColor: 'var(--warn-border)',
            background: 'var(--warn-surface)',
            color: 'var(--warn-text)',
          }}
        >
          You put this off last time. The data is still here and still safe — but it will keep
          asking until the year is exported and cleared.
        </p>
      )}

      {yearEnd.error && (
        <div className="mt-5">
          <ErrorBanner
            message="The export did not finish."
            detail={yearEnd.error.message}
            onRetry={() => void yearEnd.runExport()}
          />
        </div>
      )}

      <ol className="mt-7 flex flex-col gap-4">
        <Step
          index={1}
          title="Export the year"
          done={stage === 'exported'}
          active={stage !== 'exported'}
        >
          {stage === 'exported' && exported ? (
            <>
              <p>
                {exported.totalRows} session{exported.totalRows === 1 ? '' : 's'} across{' '}
                {exported.classNames.length} class
                {exported.classNames.length === 1 ? '' : 'es'} downloaded as{' '}
                {exported.files.length} files.
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {backups.map((backup) => (
                  <li key={backup.fileName}>
                    <code>{backup.fileName}</code>{' '}
                    {backup.sizeBytes === null ? (
                      <span style={{ color: 'var(--warn-text)' }}>
                        — downloaded, but this browser kept no on-device backup copy
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>
                        — backup copy kept on this device ({formatBytes(backup.sizeBytes)})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <Button className="mt-3" onClick={() => void yearEnd.runExport()}>
                Download again
              </Button>
            </>
          ) : (
            <>
              <p style={{ color: 'var(--text-muted)' }}>
                Downloads one file with every session and one with each student's total, and keeps
                a backup copy on this device.
              </p>
              <Button
                variant="primary"
                className="mt-3"
                disabled={yearEnd.busy}
                onClick={() => void yearEnd.runExport()}
              >
                {yearEnd.busy ? 'Exporting…' : 'Export last year'}
              </Button>
            </>
          )}
        </Step>

        <Step index={2} title="Check that you have the file" active={stage === 'exported'}>
          <p style={{ color: 'var(--text-muted)' }}>
            Open your Downloads folder and confirm the files are there and open correctly. The
            browser cannot tell the app whether a download succeeded, which is why this step is
            yours.
          </p>
          <label className="mt-3 flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-5"
              checked={confirmed}
              disabled={stage !== 'exported'}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>I have opened the exported files and they contain last year's data.</span>
          </label>
        </Step>

        <Step index={3} title="Clear last year" active={stage === 'exported' && confirmed}>
          <p style={{ color: 'var(--text-muted)' }}>
            Deletes last year's classes, rosters, and sessions from this device. This cannot be
            undone.
          </p>
          <Button
            variant="danger"
            className="mt-3"
            disabled={stage !== 'exported' || !confirmed || yearEnd.busy}
            onClick={() => void yearEnd.confirmAndPurge()}
          >
            Delete last year's data
          </Button>
        </Step>
      </ol>

      <div className="mt-8 border-t pt-5" style={{ borderColor: 'var(--border)' }}>
        <Button onClick={() => void yearEnd.defer()}>Not now — keep the data and remind me</Button>
      </div>
    </Shell>
  )
}

function Shell({
  title,
  eyebrow,
  children,
}: {
  title: string
  eyebrow: string
  children: React.ReactNode
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-6 py-10">
      <div
        className="rounded-3xl border p-8"
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <p
          className="text-xs font-semibold tracking-[0.2em] uppercase"
          style={{ color: 'var(--accent)' }}
        >
          {eyebrow}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
        {children}
      </div>
    </main>
  )
}

function Step({
  index,
  title,
  children,
  done = false,
  active = false,
}: {
  index: number
  title: string
  children: React.ReactNode
  done?: boolean
  active?: boolean
}) {
  return (
    <li
      className="rounded-2xl border p-4"
      style={{
        borderColor: done || active ? 'var(--accent)' : 'var(--border)',
        opacity: active || done ? 1 : 0.55,
      }}
    >
      <h2 className="flex items-center gap-3 font-semibold">
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-sm"
          style={{
            background: done || active ? 'var(--accent)' : 'var(--surface-sunken)',
            color: done || active ? 'var(--on-accent)' : 'var(--text-muted)',
          }}
        >
          {done ? '✓' : index}
        </span>
        {title}
      </h2>
      <div className="mt-2 pl-10">{children}</div>
    </li>
  )
}
