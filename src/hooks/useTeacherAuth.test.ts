import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { fakeSupabase } from '../test/fakeSupabase'
import { registerTeacher, signInTeacher } from '../test/helpers'
import { AUTO_LOCK_MS, useTeacherAuth } from './useTeacherAuth'

const PASSWORD = 'Bio Room 214!'

/** A brand-new device: nobody signed in yet. */
async function freshDevice() {
  const view = renderHook(() => useTeacherAuth())
  await waitFor(() => expect(view.result.current.state).toBe('signedOut'))
  return view
}

async function signedUp() {
  const view = await freshDevice()
  await act(async () => {
    expect(await view.result.current.signUp('Amanda', 'amanda', PASSWORD)).toBe(true)
  })
  return view
}

describe('useTeacherAuth', () => {
  it('asks for a sign-in when nobody is signed in on the device', async () => {
    const { result } = await freshDevice()
    expect(result.current.teacher).toBeNull()
  })

  it('creates an account, signs in, and hands back a recovery code once', async () => {
    const { result } = await signedUp()
    expect(result.current.state).toBe('unlocked')
    expect(result.current.teacher).toMatchObject({ username: 'amanda', displayName: 'Amanda' })
    expect(result.current.recoveryCode).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/)
    // Only a stored copy of the code exists on the server, never shown again.
    expect(fakeSupabase().recoveryHashes.size).toBe(1)

    act(() => result.current.acknowledgeRecoveryCode())
    expect(result.current.recoveryCode).toBeNull()
  })

  it('refuses a username that is taken', async () => {
    registerTeacher('Amanda')
    const { result } = await freshDevice()
    await act(async () => {
      expect(await result.current.signUp('Imposter', 'Amanda', 'whatever1')).toBe(false)
    })
    expect(result.current.error).toBe('That username is taken. Pick another.')
    expect(result.current.state).toBe('signedOut')
  })

  it('refuses a malformed username before asking the server', async () => {
    const { result } = await freshDevice()
    await act(async () => {
      expect(await result.current.signUp('A', 'no spaces!', PASSWORD)).toBe(false)
    })
    expect(result.current.error).toBe('That username is not allowed.')
    expect(fakeSupabase().users).toHaveLength(0)
  })

  it('still signs in when the recovery code could not be saved', async () => {
    const { result } = await freshDevice()
    const fake = fakeSupabase()
    // Only saving the code fails; the account itself is created.
    const spy = vi.spyOn(fake.recoveryHashes, 'set').mockImplementation(() => {
      throw new Error('boom')
    })
    await act(async () => {
      await result.current.signUp('Amanda', 'amanda', PASSWORD)
    })
    spy.mockRestore()
    expect(result.current.state).toBe('unlocked')
    expect(result.current.recoveryCode).toBeNull()
  })

  it('starts locked when the device is already signed in', async () => {
    signInTeacher('Amanda')
    const { result } = renderHook(() => useTeacherAuth())
    await waitFor(() => expect(result.current.state).toBe('locked'))
    expect(result.current.teacher?.displayName).toBe('Amanda')
  })

  it('signs in from the sign-in screen, and refuses a wrong password', async () => {
    registerTeacher('Amanda', PASSWORD)
    const { result } = await freshDevice()
    await act(async () => {
      expect(await result.current.signIn('amanda', 'wrong')).toBe(false)
    })
    expect(result.current.error).toBe('That username and password do not match.')
    expect(result.current.state).toBe('signedOut')

    await act(async () => {
      expect(await result.current.signIn('AMANDA', PASSWORD)).toBe(true)
    })
    expect(result.current.state).toBe('unlocked')
  })

  it('unlocks with the right password and refuses the wrong one', async () => {
    signInTeacher('Amanda', PASSWORD)
    const { result } = renderHook(() => useTeacherAuth())
    await waitFor(() => expect(result.current.state).toBe('locked'))

    await act(async () => {
      expect(await result.current.unlock('wrong')).toBe(false)
    })
    expect(result.current.state).toBe('locked')
    expect(result.current.error).toBe('That username and password do not match.')

    await act(async () => {
      expect(await result.current.unlock(PASSWORD)).toBe(true)
    })
    expect(result.current.state).toBe('unlocked')
  })

  it('reports a dropped connection instead of failing silently', async () => {
    signInTeacher('Amanda', PASSWORD)
    const { result } = renderHook(() => useTeacherAuth())
    await waitFor(() => expect(result.current.state).toBe('locked'))
    fakeSupabase().failWith = 'Failed to fetch'
    await act(async () => {
      expect(await result.current.unlock(PASSWORD)).toBe(false)
    })
    expect(result.current.error).toBe('Failed to fetch')
    expect(result.current.state).toBe('locked')
  })

  it('locks itself after the inactivity timeout', async () => {
    // Sign in on real timers: waitFor cannot make progress under fake ones.
    // Swapping in fake timers and dispatching an interaction re-arms the
    // auto-lock timeout on the fake clock.
    const { result } = await signedUp()
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
    const { result } = await signedUp()
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
    const { result } = await signedUp()
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

  it('stays signed in when it locks, so the class keeps running', async () => {
    const { result } = await signedUp()
    act(() => result.current.lock())
    expect(result.current.state).toBe('locked')
    expect(result.current.teacher?.username).toBe('amanda')
    expect(fakeSupabase().currentUser).not.toBeNull()
  })

  it('signs out of the device entirely', async () => {
    const { result } = await signedUp()
    await act(async () => {
      await result.current.signOut()
    })
    expect(result.current.state).toBe('signedOut')
    expect(result.current.teacher).toBeNull()
    expect(fakeSupabase().currentUser).toBeNull()
  })

  it('resets the password with the recovery code, and rejects a wrong code', async () => {
    const first = await signedUp()
    const code = first.result.current.recoveryCode as string
    await act(async () => {
      await first.result.current.signOut()
    })

    await act(async () => {
      expect(
        await first.result.current.resetWithRecoveryCode('amanda', 'AAAA-BBBB-CCCC-DDDD', 'newpass'),
      ).toBe(false)
    })
    expect(first.result.current.error).toBe('That username and recovery code do not match.')
    expect(first.result.current.state).toBe('signedOut')

    await act(async () => {
      // Written down in lower case with spaces: still accepted.
      expect(
        await first.result.current.resetWithRecoveryCode(
          'Amanda',
          code.toLowerCase().replaceAll('-', ' '),
          'newpass',
        ),
      ).toBe(true)
    })
    expect(first.result.current.state).toBe('unlocked')

    await act(async () => {
      await first.result.current.signOut()
    })
    await act(async () => {
      expect(await first.result.current.signIn('amanda', PASSWORD)).toBe(false)
      expect(await first.result.current.signIn('amanda', 'newpass')).toBe(true)
    })
  })

  it('replaces the recovery code, which cancels the old one', async () => {
    const first = await signedUp()
    const oldCode = first.result.current.recoveryCode as string
    act(() => first.result.current.acknowledgeRecoveryCode())

    await act(async () => {
      expect(await first.result.current.replaceRecoveryCode()).toBe(true)
    })
    const newCode = first.result.current.recoveryCode as string
    expect(newCode).not.toBe(oldCode)

    await act(async () => {
      await first.result.current.signOut()
    })
    await act(async () => {
      expect(await first.result.current.resetWithRecoveryCode('amanda', oldCode, 'newpass')).toBe(false)
      expect(await first.result.current.resetWithRecoveryCode('amanda', newCode, 'newpass')).toBe(true)
    })
  })
})
