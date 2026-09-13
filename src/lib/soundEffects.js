// Tiny synthesized "game feel" sound layer -- built on the Web Audio API
// rather than shipping audio files. Two real reasons, not just
// convenience: (1) sourcing licensed sound-effect assets for a personal
// project isn't something to do speculatively, and (2) a handful of
// oscillator-driven blips/arpeggios genuinely fits an "8-bit game" feel
// better than a stock chime library would. No dependency, no network
// fetch, no file to keep in sync with the repo.
//
// AudioContext must be created (or resumed) from inside a real user
// gesture in every modern browser's autoplay policy -- it's created lazily
// on first call, which in practice is always a click/keypress already in
// flight (a button press, Enter in the search box, toggling a habit), so
// this never needs its own separate "enable audio" prompt.
let ctx = null

function getContext() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    ctx = new AudioCtx()
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }
  return ctx
}

// One short tone: a square wave (the classic chiptune timbre) with a fast
// linear-decay envelope so notes don't click on start/stop or ring on
// forever. `at` is seconds from now, so a whole melody can be scheduled in
// one call without a chain of setTimeouts drifting against each other.
function tone(context, freq, at, duration, gain = 0.05, type = 'square') {
  const osc = context.createOscillator()
  const amp = context.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, context.currentTime + at)
  amp.gain.setValueAtTime(0, context.currentTime + at)
  amp.gain.linearRampToValueAtTime(gain, context.currentTime + at + 0.008)
  amp.gain.linearRampToValueAtTime(0, context.currentTime + at + duration)
  osc.connect(amp)
  amp.connect(context.destination)
  osc.start(context.currentTime + at)
  osc.stop(context.currentTime + at + duration + 0.02)
}

// Named cues rather than exposing raw frequencies to every call site --
// callers say WHAT just happened (same convention as lib/playerXP.js's
// XP_REWARDS keys), this file decides what that sounds like.
const CUES = {
  click: (c) => tone(c, 720, 0, 0.05, 0.035),
  levelup: (c) => {
    tone(c, 523.25, 0, 0.09, 0.05) // C5
    tone(c, 659.25, 0.09, 0.09, 0.05) // E5
    tone(c, 783.99, 0.18, 0.16, 0.06) // G5
  },
  achievement: (c) => {
    tone(c, 587.33, 0, 0.08, 0.05) // D5
    tone(c, 739.99, 0.08, 0.08, 0.05) // F#5
    tone(c, 987.77, 0.16, 0.22, 0.06) // B5
  },
  milestone: (c) => {
    tone(c, 440, 0, 0.07, 0.045) // A4
    tone(c, 554.37, 0.07, 0.07, 0.045) // C#5
    tone(c, 659.25, 0.14, 0.07, 0.045) // E5
    tone(c, 880, 0.21, 0.2, 0.06) // A5
  },
  pr: (c) => {
    // A quick rising sweep reads as "power up" rather than a fixed melody.
    const osc = c.createOscillator()
    const amp = c.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(220, c.currentTime)
    osc.frequency.exponentialRampToValueAtTime(660, c.currentTime + 0.22)
    amp.gain.setValueAtTime(0, c.currentTime)
    amp.gain.linearRampToValueAtTime(0.05, c.currentTime + 0.02)
    amp.gain.linearRampToValueAtTime(0, c.currentTime + 0.24)
    osc.connect(amp)
    amp.connect(c.destination)
    osc.start()
    osc.stop(c.currentTime + 0.26)
  },
}

export function playSound(cue) {
  try {
    const context = getContext()
    if (!context) return
    const play = CUES[cue]
    if (play) play(context)
  } catch {
    // Sound is pure decoration -- a blocked AudioContext or an unsupported
    // browser should never surface an error over something this cosmetic.
  }
}
