// Shared request gate for EVERY Twelve Data call in this app, regardless
// of which file makes it.
//
// Real bug this fixes, confirmed from Dylan's own live screenshot: Market
// Pulse (8 symbols, lib/marketData.js) and Macro Desk (the same 8 symbols,
// lib/technicals.js) both went completely empty at once on a key that
// wasn't anywhere near the 800/day cap. Root cause -- each file already
// had its own "sequential, not parallel" loop to respect Twelve Data's
// 8-requests-per-minute limit, but the two loops never coordinated with
// each other. Loading the Dashboard tab (8 quote requests) and flipping to
// Macro Desk shortly after (8 more time_series requests) sends up to 16
// requests inside one real minute -- double the per-minute cap -- so
// Twelve Data 429s nearly everything, and both panels show empty at the
// same time even though the daily budget is fine. A per-file loop can
// never see what another file is doing; only one shared, app-wide gate
// can.
//
// MAX_PER_WINDOW is 7, not the real 8, to leave one request of headroom
// for timing jitter between this process's clock and Twelve Data's.
const MAX_PER_WINDOW = 7
const WINDOW_MS = 60_000

const requestTimestamps = [] // oldest first
let queueTail = Promise.resolve()

function pruneOld() {
  const cutoff = Date.now() - WINDOW_MS
  while (requestTimestamps.length && requestTimestamps[0] <= cutoff) {
    requestTimestamps.shift()
  }
}

async function waitForSlot() {
  pruneOld()
  if (requestTimestamps.length >= MAX_PER_WINDOW) {
    const waitMs = requestTimestamps[0] + WINDOW_MS - Date.now() + 50
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
    return waitForSlot() // re-check -- more than one slot may have freed up
  }
  requestTimestamps.push(Date.now())
}

// Wrap any Twelve Data network call with this. Callers from different
// files all funnel through the same `queueTail` chain, so they serialize
// against the SAME budget instead of each only watching their own loop.
export function queueTwelveDataRequest(fn) {
  const run = () => waitForSlot().then(fn)
  const result = queueTail.then(run, run)
  // Keep the chain alive even if this particular call fails -- the
  // rejection still propagates to whoever awaited `result`.
  queueTail = result.then(
    () => undefined,
    () => undefined
  )
  return result
}
