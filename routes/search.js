import { Router } from 'express'
import { loadData } from '../lib/dataStore.js'

const router = Router()

// One place lists every searchable collection, instead of a special case
// per data type scattered through the route handler. Each source says
// which JSON file to load, what "type" label and mode (for jump-to-mode
// navigation) a hit gets tagged with, and how to pull a title/snippet/date
// out of that collection's own real field names (checked directly against
// each route file, not guessed -- mind habits use `name` not `title`,
// for example, and several collections don't have a title field at all).
//
// Deliberately excluded: `journal` -- it's passcode-protected by design
// (see routes/journal.js), so indexing its content in a plaintext global
// search would defeat the entire point of that passcode. Also excluded:
// anything that's pure credentials/tokens/internal state (gmail_tokens,
// drive_tokens, slack_tokens, notification_state, apple_calendar_credentials)
// -- never user-facing content, nothing to search for there.
const SEARCH_SOURCES = [
  {
    collection: 'tasks',
    type: 'Task',
    mode: 'tasks',
    title: (r) => r.title,
    snippet: (r) => [r.priority ? `${r.priority} priority` : '', r.completed ? 'done' : '', r.dueDate || ''].filter(Boolean).join(' · '),
    date: (r) => r.createdAt,
  },
  {
    collection: 'notes',
    type: 'Note',
    mode: 'notes',
    title: (r) => (r.content || '').slice(0, 60),
    snippet: (r) => r.content,
    date: (r) => r.createdAt,
  },
  {
    collection: 'goals',
    type: 'Goal',
    mode: 'goals',
    title: (r) => r.title,
    snippet: (r) => `${r.progress ?? 0}% complete${r.dueDate ? ` · due ${r.dueDate}` : ''}`,
    date: (r) => r.createdAt,
  },
  {
    collection: 'memories',
    type: 'Memory',
    mode: 'memory',
    title: (r) => (r.content || '').slice(0, 60),
    snippet: (r) => r.content,
    date: (r) => r.createdAt,
  },
  {
    collection: 'classes',
    type: 'Class',
    mode: 'school',
    title: (r) => r.name,
    snippet: (r) => r.level || '',
    date: (r) => r.createdAt,
  },
  {
    collection: 'assignments',
    type: 'Assignment',
    mode: 'school',
    title: (r) => r.title,
    snippet: (r) => (r.dueDate ? `Due ${r.dueDate}` : ''),
    date: (r) => r.createdAt,
  },
  {
    collection: 'tests',
    type: 'Test',
    mode: 'school',
    title: (r) => r.title,
    snippet: (r) => [r.date ? `On ${r.date}` : '', r.grade != null ? `Grade: ${r.grade}` : ''].filter(Boolean).join(' · '),
    date: (r) => r.createdAt,
  },
  {
    collection: 'health',
    type: 'Health log',
    mode: 'health',
    title: (r) => `${r.category || 'Health'}: ${r.value || ''}`.trim(),
    snippet: (r) => r.note || '',
    date: (r) => r.createdAt || r.date,
  },
  {
    collection: 'finance_accounts',
    type: 'Finance account',
    mode: 'finance',
    title: (r) => r.name,
    snippet: (r) => `$${Number(r.balance || 0).toLocaleString()}`,
    date: (r) => r.createdAt,
  },
  {
    collection: 'finance_transactions',
    type: 'Transaction',
    mode: 'finance',
    title: (r) => r.note || r.category || 'Transaction',
    snippet: (r) => `${r.type === 'debit' ? '-' : '+'}$${Number(r.amount || 0).toLocaleString()}${r.category ? ` · ${r.category}` : ''}`,
    date: (r) => r.date,
  },
  {
    collection: 'trading_positions',
    type: 'Trading position',
    mode: 'finance',
    title: (r) => r.ticker,
    snippet: (r) => r.thesis || '',
    date: (r) => r.createdAt,
  },
  {
    collection: 'trading_watchlist',
    type: 'Watchlist idea',
    mode: 'finance',
    title: (r) => r.ticker,
    snippet: (r) => [r.verdict || '', r.thesis || ''].filter(Boolean).join(' · '),
    date: (r) => r.createdAt,
  },
  {
    collection: 'skills',
    type: 'Skill',
    mode: 'skills',
    title: (r) => r.name,
    snippet: (r) => (r.level ? `Lv. ${r.level}` : ''),
    date: (r) => r.createdAt,
  },
  {
    collection: 'gym_exercises',
    type: 'Gym exercise',
    mode: 'gym',
    title: (r) => r.name,
    snippet: (r) => r.category || '',
    date: (r) => r.createdAt,
  },
  {
    collection: 'gym_routines',
    type: 'Gym routine',
    mode: 'gym',
    title: (r) => r.name,
    snippet: () => '',
    date: (r) => r.createdAt,
  },
  {
    collection: 'gym_day_notes',
    type: 'Gym note',
    mode: 'gym',
    title: (r) => r.date,
    snippet: (r) => r.note || '',
    date: (r) => r.date,
  },
  {
    collection: 'reading_books',
    type: 'Book',
    mode: 'reading',
    title: (r) => r.title,
    snippet: (r) => r.author || '',
    date: (r) => r.createdAt,
  },
  {
    collection: 'mind_habits',
    type: 'Habit',
    mode: 'mind',
    title: (r) => r.name,
    snippet: () => '',
    date: (r) => r.createdAt,
  },
  {
    collection: 'family_members',
    type: 'Family member',
    mode: 'family',
    title: (r) => r.name,
    snippet: (r) => r.relationship || '',
    date: (r) => r.createdAt,
  },
  {
    collection: 'family_log',
    type: 'Family log',
    mode: 'family',
    title: (r) => r.type || 'Check-in',
    snippet: (r) => r.note || '',
    date: (r) => r.date,
  },
  {
    collection: 'sports_sessions',
    type: 'Sports session',
    mode: 'sports',
    title: (r) => r.type || 'Session',
    snippet: (r) => [r.opponent ? `vs ${r.opponent}` : '', r.result || '', r.notes || ''].filter(Boolean).join(' · '),
    date: (r) => r.date,
  },
]

