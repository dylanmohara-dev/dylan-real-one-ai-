import { useEffect, useMemo, useRef, useState } from 'react'
import { LIFE_MODES } from '../data/lifeModes.js'

const PHASES = {
  idle: 'idle',
  dim: 'dim',
  charge: 'charge',
  burst: 'burst',
}

// Falls back to a neutral gold when no modeKey is given (or it doesn't
// match one of the 9 life modes) -- used for the generic app-wide level-up,
// which isn't tied to any single mode.
const DEFAULT_RGB = '251, 191, 36'
const DEFAULT_RGB2 = '245, 158, 11'

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)

    update()
    media.addEventListener?.('change', update)

    return () => media.removeEventListener?.('change', update)
  }, [])

  return reducedMotion
}

export default function SpellCastTransition({
  active,
  label = 'Preparing your next chapter',
  duration = 3800,
  modeKey = null,
  onComplete,
}) {
  const reducedMotion = useReducedMotion()
  const [phase, setPhase] = useState(PHASES.idle)
  const [progress, setProgress] = useState(0)

  // Read through a ref rather than the dependency array below -- a parent
  // re-render (which happens constantly across this app for reasons
  // unrelated to this transition) would otherwise hand this effect a new
  // onComplete function identity on every render, re-running the whole
  // effect and snapping the animation back to idle mid-flight.
  const onCompleteRef = useRef(onComplete)
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  const mode = useMemo(() => LIFE_MODES.find((item) => item.key === modeKey) || null, [modeKey])
  const spellRgb = mode?.rgb || DEFAULT_RGB
  const spellRgb2 = mode?.rgb2 || DEFAULT_RGB2

  const timings = useMemo(() => {
    const total = Math.max(1200, Number(duration) || 3800)
    const dimMs = Math.min(150, Math.round(total * 0.08))
    const burstMs = Math.max(320, Math.round(total * 0.16))
    const chargeMs = Math.max(400, total - dimMs - burstMs)

    return { total, dimMs, chargeMs, burstMs }
  }, [duration])

  useEffect(() => {
    if (!active) {
      setPhase(PHASES.idle)
      setProgress(0)
      return undefined
    }

    let animationFrame
    let completeTimer
    let burstTimer
    const startedAt = performance.now()

    setPhase(PHASES.dim)
    setProgress(0)

    const startCharge = window.setTimeout(() => {
      setPhase(PHASES.charge)

      const chargeStartedAt = performance.now()

      function updateProgress(now) {
        const elapsed = now - chargeStartedAt
        const nextProgress = Math.min(100, (elapsed / timings.chargeMs) * 100)

        setProgress(nextProgress)

        if (nextProgress < 100) {
          animationFrame = window.requestAnimationFrame(updateProgress)
        }
      }

      animationFrame = window.requestAnimationFrame(updateProgress)
    }, timings.dimMs)

    burstTimer = window.setTimeout(() => {
      setProgress(100)
      setPhase(PHASES.burst)
    }, timings.dimMs + timings.chargeMs)

    completeTimer = window.setTimeout(() => {
      onCompleteRef.current?.()
    }, timings.total)

    return () => {
      window.clearTimeout(startCharge)
      window.clearTimeout(burstTimer)
      window.clearTimeout(completeTimer)
      window.cancelAnimationFrame(animationFrame)

      if (performance.now() - startedAt < timings.total) {
        setPhase(PHASES.idle)
        setProgress(0)
      }
    }
  }, [active, timings])

  if (!active) return null

  const status =
    phase === PHASES.dim
      ? `${label}. Beginning ritual.`
      : phase === PHASES.charge
        ? `${label}. Charging ${Math.round(progress)} percent.`
        : `${label}. Complete.`

  return (
    <div
      className={`spell-cast-overlay spell-cast-${phase}${reducedMotion ? ' spell-cast-reduced' : ''}`}
      role="status"
      aria-live="assertive"
      aria-atomic="true"
      aria-label={status}
      style={{ '--spell-rgb': spellRgb, '--spell-rgb2': spellRgb2 }}
    >
      <span className="spell-cast-sr-only">{status}</span>

      <div className="spell-cast-backdrop" aria-hidden="true" />

      <div className="spell-cast-stage" aria-hidden="true">
        <div className="spell-cast-rays" />

        <svg className="spell-cast-ring" viewBox="0 0 120 120">
          <circle className="spell-cast-ring-track" cx="60" cy="60" r="52" />
          <circle
            className="spell-cast-ring-progress"
            cx="60"
            cy="60"
            r="52"
            pathLength="100"
            style={{ strokeDashoffset: 100 - progress }}
          />
        </svg>

        <div className="spell-cast-ticks">
          {Array.from({ length: 12 }, (_, index) => (
            <span
              key={index}
              style={{ transform: `rotate(${index * 30}deg) translateY(-54px)` }}
            />
          ))}
        </div>

        <div className="spell-cast-rune">
          <span className="spell-cast-rune-outer">✦</span>
          <span className="spell-cast-rune-inner">⌁</span>
        </div>

        {phase === PHASES.burst && !reducedMotion && (
          <div className="spell-cast-particles">
            {Array.from({ length: 16 }, (_, index) => (
              <span
                key={index}
                style={{
                  '--particle-angle': `${index * 22.5}deg`,
                  '--particle-distance': `${62 + (index % 4) * 14}px`,
                  '--particle-delay': `${(index % 3) * 24}ms`,
                }}
              />
            ))}
          </div>
        )}

        {phase === PHASES.burst && <div className="spell-cast-flash" />}
      </div>

      <div className="spell-cast-copy">
        <span className="spell-cast-eyebrow">DYLAN AI · ARCANE PROCESS</span>
        <strong>{phase === PHASES.burst ? 'Complete' : label}</strong>
        <span className="spell-cast-percent">
          {phase === PHASES.burst ? '100%' : `${Math.round(progress)}%`}
        </span>
      </div>
    </div>
  )
}
