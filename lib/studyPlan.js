// Backward-scheduling for exam prep, built entirely from real research
// (Dunlosky et al. 2013, "Improving Students' Learning With Effective
// Learning Techniques: Promising Directions From Cognitive and
// Educational Psychology"): practice testing and distributed practice are
// the two highest-utility learning techniques studied -- well ahead of
// rereading, highlighting, and summarization, which the same research
// found to be low-utility despite being the most commonly used. Mixing
// topics (interleaved practice) showed promise as a secondary technique.
//
// This schedule leans entirely on those findings, deterministically -- no
// AI call, so it always works instantly regardless of whether the local
// Ollama model is running (a real, practical concern in this app, where
// the model has been offline more than once this project). Every session
// is framed as retrieval (do something, then check yourself) rather than
// passive review, since that framing is the actual substance of "practice
// testing" as a technique, not just a label on the same old rereading.

const SESSION_ROTATION = [
  {
    label: 'Retrieval practice',
    detail:
      'Close your notes and write out everything you remember about the material so far, then check what you missed.',
  },
  {
    label: 'Targeted review',
    detail: "Go back over exactly the gaps your last self-quiz turned up -- not a full reread of everything.",
  },
  {
    label: 'Interleaved practice',
    detail: 'Mix in review from another class or an earlier unit -- switching topics beats one long block on the same thing.',
  },
  {
    label: 'Practice test',
    detail: 'Simulate the real test: timed, no notes, then grade yourself honestly against the real material.',
  },
]

function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return { y, m, d }
}

function toDateKey(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Bare YYYY-MM-DD arithmetic, UTC-anchored throughout -- never round-tripped
// through new Date(bareDateString) in local time, which is the exact bug
// class that shifted dates a day earlier in this project (see
// SchoolPage.jsx's daysBetween/todayKey for the established pattern this
// mirrors).
function daysBetween(fromKey, toKey) {
  const f = parseDateKey(fromKey)
  const t = parseDateKey(toKey)
  const from = Date.UTC(f.y, f.m - 1, f.d)
  const to = Date.UTC(t.y, t.m - 1, t.d)
  return Math.round((to - from) / 86400000)
}

function addDays(dateKey, n) {
  const { y, m, d } = parseDateKey(dateKey)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + n)
  return toDateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

export function todayKey() {
  const d = new Date()
  return toDateKey(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

// Returns [] for a test that's today or already past -- nothing left to
// schedule. Otherwise returns 1-6 sessions spread across the days before
// the test, spaced roughly every 3 days (research: "two short study
// blocks per week" is the recommended minimum distributed-practice
// cadence), always ending the day before the test with a full
// practice-test simulation -- never the day of.
export function buildStudySessions(testDateKey, fromKey = todayKey()) {
  const availableDays = daysBetween(fromKey, testDateKey)
  if (availableDays <= 0) return []

  const sessionCount = Math.max(1, Math.min(6, Math.ceil(availableDays / 3) + 1))

  const offsets = new Set()
  for (let i = 0; i < sessionCount; i += 1) {
    const offset =
      i === sessionCount - 1
        ? availableDays - 1
        : Math.round((i / (sessionCount - 1 || 1)) * (availableDays - 1))
    offsets.add(offset)
  }

  const sortedOffsets = [...offsets].sort((a, b) => a - b)
  return sortedOffsets.map((offset, idx) => {
    const isLast = idx === sortedOffsets.length - 1
    const rotation = isLast ? SESSION_ROTATION[3] : SESSION_ROTATION[idx % 3]
    return {
      dateKey: addDays(fromKey, offset),
      label: rotation.label,
      detail: rotation.detail,
    }
  })
}
