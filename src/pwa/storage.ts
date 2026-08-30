/**
 * Storage durability. Without a persistence grant, Chrome can evict the
 * origin's IndexedDB under storage pressure, which would silently destroy a
 * year of attendance. The grant is requested once on first run and its status
 * is surfaced in the teacher view, because a silent "no" is the dangerous case.
 */

export type PersistenceState = 'persisted' | 'not-persisted' | 'unsupported'

export interface StorageStatus {
  state: PersistenceState
  /** Bytes currently used by this origin, when the browser reports it. */
  usageBytes: number | null
  /** Bytes this origin may use, when the browser reports it. */
  quotaBytes: number | null
}

function supportsPersistence(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage?.persist === 'function' &&
    typeof navigator.storage?.persisted === 'function'
  )
}

/**
 * Asks for persistent storage if it has not already been granted. Chrome
 * decides on its own signals and may refuse without prompting, so a `false`
 * here is informational, not an error.
 */
export async function requestPersistence(): Promise<PersistenceState> {
  if (!supportsPersistence()) return 'unsupported'
  try {
    if (await navigator.storage.persisted()) return 'persisted'
    return (await navigator.storage.persist()) ? 'persisted' : 'not-persisted'
  } catch {
    return 'unsupported'
  }
}

export async function readStorageStatus(): Promise<StorageStatus> {
  if (!supportsPersistence()) {
    return { state: 'unsupported', usageBytes: null, quotaBytes: null }
  }

  let state: PersistenceState = 'not-persisted'
  try {
    state = (await navigator.storage.persisted()) ? 'persisted' : 'not-persisted'
  } catch {
    state = 'unsupported'
  }

  let usageBytes: number | null = null
  let quotaBytes: number | null = null
  if (typeof navigator.storage.estimate === 'function') {
    try {
      const estimate = await navigator.storage.estimate()
      usageBytes = estimate.usage ?? null
      quotaBytes = estimate.quota ?? null
    } catch {
      // An unavailable estimate is not worth surfacing; the grant state is.
    }
  }

  return { state, usageBytes, quotaBytes }
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'unknown'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}
