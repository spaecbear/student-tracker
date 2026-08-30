/**
 * Check-in and check-out cues.
 *
 * Off by default and toggled in the teacher settings: thirty students checking
 * in over five minutes is a lot of chimes, and that should be Amanda's
 * decision rather than something she discovers on the first morning.
 *
 * Synthesised rather than shipped as audio files — two short tones do not
 * justify binary assets in the precache.
 */

type Direction = 'in' | 'out'

const TONES: Record<Direction, { from: number; to: number }> = {
  // A rising fifth going in, the same interval inverted coming out.
  in: { from: 523.25, to: 783.99 },
  out: { from: 659.25, to: 392.0 },
}

const DURATION_S = 0.22
const PEAK_GAIN = 0.09

let context: AudioContext | null = null

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Constructor = window.AudioContext
  if (typeof Constructor !== 'function') return null
  if (!context) {
    try {
      context = new Constructor()
    } catch {
      return null
    }
  }
  return context
}

/**
 * Plays one cue. Never throws and never blocks the check-in itself: a device
 * with audio disabled should still record attendance.
 */
export function playCue(direction: Direction): void {
  const ctx = audioContext()
  if (!ctx) return

  try {
    // Autoplay policy suspends the context until a gesture; a tap is one.
    if (ctx.state === 'suspended') void ctx.resume()

    const now = ctx.currentTime
    const { from, to } = TONES[direction]

    const oscillator = ctx.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(from, now)
    oscillator.frequency.exponentialRampToValueAtTime(to, now + DURATION_S)

    // Ramped in and out, so the tone does not click at either end.
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + DURATION_S)

    oscillator.connect(gain).connect(ctx.destination)
    oscillator.start(now)
    oscillator.stop(now + DURATION_S + 0.02)
  } catch {
    // Sound is a nicety; a failure here must never surface to a student.
  }
}

/** Test seam: drops the cached context so a fresh one is built next call. */
export function resetAudioContextForTests(): void {
  context = null
}
