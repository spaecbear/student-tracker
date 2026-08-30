import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { ErrorBanner } from '../../components/ErrorBanner'
import { Field } from '../../components/Field'
import { StorageError, listClasses, type Class } from '../../db'
import { DAY_MS, formatDateISO, parseISODateLocal, schoolYearForDate } from '../../domain'
import { buildExport, type ExportMode } from '../../export/buildExport'
import { downloadCsv } from '../../export/download'

interface Props {
  /** Only this teacher's classes are offered for export. */
  teacherId: string
  activeClassId: string | null
}

const MODES: ReadonlyArray<{ id: ExportMode; label: string; hint: string }> = [
  {
    id: 'sessions',
    label: 'One row per session',
    hint: 'Every check-in and check-out, with its duration. Auto-closed sessions are flagged.',
  },
  {
    id: 'summary',
    label: 'One row per student',
    hint: 'Total time and session count for each student across the range.',
  },
]

/** Default range: the past week, which is the cadence a weekly report needs. */
const DEFAULT_RANGE_DAYS = 6

export function ExportPanel({ teacherId, activeClassId }: Props) {
  const [classes, setClasses] = useState<Class[]>([])
  const [classId, setClassId] = useState(activeClassId ?? '')
  const [from, setFrom] = useState(() => formatDateISO(Date.now() - DEFAULT_RANGE_DAYS * DAY_MS))
  const [to, setTo] = useState(() => formatDateISO(Date.now()))
  const [mode, setMode] = useState<ExportMode>('sessions')
  const [rowCount, setRowCount] = useState<number | null>(null)
  const [error, setError] = useState<StorageError | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const fromAt = parseISODateLocal(from)
  const toAt = parseISODateLocal(to)
  const rangeValid = fromAt !== null && toAt !== null && fromAt <= toAt
  const selected = classes.find((c) => c.id === classId) ?? null

  const fail = useCallback((cause: unknown) => {
    setError(
      cause instanceof StorageError ? cause : new StorageError('Could not build the export.', cause),
    )
  }, [])

  useEffect(() => {
    listClasses(schoolYearForDate(Date.now()), { includeArchived: true, teacherId })
      .then((available) => {
        setClasses(available)
        setClassId((current) => current || available[0]?.id || '')
      })
      .catch(fail)
  }, [teacherId, fail])

  // Keep the preview honest: recount whenever any input changes.
  useEffect(() => {
    if (!selected || !rangeValid) {
      setRowCount(null)
      return
    }
    let cancelled = false
    setSaved(null)
    buildExport({ classId: selected.id, className: selected.name, fromAt, toAt, mode })
      .then((built) => {
        if (!cancelled) {
          setRowCount(built.rowCount)
          setError(null)
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) fail(cause)
      })
    return () => {
      cancelled = true
    }
  }, [selected, fromAt, toAt, mode, rangeValid, fail])

  async function download() {
    if (!selected || !rangeValid) return
    try {
      const built = await buildExport({
        classId: selected.id,
        className: selected.name,
        fromAt,
        toAt,
        mode,
      })
      downloadCsv(built.fileName, built.csv)
      setSaved(built.fileName)
    } catch (cause) {
      fail(cause)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <ErrorBanner
          message="The export could not be built."
          detail={error.message}
          onDismiss={() => setError(null)}
        />
      )}

      <div
        className="flex flex-col gap-5 rounded-2xl border p-5"
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Class</span>
          <select
            value={classId}
            aria-label="Class"
            onChange={(event) => setClassId(event.target.value)}
            className="min-h-11 w-full max-w-md rounded-xl border px-3"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.archived ? ' (archived)' : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-4">
          <Field
            label="From"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="w-52"
          />
          <Field
            label="To"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="w-52"
          />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">What to export</legend>
          <div className="flex flex-col gap-2">
            {MODES.map((option) => (
              <label
                key={option.id}
                className="flex cursor-pointer items-start gap-3 rounded-xl border p-3"
                style={{
                  borderColor: mode === option.id ? 'var(--accent)' : 'var(--border)',
                  background: mode === option.id ? 'var(--accent-soft)' : 'transparent',
                }}
              >
                <input
                  type="radio"
                  name="export-mode"
                  className="mt-1 size-4"
                  checked={mode === option.id}
                  onChange={() => setMode(option.id)}
                />
                <span>
                  <span className="block font-medium">{option.label}</span>
                  <span className="block text-sm" style={{ color: 'var(--text-muted)' }}>
                    {option.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <p role="status" className="flex-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          {!rangeValid
            ? 'Pick a start date on or before the end date.'
            : rowCount === null
              ? 'Counting…'
              : rowCount === 0
                ? 'No rows in this range — nothing to export.'
                : `${rowCount} row${rowCount === 1 ? '' : 's'} ready to export.`}
        </p>
        <Button variant="primary" disabled={!rangeValid || rowCount === 0} onClick={download}>
          Download CSV
        </Button>
      </div>

      {saved && (
        <p
          className="rounded-2xl border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}
        >
          Saved <strong>{saved}</strong> to this device's Downloads folder. The browser does not
          report where a download landed, so check that the file is there before relying on it.
        </p>
      )}
    </div>
  )
}
