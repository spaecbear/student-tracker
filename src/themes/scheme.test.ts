import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SCHEME_STORAGE_KEY,
  applyScheme,
  isSchemePreference,
  readStoredScheme,
  resolveScheme,
  storeScheme,
} from './scheme'

function mockPrefersDark(dark: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('dark') ? dark : false,
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

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  delete document.documentElement.dataset['scheme']
})

describe('scheme preference', () => {
  it('defaults to following the system', () => {
    expect(readStoredScheme()).toBe('system')
  })

  it('round-trips a stored choice', () => {
    storeScheme('dark')
    expect(localStorage.getItem(SCHEME_STORAGE_KEY)).toBe('dark')
    expect(readStoredScheme()).toBe('dark')
  })

  it('ignores a corrupted stored value', () => {
    localStorage.setItem(SCHEME_STORAGE_KEY, 'chartreuse')
    expect(readStoredScheme()).toBe('system')
  })

  it('falls back to the system when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readStoredScheme()).toBe('system')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => storeScheme('dark')).not.toThrow()
  })

  it('validates preference values', () => {
    expect(isSchemePreference('system')).toBe(true)
    expect(isSchemePreference('dark')).toBe(true)
    expect(isSchemePreference('sepia')).toBe(false)
    expect(isSchemePreference(null)).toBe(false)
  })
})

describe('resolveScheme', () => {
  it('honors an explicit choice regardless of the system', () => {
    mockPrefersDark(true)
    expect(resolveScheme('light')).toBe('light')
    mockPrefersDark(false)
    expect(resolveScheme('dark')).toBe('dark')
  })

  it('follows the system when set to system', () => {
    mockPrefersDark(true)
    expect(resolveScheme('system')).toBe('dark')
    mockPrefersDark(false)
    expect(resolveScheme('system')).toBe('light')
  })
})

describe('applyScheme', () => {
  it('sets the root attribute the CSS keys off, without touching the class theme', () => {
    document.documentElement.dataset['theme'] = 'rose'
    mockPrefersDark(true)

    expect(applyScheme('system')).toBe('dark')
    expect(document.documentElement.dataset['scheme']).toBe('dark')
    expect(document.documentElement.dataset['theme']).toBe('rose')

    expect(applyScheme('light')).toBe('light')
    expect(document.documentElement.dataset['scheme']).toBe('light')
    expect(document.documentElement.dataset['theme']).toBe('rose')
  })
})
