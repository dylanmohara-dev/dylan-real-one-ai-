// Dylan AI — baseline smoke test (Phase 0 safety net).
//
// Purpose: prove the CURRENT app works BEFORE dataStore.js is changed, so any
// Phase 0 regression is detectable. This file is deliberately:
//   - dependency-free: only Node's built-in node:test + node:assert + global fetch
//     (no packages installed, nothing added to package.json).
//   - READ-ONLY: it only issues GET requests. No POST/PUT/PATCH/DELETE, so it
//     never writes app data or touches data/*.json.
//   - against the already-running local server (default http://localhost:3001).
//
// Run with:
//   cd /Users/dylan/dylan-ai/app && node --test tests/
//
// Point it elsewhere if needed:
//   DYLAN_AI_BASE_URL=http://localhost:3001 node --test tests/

import { test } from 'node:test'
import assert from 'node:assert/strict'

const BASE_URL = process.env.DYLAN_AI_BASE_URL || 'http://localhost:3001'
const REQUEST_TIMEOUT_MS = 10000

// The exact 24 top-level keys /api/bootstrap returns after availability support
// (routes/bootstrap.js). Recorded so a Phase 0 change that alters the
// response shape shows up as a failure instead of passing silently.
const EXPECTED_BOOTSTRAP_KEYS = [
  'heroImages',
  'workAvailability',
  'tasks',
  'goals',
  'notes',
  'memories',
  'classes',
  'assignments',
  'tests',
  'health',
  'finance',
  'skills',
  'skillsMeta',
  'gym',
  'sports',
  'reading',
  'mind',
  'family',
  'trading',
  'financeJournal',
  'financePsychology',
  'player',
  'schoolProgress',
  'canvasCompletions',
]

// Core read-only endpoints, one per life mode / feature area. Every one is a
// plain GET with no side effects.
const CORE_ENDPOINTS = [
  '/api/tasks',
  '/api/goals',
  '/api/notes',
  '/api/memories',
  '/api/classes',
  '/api/assignments',
  '/api/tests',
  '/api/trash',
  '/api/skills',
  '/api/gym/exercises',
  '/api/gym/sessions',
  '/api/sports/sessions',
  '/api/reading/books',
  '/api/mind/habits',
  '/api/family/members',
  '/api/health',
  '/api/finance',
  '/api/trading',
  '/api/player',
  '/api/school-progress',
  '/api/canvas-completions',
  '/api/hero-images',
  '/api/search?q=a',
  '/api/notifications/preferences',
  '/api/notifications/subscriptions',
  '/api/calendar/status',
  '/api/settings/api-keys',
]

async function get(path) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(`${BASE_URL}${path}`, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

test('GET /api/bootstrap returns HTTP 200 with the expected 24 top-level keys', async () => {
  const res = await get('/api/bootstrap')
  assert.equal(res.status, 200, `expected 200 from /api/bootstrap, got ${res.status}`)

  const body = await res.json()

  for (const key of EXPECTED_BOOTSTRAP_KEYS) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(body, key),
      `/api/bootstrap is missing expected key: ${key}`
    )
  }

  assert.equal(
    Object.keys(body).length,
    EXPECTED_BOOTSTRAP_KEYS.length,
    `/api/bootstrap key count changed (expected ${EXPECTED_BOOTSTRAP_KEYS.length})`
  )
})

for (const path of CORE_ENDPOINTS) {
  test(`GET ${path} returns HTTP 200`, async () => {
    const res = await get(path)
    assert.equal(res.status, 200, `expected 200 from ${path}, got ${res.status}`)
  })
}
