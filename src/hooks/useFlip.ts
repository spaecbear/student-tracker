import { useLayoutEffect, useRef, type RefObject } from 'react'

/** Roughly 300ms with a small settle, per the design doc. */
const MOVE_DURATION_MS = 320
const MOVE_EASING = 'cubic-bezier(0.34, 1.32, 0.44, 1)'
const FADE_DURATION_MS = 180

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * FLIP animation for cards moving between the Out and In columns.
 *
 * Positions are measured after every render and compared with the previous
 * ones; anything that moved is animated from where it was to where it now is.
 * The DOM is never the thing being animated into place — React has already put
 * it there — so an interrupted animation cannot leave a card stranded.
 *
 * Under `prefers-reduced-motion` the movement is replaced with a cross-fade.
 */
export function useFlip(containerRef: RefObject<HTMLElement | null>): void {
  const previous = useRef(new Map<string, DOMRect>())

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (typeof Element.prototype.animate !== 'function') return

    const reduced = prefersReducedMotion()
    const next = new Map<string, DOMRect>()

    for (const node of container.querySelectorAll<HTMLElement>('[data-flip-id]')) {
      const id = node.dataset['flipId']
      if (id === undefined) continue

      const rect = node.getBoundingClientRect()
      next.set(id, rect)

      const old = previous.current.get(id)
      if (!old) continue

      const dx = old.left - rect.left
      const dy = old.top - rect.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue

      if (reduced) {
        node.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: FADE_DURATION_MS,
          easing: 'linear',
        })
      } else {
        node.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
          { duration: MOVE_DURATION_MS, easing: MOVE_EASING },
        )
      }
    }

    previous.current = next
  })
}
