import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearAppShellCache } from './refresh'

function mockCaches(keys: string[]) {
  const store = new Set(keys)
  vi.stubGlobal('caches', {
    keys: vi.fn(async () => [...store]),
    delete: vi.fn(async (key: string) => store.delete(key)),
  })
  return store
}

function mockServiceWorker(count: number) {
  const unregister = vi.fn().mockResolvedValue(true)
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistrations: vi.fn(async () => Array.from({ length: count }, () => ({ unregister }))),
    },
  })
  return unregister
}

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined })
  vi.restoreAllMocks()
})

describe('clearAppShellCache', () => {
  it('removes the service worker and the cached app files', async () => {
    const unregister = mockServiceWorker(1)
    const store = mockCaches(['workbox-precache-v2', 'other-cache'])

    const result = await clearAppShellCache()

    expect(unregister).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ workersRemoved: 1, cachesRemoved: 2 })
    expect(store.size).toBe(0)
  })

  it('never touches IndexedDB, where the attendance records live', async () => {
    mockServiceWorker(1)
    mockCaches(['workbox-precache-v2'])
    const deleteDatabase = vi.fn()
    vi.stubGlobal('indexedDB', { deleteDatabase, databases: vi.fn(async () => []) })

    await clearAppShellCache()

    expect(deleteDatabase).not.toHaveBeenCalled()
  })

  it('still clears caches when there is no service worker to remove', async () => {
    mockCaches(['workbox-precache-v2'])
    const result = await clearAppShellCache()
    expect(result).toEqual({ workersRemoved: 0, cachesRemoved: 1 })
  })

  it('survives a browser that refuses to enumerate registrations', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistrations: vi.fn().mockRejectedValue(new Error('denied')),
      },
    })
    mockCaches(['workbox-precache-v2'])

    const result = await clearAppShellCache()

    // The cache purge still ran, which is the half that usually matters.
    expect(result).toEqual({ workersRemoved: 0, cachesRemoved: 1 })
  })
})
