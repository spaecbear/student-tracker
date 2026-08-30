import { useCallback, useEffect, useState } from 'react'
import {
  readStorageStatus,
  requestPersistence,
  type StorageStatus,
} from '../pwa/storage'

/**
 * Reads the storage-persistence grant and lets the teacher ask again. The
 * first-run request happens at startup in main.tsx; this is the reporting and
 * retry path.
 */
export function useStorageStatus(): {
  status: StorageStatus | null
  refresh: () => void
  requestAgain: () => Promise<void>
} {
  const [status, setStatus] = useState<StorageStatus | null>(null)
  const [token, setToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    readStorageStatus()
      .then((next) => {
        if (!cancelled) setStatus(next)
      })
      .catch(() => {
        if (!cancelled) setStatus({ state: 'unsupported', usageBytes: null, quotaBytes: null })
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const refresh = useCallback(() => setToken((n) => n + 1), [])

  const requestAgain = useCallback(async () => {
    await requestPersistence()
    refresh()
  }, [refresh])

  return { status, refresh, requestAgain }
}
