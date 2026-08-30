import { afterEach, describe, expect, it, vi } from 'vitest'
import { playCue, resetAudioContextForTests } from './tones'

function mockAudioContext(state: AudioContextState = 'running') {
  const frequency = {
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  }
  const oscillator = {
    type: '',
    frequency,
    connect: vi.fn(function (this: unknown, node: unknown) {
      return node
    }),
    start: vi.fn(),
    stop: vi.fn(),
  }
  const gain = {
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
  }
  const context = {
    state,
    currentTime: 0,
    destination: {},
    resume: vi.fn(),
    createOscillator: vi.fn(() => oscillator),
    createGain: vi.fn(() => gain),
  }
  // An arrow function cannot be called with `new`, which is how the module
  // constructs the context.
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function () {
      return context
    }),
  )
  return { context, oscillator, gain, frequency }
}

afterEach(() => {
  resetAudioContextForTests()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('playCue', () => {
  it('rises going in and falls coming out', () => {
    const { frequency, oscillator } = mockAudioContext()

    playCue('in')
    expect(frequency.setValueAtTime.mock.calls[0]?.[0]).toBe(523.25)
    expect(frequency.exponentialRampToValueAtTime.mock.calls[0]?.[0]).toBe(783.99)
    expect(oscillator.start).toHaveBeenCalled()
    expect(oscillator.stop).toHaveBeenCalled()

    playCue('out')
    const [from] = frequency.setValueAtTime.mock.calls[1] ?? []
    const [to] = frequency.exponentialRampToValueAtTime.mock.calls[1] ?? []
    expect(Number(to)).toBeLessThan(Number(from))
  })

  it('reuses one audio context across cues', () => {
    mockAudioContext()
    playCue('in')
    playCue('out')
    expect(vi.mocked(window.AudioContext)).toHaveBeenCalledTimes(1)
  })

  it('resumes a context suspended by the autoplay policy', () => {
    const { context } = mockAudioContext('suspended')
    playCue('in')
    expect(context.resume).toHaveBeenCalled()
  })

  it('stays silent instead of throwing when there is no audio support', () => {
    vi.stubGlobal('AudioContext', undefined)
    expect(() => playCue('in')).not.toThrow()
  })

  it('swallows an audio failure so a check-in is never blocked by it', () => {
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return {
          state: 'running',
          currentTime: 0,
          destination: {},
          createOscillator: () => {
            throw new Error('no hardware')
          },
          createGain: vi.fn(),
        }
      }),
    )
    expect(() => playCue('out')).not.toThrow()
  })
})
