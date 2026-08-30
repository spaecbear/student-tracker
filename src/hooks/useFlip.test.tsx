import { render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useFlip } from './useFlip'

/** Positions each card reports, keyed by flip id; changed between renders. */
const positions = new Map<string, { left: number; top: number }>()

function Board({ ids }: { ids: string[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useFlip(ref)
  return (
    <div ref={ref}>
      {ids.map((id) => (
        <div key={id} data-flip-id={id} data-testid={id} />
      ))}
    </div>
  )
}

function stubRects() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const id = this.dataset['flipId'] ?? ''
    const { left, top } = positions.get(id) ?? { left: 0, top: 0 }
    return { left, top, right: left, bottom: top, width: 0, height: 0, x: left, y: top } as DOMRect
  })
}

function mockAnimate() {
  const animate = vi.fn()
  Object.defineProperty(Element.prototype, 'animate', {
    value: animate,
    configurable: true,
    writable: true,
  })
  return animate
}

function setReducedMotion(reduced: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('reduced-motion') ? reduced : false,
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
  positions.clear()
  vi.restoreAllMocks()
})

describe('useFlip', () => {
  it('animates a card from where it was to where it now is', () => {
    setReducedMotion(false)
    stubRects()
    positions.set('a', { left: 0, top: 0 })
    const animate = mockAnimate()

    const { rerender } = render(<Board ids={['a']} />)
    expect(animate).not.toHaveBeenCalled() // first paint: nothing to move from

    positions.set('a', { left: 400, top: 60 })
    rerender(<Board ids={['a', 'b']} />)

    expect(animate).toHaveBeenCalledOnce()
    const [frames, options] = animate.mock.calls[0] ?? []
    expect(frames?.[0]).toEqual({ transform: 'translate(-400px, -60px)' })
    expect(frames?.[1]).toEqual({ transform: 'translate(0, 0)' })
    expect(options?.duration).toBe(320)
  })

  it('leaves a card that has not moved alone', () => {
    setReducedMotion(false)
    stubRects()
    positions.set('a', { left: 10, top: 10 })
    const animate = mockAnimate()

    const { rerender } = render(<Board ids={['a']} />)
    rerender(<Board ids={['a']} />)
    expect(animate).not.toHaveBeenCalled()
  })

  it('cross-fades instead of moving under prefers-reduced-motion', () => {
    setReducedMotion(true)
    stubRects()
    positions.set('a', { left: 0, top: 0 })
    const animate = mockAnimate()

    const { rerender } = render(<Board ids={['a']} />)
    positions.set('a', { left: 400, top: 0 })
    rerender(<Board ids={['a']} />)

    const [frames] = animate.mock.calls[0] ?? []
    expect(frames).toEqual([{ opacity: 0 }, { opacity: 1 }])
  })

  it('does nothing on a browser without the animation API', () => {
    setReducedMotion(false)
    stubRects()
    positions.set('a', { left: 0, top: 0 })
    // @ts-expect-error deliberately removing the API to exercise the guard
    delete Element.prototype.animate

    const { rerender } = render(<Board ids={['a']} />)
    positions.set('a', { left: 400, top: 0 })
    expect(() => rerender(<Board ids={['a']} />)).not.toThrow()
  })
})
