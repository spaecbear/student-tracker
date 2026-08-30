import { useCallback, useEffect, useState } from 'react'
import {
  StorageError,
  deleteSchoolYearData,
  getSetting,
  listSchoolYears,
  setSetting,
  type PurgeResult,
  type SchoolYear,
} from '../db'
import { expiredSchoolYears } from '../domain'
import { buildYearExport, type YearExport } from '../export/yearExport'
import { downloadCsv } from '../export/download'
import { writeBackup } from '../pwa/opfs'

/**
 * Records that the teacher dismissed the gate for a year. Dismissal defers the
 * prompt to the next launch; it never counts as consent to delete.
 */
export const DEFERRED_YEARS_SETTING = 'deferredYearEndPrompts'

export type YearEndStage = 'idle' | 'pending' | 'exported' | 'purged'

export interface YearEndBackup {
  fileName: string
  /** null when this browser has no OPFS; surfaced rather than hidden. */
  sizeBytes: number | null
}

export interface YearEnd {
  stage: YearEndStage
  /** The oldest expired year, or null when nothing is outstanding. */
  schoolYear: SchoolYear | null
  /** True when this year's prompt was dismissed on an earlier launch. */
  previouslyDeferred: boolean
  exported: YearExport | null
  backups: YearEndBackup[]
  purge: PurgeResult | null
  error: StorageError | null
  busy: boolean
  runExport: () => Promise<void>
  confirmAndPurge: () => Promise<void>
  defer: () => Promise<void>
  dismissPurgeNotice: () => void
}

/**
 * Drives the end-of-year gate: detect an expired year, export it, back it up,
 * and only then — after the teacher confirms she holds the file — delete it.
 *
 * Nothing here deletes on a schedule. If she dismisses the prompt the data
 * stays exactly as it is and the gate returns on the next launch.
 */
export function useYearEnd(now: number = Date.now()): YearEnd {
  const [stage, setStage] = useState<YearEndStage>('idle')
  const [schoolYear, setSchoolYear] = useState<SchoolYear | null>(null)
  const [exported, setExported] = useState<YearExport | null>(null)
  const [backups, setBackups] = useState<YearEndBackup[]>([])
  const [purge, setPurge] = useState<PurgeResult | null>(null)
  const [error, setError] = useState<StorageError | null>(null)
  const [busy, setBusy] = useState(false)
  const [previouslyDeferred, setPreviouslyDeferred] = useState(false)

  const fail = useCallback((cause: unknown) => {
    setError(
      cause instanceof StorageError
        ? cause
        : new StorageError('The end-of-year export could not be completed.', cause),
    )
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([listSchoolYears(), getSetting<SchoolYear[]>(DEFERRED_YEARS_SETTING, [])])
      .then(([stored, deferred]) => {
        if (cancelled) return
        const [oldest] = expiredSchoolYears(stored, now)
        setSchoolYear(oldest ?? null)
        setPreviouslyDeferred(oldest !== undefined && deferred.includes(oldest))
        setStage(oldest ? 'pending' : 'idle')
      })
      .catch((cause: unknown) => {
        if (!cancelled) fail(cause)
      })
    return () => {
      cancelled = true
    }
    // `now` is deliberately not a dependency: it is captured once per launch,
    // so the gate cannot re-evaluate itself while the teacher works through it.
  }, [fail])

  const runExport = useCallback(async () => {
    if (!schoolYear) return
    setBusy(true)
    setError(null)
    try {
      const built = await buildYearExport(schoolYear, now)
      const saved: YearEndBackup[] = []
      for (const file of built.files) {
        downloadCsv(file.fileName, file.csv)
        saved.push({ fileName: file.fileName, sizeBytes: await writeBackup(file.fileName, file.csv) })
      }
      setExported(built)
      setBackups(saved)
      setStage('exported')
    } catch (cause) {
      fail(cause)
    } finally {
      setBusy(false)
    }
  }, [schoolYear, now, fail])

  const confirmAndPurge = useCallback(async () => {
    // Deleting without a completed export is not reachable from the UI, and is
    // refused here too rather than trusted.
    if (!schoolYear || stage !== 'exported') return
    setBusy(true)
    setError(null)
    try {
      setPurge(await deleteSchoolYearData(schoolYear))
      setStage('purged')
    } catch (cause) {
      fail(cause)
    } finally {
      setBusy(false)
    }
  }, [schoolYear, stage, fail])

  const defer = useCallback(async () => {
    if (!schoolYear) return
    try {
      const deferred = await getSetting<SchoolYear[]>(DEFERRED_YEARS_SETTING, [])
      await setSetting(DEFERRED_YEARS_SETTING, [...new Set([...deferred, schoolYear])])
    } catch (cause) {
      // Failing to record the dismissal is harmless: the gate simply returns.
      fail(cause)
    }
    setStage('idle')
  }, [schoolYear, fail])

  const dismissPurgeNotice = useCallback(() => {
    setStage('idle')
    setSchoolYear(null)
  }, [])

  return {
    stage,
    schoolYear,
    previouslyDeferred,
    exported,
    backups,
    purge,
    error,
    busy,
    runExport,
    confirmAndPurge,
    defer,
    dismissPurgeNotice,
  }
}
