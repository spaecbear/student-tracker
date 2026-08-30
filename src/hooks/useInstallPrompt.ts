import { useCallback, useSyncExternalStore } from 'react'
import {
  getInstallState,
  promptInstall,
  subscribeToInstallState,
  type InstallOutcome,
} from '../pwa/install'

export interface InstallPrompt {
  canInstall: boolean
  installed: boolean
  install: () => Promise<InstallOutcome>
}

/** Exposes the captured install prompt to the UI. */
export function useInstallPrompt(): InstallPrompt {
  const state = useSyncExternalStore(subscribeToInstallState, getInstallState, getInstallState)
  const install = useCallback(() => promptInstall(), [])
  return { canInstall: state.canInstall, installed: state.installed, install }
}
