/**
 * Install prompt handling.
 *
 * Chrome hides "install" behind a menu most people never open. Capturing its
 * `beforeinstallprompt` event lets the app offer a plain button instead, so
 * setting the Chromebook up never involves hunting through browser menus —
 * and never involves a console.
 */

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt: () => Promise<void>
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

let deferredPrompt: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()

function announce(): void {
  for (const listener of listeners) listener()
}

/** True when the app is already running as an installed window, not a tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof window.matchMedia === 'function') {
    if (window.matchMedia('(display-mode: standalone)').matches) return true
    if (window.matchMedia('(display-mode: window-controls-overlay)').matches) return true
  }
  // iOS Safari predates display-mode and reports this instead.
  return (navigator as { standalone?: boolean }).standalone === true
}

/**
 * Starts listening for the install prompt. Called from main.tsx rather than a
 * component, because Chrome can fire the event before React has mounted.
 */
export function startInstallCapture(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('beforeinstallprompt', (event) => {
    // Without this Chrome shows its own mini-infobar and withholds the event.
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    announce()
  })

  window.addEventListener('appinstalled', () => {
    installed = true
    deferredPrompt = null
    announce()
  })
}

export interface InstallState {
  /** A real install prompt is available right now. */
  canInstall: boolean
  /** Already installed, or running as an installed app. */
  installed: boolean
}

let snapshot: InstallState = { canInstall: false, installed: false }

/** Stable snapshot for useSyncExternalStore; only changes when the state does. */
export function getInstallState(): InstallState {
  const next: InstallState = {
    canInstall: deferredPrompt !== null,
    installed: installed || isStandalone(),
  }
  if (next.canInstall !== snapshot.canInstall || next.installed !== snapshot.installed) {
    snapshot = next
  }
  return snapshot
}

export function subscribeToInstallState(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Shows the browser's install dialog. The event is single-use: Chrome will
 * fire a fresh one later if the person dismisses it.
 */
export async function promptInstall(): Promise<InstallOutcome> {
  const event = deferredPrompt
  if (!event) return 'unavailable'
  deferredPrompt = null
  announce()
  try {
    await event.prompt()
    const { outcome } = await event.userChoice
    if (outcome === 'accepted') {
      installed = true
      announce()
    }
    return outcome
  } catch {
    return 'unavailable'
  }
}

/** Test seam: clears captured state between cases. */
export function resetInstallStateForTests(): void {
  deferredPrompt = null
  installed = false
  listeners.clear()
  snapshot = { canInstall: false, installed: false }
}