// Case-insensitive substring match against every text field a source
// exposes (title + snippet + a couple of raw fields worth searching that
// aren't shown, like an assignment's classId-independent notes). Simple on
// purpose -- this is a personal single-user app with at most a few hundred
// rows per collection, not a search-index problem.
function matches(record, source, needle) {
  const title = (source.title(record) || '').toString().toLowerCase()
  const snippet = (source.snippet(record) || '').toString().toLowerCase()
  if (title.includes(needle) || snippet.includes(needle)) return true
  // Fall back to a raw scan of every string field on the record, so a match
  // inside a field the display doesn't surface (e.g. a test's raw notes)
  // still gets found -- just displayed via the normal title/snippet above.
  return Object.values(record).some(
    (value) => typeof value === 'string' && value.toLowerCase().includes(needle)
  )
}

router.get('/search', (req, res) => {
  const q = (req.query.q || '').toString().trim()
  if (!q || q.length < 2) {
    return res.json({ results: [], query: q })
  }
  const needle = q.toLowerCase()

  const results = []
  for (const source of SEARCH_SOURCES) {
    let rows
    try {
      rows = loadData(source.collection)
    } catch {
      continue
    }
    if (!Array.isArray(rows)) continue

    for (const record of rows) {
      if (!matches(record, source, needle)) continue
      results.push({
        id: `${source.collection}:${record.id ?? record.date ?? Math.random()}`,
        type: source.type,
        mode: source.mode,
        title: source.title(record) || '(untitled)',
        snippet: source.snippet(record) || '',
        date: source.date(record) || null,
      })
    }
  }

  // Most recent first when a date exists; undated rows sort after dated ones
  // rather than arbitrarily first, so newly-relevant results aren't buried.
  results.sort((a, b) => {
    if (a.date && b.date) return new Date(b.date) - new Date(a.date)
    if (a.date) return -1
    if (b.date) return 1
    return 0
  })

  // Capped, not paginated -- a personal app's search box is for "find the
  // thing I'm thinking of," not browsing hundreds of results. If this ever
  // gets hit routinely, that's a sign to add real relevance ranking, not
  // just a bigger limit.
  res.json({ results: results.slice(0, 60), query: q })
})

export default router
