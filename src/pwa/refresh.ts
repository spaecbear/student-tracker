/**
 * In-app recovery for a bad or stale app cache.
 *
 * If a deploy half-lands, or the cached files get into a state the automatic
 * update cannot resolve, the fix should be a button in the teacher view — not
 * a snippet pasted into DevTools, which is not a thing to ask a teacher to do
 * on a classroom Chromebook.
 */

export interface RefreshResult {
  workersRemoved: number
  cachesRemoved: number
}

/**
 * Drops the cached app files and the service worker, so the next load fetches
 * everything fresh.
 *
 * This deliberately does NOT touch IndexedDB. The attendance records live
 * there, and clearing them is the year-end purge's job, behind its own export
 * and confirmation — never a side effect of fixing the app files.
 */
export async function clearAppShellCache(): Promise<RefreshResult> {
  let workersRemoved = 0
  let cachesRemoved = 0

  if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      for (const registration of registrations) {
        if (await registration.unregister()) workersRemoved += 1
      }
    } catch {
      // Nothing to unregister, or the browser refused; the cache purge below
      // is still worth attempting.
    }
  }

  if (typeof caches !== 'undefined') {
    try {
      for (const key of await caches.keys()) {
        if (await caches.delete(key)) cachesRemoved += 1
      }
    } catch {
      // Same: report what did happen rather than failing the whole action.
    }
  }

  return { workersRemoved, cachesRemoved }
}
