// Fix the timezone so local-time assertions are stable on any machine.
process.env.TZ = 'America/New_York'

import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { beforeEach } from 'vitest'
import { installFakeSupabase } from './src/test/fakeSupabase'

// Every test starts with an empty in-memory Supabase and nobody signed in.
beforeEach(() => {
  installFakeSupabase()
})

// jsdom ships no SubtleCrypto; keep a real one available for tests that need it.
import { webcrypto } from 'node:crypto'
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

// This jsdom build ships neither localStorage nor matchMedia; both are real
// browser APIs the app relies on, so tests get working stand-ins.
if (typeof globalThis.localStorage === 'undefined' ||
    typeof globalThis.localStorage.clear !== 'function') {
  const store = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return store.size
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
}

if (typeof globalThis.matchMedia !== 'function') {
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  })
}
