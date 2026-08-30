import { act, renderHook, waitFor } from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { getSetting } from '../db'
import { resetDBConnectionForTests } from '../db/schema'
import { DAILY_TOTAL_SETTING, SOUND_SETTING, useAppSettings } from './useAppSettings'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange
  resetDBConnectionForTests()
})

describe('useAppSettings', () => {
  it('starts with sound off and daily totals on', async () => {
    const { result } = renderHook(() => useAppSettings())
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.soundEnabled).toBe(false)
    expect(result.current.showDailyTotal).toBe(true)
  })

  it('persists a change and reads it back on the next launch', async () => {
    const first = renderHook(() => useAppSettings())
    await waitFor(() => expect(first.result.current.loaded).toBe(true))

    act(() => {
      first.result.current.setSoundEnabled(true)
      first.result.current.setShowDailyTotal(false)
    })
    expect(first.result.current.soundEnabled).toBe(true)

    await waitFor(async () => expect(await getSetting(SOUND_SETTING, false)).toBe(true))
    expect(await getSetting(DAILY_TOTAL_SETTING, true)).toBe(false)

    const second = renderHook(() => useAppSettings())
    await waitFor(() => expect(second.result.current.loaded).toBe(true))
    expect(second.result.current.soundEnabled).toBe(true)
    expect(second.result.current.showDailyTotal).toBe(false)
  })
})
