import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatBytes, readStorageStatus, requestPersistence } from './storage'

function withStorageManager(manager: unknown) {
  Object.defineProperty(navigator, 'storage', { value: manager, configurable: true })
}

afterEach(() => {
  withStorageManager(undefined)
  vi.restoreAllMocks()
})

describe('requestPersistence', () => {
  it('reports the existing grant without asking again', async () => {
    const persist = vi.fn()
    withStorageManager({ persisted: vi.fn().mockResolvedValue(true), persist })
    expect(await requestPersistence()).toBe('persisted')
    expect(persist).not.toHaveBeenCalled()
  })

  it('asks when not yet granted and reports the answer', async () => {
    withStorageManager({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(true),
    })
    expect(await requestPersistence()).toBe('persisted')
  })

  it('treats a refusal as a state, not a failure', async () => {
    withStorageManager({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(false),
    })
    expect(await requestPersistence()).toBe('not-persisted')
  })

  it('reports browsers without the API instead of throwing', async () => {
    withStorageManager(undefined)
    expect(await requestPersistence()).toBe('unsupported')
    withStorageManager({})
    expect(await requestPersistence()).toBe('unsupported')
  })

  it('survives an API that rejects', async () => {
    withStorageManager({
      persisted: vi.fn().mockRejectedValue(new Error('denied')),
      persist: vi.fn(),
    })
    expect(await requestPersistence()).toBe('unsupported')
  })
})

describe('readStorageStatus', () => {
  it('reports the grant alongside the usage estimate', async () => {
    withStorageManager({
      persisted: vi.fn().mockResolvedValue(true),
      persist: vi.fn(),
      estimate: vi.fn().mockResolvedValue({ usage: 524_288, quota: 1_073_741_824 }),
    })
    expect(await readStorageStatus()).toEqual({
      state: 'persisted',
      usageBytes: 524_288,
      quotaBytes: 1_073_741_824,
    })
  })

  it('still reports the grant when no estimate is available', async () => {
    withStorageManager({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn(),
      estimate: vi.fn().mockRejectedValue(new Error('nope')),
    })
    expect(await readStorageStatus()).toEqual({
      state: 'not-persisted',
      usageBytes: null,
      quotaBytes: null,
    })
  })

  it('reports unsupported browsers', async () => {
    withStorageManager(undefined)
    expect(await readStorageStatus()).toMatchObject({ state: 'unsupported' })
  })
})

describe('formatBytes', () => {
  it('formats readable sizes and handles the unknown case', () => {
    expect(formatBytes(null)).toBe('unknown')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(524_288)).toBe('512 KB')
    expect(formatBytes(1_572_864)).toBe('1.5 MB')
    expect(formatBytes(1_073_741_824)).toBe('1.0 GB')
  })
})
