import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getInstallState,
  isStandalone,
  promptInstall,
  resetInstallStateForTests,
  startInstallCapture,
  subscribeToInstallState,
} from './install'

/** Stands in for Chrome's beforeinstallprompt event. */
function installEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: string; platform: string }>
    platforms: string[]
  }
  event.platforms = ['web']
  event.prompt = vi.fn().mockResolvedValue(undefined)
  event.userChoice = Promise.resolve({ outcome, platform: 'web' })
  return event
}

function mockDisplayMode(standalone: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: standalone && query.includes('standalone'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        onchange: null,
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  )
}

beforeEach(() => {
  resetInstallStateForTests()
  mockDisplayMode(false)
  startInstallCapture()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('install prompt capture', () => {
  it('offers nothing until the browser says the app is installable', () => {
    expect(getInstallState()).toEqual({ canInstall: false, installed: false })
  })

  it('offers an install button once the browser fires the event', () => {
    window.dispatchEvent(installEvent())
    expect(getInstallState().canInstall).toBe(true)
  })

  it('suppresses Chrome’s own infobar so the in-app button is the way in', () => {
    const event = installEvent()
    const prevented = vi.spyOn(event, 'preventDefault')
    window.dispatchEvent(event)
    expect(prevented).toHaveBeenCalled()
  })

  it('notifies subscribers when installability changes', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToInstallState(listener)

    window.dispatchEvent(installEvent())
    expect(listener).toHaveBeenCalled()

    unsubscribe()
    listener.mockClear()
    window.dispatchEvent(installEvent())
    expect(listener).not.toHaveBeenCalled()
  })

  it('returns a stable snapshot so React does not loop', () => {
    expect(getInstallState()).toBe(getInstallState())
    window.dispatchEvent(installEvent())
    const afterEvent = getInstallState()
    expect(afterEvent).toBe(getInstallState())
  })
})

describe('promptInstall', () => {
  it('shows the browser dialog and reports acceptance', async () => {
    const event = installEvent('accepted')
    window.dispatchEvent(event)

    expect(await promptInstall()).toBe('accepted')
    expect(event.prompt).toHaveBeenCalled()
    expect(getInstallState().installed).toBe(true)
  })

  it('reports a dismissal without marking the app installed', async () => {
    window.dispatchEvent(installEvent('dismissed'))
    expect(await promptInstall()).toBe('dismissed')
    expect(getInstallState().installed).toBe(false)
  })

  it('consumes the single-use event, so the button disappears until Chrome offers again', async () => {
    window.dispatchEvent(installEvent('dismissed'))
    await promptInstall()
    expect(getInstallState().canInstall).toBe(false)
    expect(await promptInstall()).toBe('unavailable')
  })

  it('reports unavailable rather than throwing when nothing was captured', async () => {
    expect(await promptInstall()).toBe('unavailable')
  })
})

describe('already installed', () => {
  it('recognises the app running in its own window', () => {
    mockDisplayMode(true)
    expect(isStandalone()).toBe(true)
    expect(getInstallState().installed).toBe(true)
  })

  it('marks the app installed once the browser reports it', () => {
    window.dispatchEvent(installEvent())
    window.dispatchEvent(new Event('appinstalled'))
    expect(getInstallState()).toEqual({ canInstall: false, installed: true })
  })
})
