import { useCallback, useEffect, useState } from 'react'
import { StorageError, listClasses, type Class } from '../db'
import { schoolYearForDate } from '../domain'

export interface OwnClasses {
  loaded: boolean
  classes: Class[]
  error: StorageError | null
  reload: () => void
}

/**
 * The signed-in teacher's own classes for the current school year.
 *
 * Every teacher-facing screen works from this list rather than the device-wide
 * one, so a teacher sharing a room can never open another's roster — including
 * the class the student view happens to be showing.
 */
export function useOwnClasses(teacherId: string | undefined): OwnClasses {
  const [classes, setClasses] = useState<Class[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<StorageError | null>(null)
  const [token, setToken] = useState(0)

  useEffect(() => {
    if (!teacherId) {
      setClasses([])
      setLoaded(true)
      return
    }
    let cancelled = false
    listClasses(schoolYearForDate(Date.now()), { teacherId, includeArchived: true })
      .then((rows) => {
        if (cancelled) return
        setClasses(rows)
        setError(null)
        setLoaded(true)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(
          cause instanceof StorageError
            ? cause
            : new StorageError('Could not read your classes.', cause),
        )
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [teacherId, token])

  const reload = useCallback(() => setToken((n) => n + 1), [])

  return { loaded, classes, error, reload }
}
