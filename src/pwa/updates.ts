import { registerSW } from 'virtual:pwa-register'

/** How often a running app looks for a newly deployed version. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60_000

/** Just enough of ServiceWorkerRegistration to ask it to check for an update. */
export interface UpdatableRegistration {
  update: () => Promise<unknown>
}

/**
 * Polls for a newly deployed version while the app is running.
 *
 * Returns a stop function. Checks are skipped while the device is offline,
 * where a failed fetch is noise rather than information.
 */
export function startUpdatePolling(
  registration: UpdatableRegistration,
  intervalMs: number = UPDATE_CHECK_INTERVAL_MS,
): () => void {
  const id = window.setInterval(() => {
    if (navigator.onLine === false) return
    void registration.update()
  }, intervalMs)
  return () => window.clearInterval(id)
}

/**
 * Registers the service worker and keeps this device on the current version.
 *
 * The plugin's own injected registration only ever registered — it never asked
 * whether a newer build existed. On a Chromebook that stays open all day and
 * is only relaunched from the shelf, a deployed fix could sit unnoticed, and
 * even a manual refresh served the previous build until a second reload.
 *
 * With `registerType: 'autoUpdate'`, this reloads the page once the new worker
 * activates. A classroom device has no unsaved state to lose: every tap is
 * written to IndexedDB before the UI changes.
 */
export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return

  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (registration) startUpdatePolling(registration)
    },
    onRegisterError(error) {
      // Losing the service worker costs offline support, not correctness.
      console.warn('Service worker registration failed.', error)
    },
  })
}
