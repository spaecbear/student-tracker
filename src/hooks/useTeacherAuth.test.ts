import { act, renderHook, waitFor } from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPrimaryTeacher, listTeachers } from '../db'
import { resetDBConnectionForTests } from '../db/schema'
import { AUTO_LOCK_MS, useTeacherAuth } from './useTeacherAuth'

const PASSWORD = 'Bio Room 214!'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange
  resetDBConnectionForTests()
})

async function setUpAccount() {
  const view = renderHook(() => useTeacherAuth())
  await waitFor(() => expect(view.result.current.state).toBe('setup'))
  await act(async () => {
    await view.result.current.createFirstAccount('Amanda', PASSWORD)
  })
  return view
}

/** The id of the account to sign in as, once the hook has loaded them. */
function onlyTeacherId(view: { result: { current: { teachers: { id: string }[] } } }): string {
  const id = view.result.current.teachers[0]?.id
  if (!id) throw new Error('no teacher loaded')
  return id
}

describe('useTeacherAuth', () => {
  it('asks for setup when no password has been chosen yet', async () => {
    const { result } = renderHook(() => useTeacherAuth())
    await waitFor(() => expect(result.current.state).toBe('setup'))
    expect(result.current.teacher).toBeNull()
  })

  it('stores a hashed password and hands back a recovery code once', async () => {
    const { result } = await setUpAccount()
    expect(result.current.state).toBe('unlocked')
    expect(result.current.recoveryCode).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/)

    const stored = await getPrimaryTeacher()
    expect(stored?.displayName).toBe('Amanda')
    expect(stored?.passwordHash).not.toBe(PASSWORD)
    expect(stored?.passwordHash).not.toBe('')
    expect(stored?.salt).not.toBe('')

    act(() => result.current.acknowledgeRecoveryCode())
    expect(result.current.recoveryCode).toBeNull()
  })

  it('starts locked once an account exists', async () => {
    await setUpAccount()
    const { result } = renderHook(() => useTeacherAuth())
    await waitFor(() => expect(result.current.state).toBe('locked'))
  })

  it('unlocks with the right password and refuses the wrong one', async () => {
    await setUpAccount()
    const { result } = renderHook(() => useTeacherAuth())
    await waitFor(() => expect(result.current.state).toBe('locked'))

    const id = onlyTeacherId({ result })
    await act(async () => {
      expect(await result.current.unlock(id, 'wrong')).toBe(false)
    })
    expect(result.current.state).toBe('locked')
    expect(result.current.error).toBe('That password does not match.')

    await act(async () => {
      expect(await result.current.unlock(id, PASSWORD)).toBe(true)
    })
    expect(result.current.state).toBe('unlocked')
  })

  it('locks itself after the inactivity timeout', async () => {
    // Set the account up on real timers: waitFor cannot make progress under
    // fake ones. Swapping in fake timers and dispatching an interaction
    // re-arms the auto-lock timeout on the fake clock.
    const { result } = await setUpAccount()
    expect(result.current.state).toBe('unlocked')
    vi.useFakeTimers()
    try {
      act(() => {
        window.dispatchEvent(new Event('pointerdown'))
      })

      act(() => {
        vi.advanceTimersByTime(AUTO_LOCK_MS - 1000)
      })
      expect(result.current.state).toBe('unlocked')

      act(() => {
        vi.advanceTimersByTime(2000)
      })
      expect(result.current.state).toBe('locked')
    } finally {
      vi.useRealTimers()
    }
  })

  it('restarts the inactivity timer on interaction', async () => {
    const { result } = await setUpAccount()
    vi.useFakeTimers()
    try {
      act(() => {
        window.dispatchEvent(new Event('pointerdown'))
      })
      act(() => {
        vi.advanceTimersByTime(AUTO_LOCK_MS - 1000)
        window.dispatchEvent(new Event('pointerdown'))
        vi.advanceTimersByTime(AUTO_LOCK_MS - 1000)
      })
      expect(result.current.state).toBe('unlocked')
    } finally {
      vi.useRealTimers()
    }
  })

  it('locks when the app is backgrounded', async () => {
    const { result } = await setUpAccount()
    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current.state).toBe('locked')
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
  })

  it('refuses to add an account without proof of existing access', async () => {
    await setUpAccount()
    const { result } = renderHook(() => useTeacherAuth())
    await waitFor(() => expect(result.current.state).toBe('locked'))

    await act(async () => {
      expect(await result.current.addAccount('not-the-password', 'Student', 'letmein')).toBe(
        false,
      )
    })

    // The whole point: this screen must not be a way around the gate.
    expect(result.current.state).toBe('locked')
    expect(result.current.teacher).toBeNull()
    expect(result.current.error).toMatch(/not a password or recovery code/i)
    expect(await listTeachers()).toHaveLength(1)
  })

  it('adds an account when an existing password is given as proof', async () => {
    await setUpAccount()
    const { result } = renderHook(() => useTeacherAuth())
    await waitFor(() => expect(result.current.state).toBe('locked'))

    await act(async () => {
      expect(await result.current.addAccount(PASSWORD, 'Dave', 'chem-lab-2')).toBe(true)
    })

    expect(result.current.state).toBe('unlocked')
    expect(result.current.teacher?.displayName).toBe('Dave')
    expect(result.current.recoveryCode).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/)
    expect((await listTeachers()).map((t) => t.displayName)).toEqual(['Amanda', 'Dave'])
  })

  it('accepts an existing recovery code as proof too', async () => {
    const first = await setUpAccount()
    const code = first.result.current.recoveryCode as string

    const { result } = renderHook(() => useTeacherAuth())
    await waitFor(() => expect(result.current.state).toBe('locked'))
    await act(async () => {
      expect(await result.current.addAccount(code, 'Dave', 'chem-lab-2')).toBe(true)
    })
    expect(result.current.teacher?.displayName).toBe('Dave')
  })

  it('lets each account sign in with its own password only', async () => {
    await setUpAccount()
    const adding = renderHook(() => useTeacherAuth())
    await waitFor(() => expect(adding.result.current.state).toBe('locked'))
    await act(async () => {
      await adding.result.current.addAccount(PASSWORD, 'Dave', 'chem-lab-2')
    })

    const { result } = renderHook(() => useTeacherAuth())
    await waitFor(() => expect(result.current.teachers).toHaveLength(2))
    const amanda = result.current.teachers.find((t) => t.displayName === 'Amanda') as { id: string }
    const dave = result.current.teachers.find((t) => t.displayName === 'Dave') as { id: string }

    await act(async () => {
      expect(await result.current.unlock(amanda.id, 'chem-lab-2')).toBe(false)
      expect(await result.current.unlock(dave.id, 'chem-lab-2')).toBe(true)
    })
    expect(result.current.teacher?.displayName).toBe('Dave')
  })

  it('forgets who was signed in when it locks', async () => {
    const { result } = await setUpAccount()
    expect(result.current.teacher).not.toBeNull()
    act(() => result.current.lock())
    expect(result.current.teacher).toBeNull()
    expect(result.current.state).toBe('locked')
  })

  it('resets the password with the recovery code, and rejects a wrong code', async () => {
    const first = await setUpAccount()
    const code = first.result.current.recoveryCode as string

    const { result } = renderHook(() => useTeacherAuth())
    await waitFor(() => expect(result.current.state).toBe('locked'))

    const id = onlyTeacherId({ result })
    await act(async () => {
      expect(
        await result.current.resetWithRecoveryCode(id, 'AAAA-BBBB-CCCC-DDDD', 'newpass'),
      ).toBe(false)
    })
    expect(result.current.error).toBe('That recovery code does not match.')
    expect(result.current.state).toBe('locked')

    await act(async () => {
      expect(await result.current.resetWithRecoveryCode(id, code, 'newpass')).toBe(true)
    })
    expect(result.current.state).toBe('unlocked')

    const reopened = renderHook(() => useTeacherAuth())
    await waitFor(() => expect(reopened.result.current.state).toBe('locked'))
    const reopenedId = onlyTeacherId(reopened)
    await act(async () => {
      expect(await reopened.result.current.unlock(reopenedId, PASSWORD)).toBe(false)
      expect(await reopened.result.current.unlock(reopenedId, 'newpass')).toBe(true)
    })
  })
})
