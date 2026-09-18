// Canvas LMS integration -- unlike Gmail/Drive/Slack/Google Calendar, this
// needs no OAuth app registration, no client ID/secret, and no developer
// console. A student generates their own "personal access token" straight
// from their own Canvas account (Account -> Settings -> "+ New Access
// Token") and pastes it here along with their school's Canvas domain
// (e.g. "myschool.instructure.com"). Self-service, free, zero setup from
// Dylan beyond generating that one token -- confirmed against Canvas's own
// OAuth docs (canvas.instructure.com/doc/api/file.oauth.html) and multiple
// university IT pages describing the same self-service flow.
import { loadData, saveData } from './dataStore.js'

function loadCredentials() {
  const stored = loadData('canvas_credentials', {})
  return stored && stored.domain && stored.token ? stored : null
}

function saveCredentials(domain, token) {
  saveData('canvas_credentials', { domain, token })
}

export function clearCredentials() {
  saveData('canvas_credentials', {})
}

export function isConnected() {
  return Boolean(loadCredentials())
}

function normalizeDomain(domain) {
  return String(domain || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
}

async function canvasFetch(path, override = null) {
  const creds = override || loadCredentials()
  if (!creds) throw new Error('Canvas is not connected')
  const domain = normalizeDomain(creds.domain)
  const res = await fetch(`https://${domain}/api/v1${path}`, {
    headers: { Authorization: `Bearer ${creds.token}` },
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('Canvas rejected that token -- generate a new one in Canvas and reconnect')
    if (res.status === 404) throw new Error('Canvas domain not found -- double check the school domain (e.g. "myschool.instructure.com")')
    throw new Error(`Canvas API error (${res.status})`)
  }
  return res.json()
}

// Validates domain+token against the cheapest authenticated endpoint
// before saving, so a typo'd domain or an expired/revoked token never
// gets stored as if it were good.
export async function verifyAndSaveCredentials(domain, token) {
  const clean = normalizeDomain(domain)
  const cleanToken = String(token || '').trim()
  if (!clean || !cleanToken) throw new Error('Domain and access token are both required')
  const me = await canvasFetch('/users/self', { domain: clean, token: cleanToken })
  saveCredentials(clean, cleanToken)
  return { name: me.name || me.short_name || 'Canvas' }
}

export async function getActiveCourses() {
  const courses = await canvasFetch('/courses?enrollment_state=active&per_page=50')
  return (Array.isArray(courses) ? courses : [])
    .filter((c) => c && c.id && c.name && !c.access_restricted_by_date)
    .map((c) => ({ id: c.id, name: c.name, courseCode: c.course_code || '' }))
}

// planner/items merges assignments, quizzes, and calendar events with due
// dates across every enrolled course in one call -- far simpler than
// hitting /courses/:id/assignments once per class and stitching results
// together ourselves.
export async function getUpcomingAssignments() {
  const startDate = new Date().toISOString()
  const items = await canvasFetch(`/planner/items?start_date=${encodeURIComponent(startDate)}&per_page=50`)
  return (Array.isArray(items) ? items : [])
    .filter((item) => item.plannable_type === 'assignment' && item.plannable?.due_at)
    .map((item) => ({
      id: `canvas-${item.plannable_id}`,
      title: item.plannable.title,
      dueAt: item.plannable.due_at,
      courseId: item.course_id,
      courseName: item.context_name || '',
      url: item.html_url,
      submitted: Boolean(item.submissions?.submitted),
    }))
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
}
