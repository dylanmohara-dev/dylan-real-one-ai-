import { useEffect, useRef, useState } from 'react'

// Animates a displayed number toward `value` whenever it changes, instead
// of snapping straight to the new figure -- the "count up" feel real
// fintech dashboards (and this app's own XP/level bars) use for a number
// that just changed. Starts from 0 on first mount, then always animates
// from whatever was last displayed. Respects the user's OS-level
// reduced-motion preference by returning the raw value untouched -- read
// once via a lazy useState initializer (not a ref) since a ref's value
// can't be read during render, only a state value can.
export default function useCountUp(value, duration = 700) {
  const safeValue = Number.isFinite(value) ? value : 0
  const [prefersReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  )
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)
  const frameRef = useRef(null)

  useEffect(() => {
    if (prefersReduced) {
      fromRef.current = safeValue
      return undefined
    }

    const from = fromRef.current
    const delta = safeValue - from
    if (delta === 0) return undefined

    const start = performance.now()

    function tick(now) {
      const elapsed = now - start
      const t = Math.min(1, elapsed / duration)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
      setDisplay(from + delta * eased)
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = safeValue
      }
    }

    frameRef.current = requestAnimationFrame(tick)

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [safeValue, duration, prefersReduced])

  return prefersReduced ? safeValue : display
}
