import { useState } from 'react'
import ModeChatLauncher from './ModeChatLauncher.jsx'

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAgoKey(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Whole calendar days between a bare YYYY-MM-DD key and today, local time
// -- used to turn a raw "Last check-in: 2026-09-02" date (which needs
// mental math to mean anything) into "9 days ago", which is what actually
// tells Dylan whether someone's being neglected.
function daysSince(dateKey) {
  if (!dateKey) return null
  const [y, m, d] = dateKey.split('-').map(Number)
  const then = new Date(y, m - 1, d)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((today - then) / 86400000)
}

function formatDaysSince(days) {
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

// A person not checked in with for this long (or never) is flagged --
// this is the concrete "what actually matters" surfacing Dylan asked for,
// instead of a single combined "5.2H this week" number that hides which
// specific relationship is actually being neglected.
const STALE_DAYS = 10

function minutesForMemberInRange(log, memberId, fromKey, toKey) {
  return log
    .filter((e) => e.type === 'checkin' && e.memberId === memberId && e.date >= fromKey && e.date <= toKey)
    .reduce((sum, e) => sum + (Number(e.minutesSpent) || 0), 0)
}

// Faith practice used to be a bare list of free-text notes with zero
// computed anything -- every other habit-like tracker in this app (Skills,
// Discipline, Health) earned a real streak system; faith got nothing. Same
// local-date-key current/best-streak algorithm as DisciplinePage.jsx,
// duplicated locally per this codebase's established convention.
function faithCurrentStreak(log) {
  const doneDates = new Set(log.filter((e) => e.type === 'faith').map((e) => e.date))
  let streak = 0
  for (let i = 0; ; i += 1) {
    const key = i === 0 ? todayKey() : daysAgoKey(i)
    if (!doneDates.has(key)) break
    streak += 1
  }
  return streak
}

function faithBestStreak(log) {
  const dates = Array.from(new Set(log.filter((e) => e.type === 'faith').map((e) => e.date))).sort()
  if (!dates.length) return 0
  let longest = 1
  let running = 1
  for (let i = 1; i < dates.length; i += 1) {
    const dayDiff = Math.round((new Date(dates[i]) - new Date(dates[i - 1])) / 86400000)
    running = dayDiff === 1 ? running + 1 : 1
    longest = Math.max(longest, running)
  }
  return longest
}

const FAITH_TYPE_LABELS = {
  prayer: 'Prayer',
  scripture: 'Scripture reading',
  church: 'Church / service',
  reflection: 'Reflection',
  other: 'Other',
}

function AddMemberForm({ saving, addFamilyMember }) {
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!name.trim()) return
    await addFamilyMember(name, relationship)
    setName('')
    setRelationship('')
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <label htmlFor="family-name-input">Name</label>
      <input id="family-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mom" />
      <label htmlFor="family-relationship-input">Relationship</label>
      <input
        id="family-relationship-input"
        value={relationship}
        onChange={(e) => setRelationship(e.target.value)}
        placeholder="Optional"
      />
      <button type="submit" disabled={saving || !name.trim()}>
        Add family member
      </button>
    </form>
  )
}

function LogCheckInForm({ members, saving, addFamilyLog }) {
  const [memberId, setMemberId] = useState(members[0]?.id || '')
  const [minutesSpent, setMinutesSpent] = useState('')
  const [note, setNote] = useState('')

  if (members.length === 0) {
    return (
      <div className="empty-state">
        <div>&#128101;</div>
        <h3>No family members added yet</h3>
        <p>Add someone in the People tab first.</p>
      </div>
    )
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!memberId) return
    await addFamilyLog({ type: 'checkin', date: todayKey(), memberId, minutesSpent, note })
    setMinutesSpent('')
    setNote('')
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <label htmlFor="family-member-select">Who</label>
      <select id="family-member-select" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <label htmlFor="family-minutes-input">Minutes together</label>
      <input
        id="family-minutes-input"
        type="number"
        min="0"
        value={minutesSpent}
        onChange={(e) => setMinutesSpent(e.target.value)}
        placeholder="e.g. 30"
      />
      <textarea placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      <button type="submit" disabled={saving}>
        Log check-in
      </button>
    </form>
  )
}

function LogFaithForm({ saving, addFamilyLog }) {
  const [note, setNote] = useState('')
  const [practiceType, setPracticeType] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    await addFamilyLog({ type: 'faith', date: todayKey(), note, practiceType })
    setNote('')
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <label htmlFor="family-faith-type-select">Type (optional)</label>
      <select id="family-faith-type-select" value={practiceType} onChange={(e) => setPracticeType(e.target.value)}>
        <option value="">Not specified</option>
        {Object.entries(FAITH_TYPE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <label htmlFor="family-faith-input">Today's faith practice</label>
      <textarea
        id="family-faith-input"
        placeholder="Prayer, reading, church, reflection -- whatever it was today"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
      />
      <button type="submit" disabled={saving}>
        Log it
      </button>
    </form>
  )
}

function GoalEditor({ weeklyMinutesGoal, saving, setFamilyGoal }) {
  const [editing, setEditing] = useState(false)
  const [hours, setHours] = useState(Math.round((weeklyMinutesGoal / 60) * 10) / 10)

  if (!editing) {
    return (
      <button
        type="button"
        className="reading-goal-edit-link"
        onClick={() => {
          setHours(Math.round((weeklyMinutesGoal / 60) * 10) / 10)
          setEditing(true)
        }}
      >
        Change goal
      </button>
    )
  }

  async function handleSave() {
    const h = Number(hours)
    if (!h || h <= 0) return
    await setFamilyGoal(Math.round(h * 60))
    setEditing(false)
  }

  return (
    <div className="reading-goal-edit-form">
      <input
        type="number"
        min="0.5"
        step="0.5"
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        className="reading-goal-input"
        aria-label="Weekly hours goal"
      />
      <button type="button" disabled={saving} onClick={handleSave}>
        Save
      </button>
      <button type="button" onClick={() => setEditing(false)}>
        Cancel
      </button>
    </div>
  )
}

export default function FamilyPage({
  familyMembers,
  familyLog,
  familyGoals,
  saving,
  addFamilyMember,
  deleteFamilyMember,
  addFamilyLog,
  deleteFamilyLogEntry,
  setFamilyGoal,
  assistantContext,
  openChat,
}) {
  const [activeTab, setActiveTab] = useState('today')
  const memberName = (id) => familyMembers.find((m) => m.id === id)?.name || 'Someone'
  const weeklyMinutesGoal = familyGoals?.weeklyMinutesGoal || 360
  const weekMinutes = familyLog
    .filter((e) => e.type === 'checkin' && e.date >= daysAgoKey(6) && e.date <= todayKey())
    .reduce((sum, e) => sum + (Number(e.minutesSpent) || 0), 0)
  const recentLog = familyLog
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : new Date(b.createdAt) - new Date(a.createdAt)))
    .slice(0, 20)
  const staleMembers = familyMembers.filter((m) => {
    const days = daysSince(m.lastCheckIn)
    return days === null || days >= STALE_DAYS
  })
  const faithCurrent = faithCurrentStreak(familyLog)
  const faithBest = faithBestStreak(familyLog)

  return (
    <div className="page family-page">
      <div className="page-header">
        <div>
          <span className="eyebrow">FAMILY/FAITH MODE</span>
          <h1 className="serif">Family/Faith</h1>
          <p>Check-ins, time together, and whatever faith practice matters to you.</p>
        </div>
      </div>

      <ModeChatLauncher assistantContext={assistantContext} modeKey="family" openChat={openChat} />

      <div className="gym-stats-row">
        <div className="gym-stat-card">
          <span className="gym-stat-label">TIME THIS WEEK</span>
          <span className="gym-stat-value">
            {Math.round((weekMinutes / 60) * 10) / 10}H / {Math.round((weeklyMinutesGoal / 60) * 10) / 10}H
          </span>
          <GoalEditor weeklyMinutesGoal={weeklyMinutesGoal} saving={saving} setFamilyGoal={setFamilyGoal} />
        </div>
      </div>

      <div className="gym-tabs">
        <button type="button" className={activeTab === 'today' ? 'active' : ''} onClick={() => setActiveTab('today')}>
          Today
        </button>
        <button type="button" className={activeTab === 'people' ? 'active' : ''} onClick={() => setActiveTab('people')}>
          People
        </button>
        <button type="button" className={activeTab === 'faith' ? 'active' : ''} onClick={() => setActiveTab('faith')}>
          Faith
        </button>
      </div>

      {activeTab === 'today' && (
        <>
          {staleMembers.length > 0 && (
            <div className="family-attention-banner">
              <strong>Haven't checked in with:</strong>
              <span>
                {staleMembers
                  .map((m) => (m.lastCheckIn ? `${m.name} (${formatDaysSince(daysSince(m.lastCheckIn))})` : `${m.name} (never)`))
                  .join(', ')}
              </span>
            </div>
          )}
          <LogCheckInForm members={familyMembers} saving={saving} addFamilyLog={addFamilyLog} />
          <div className="items-list">
            {recentLog.length === 0 && (
              <div className="empty-state">
                <div>&#128172;</div>
                <h3>Nothing logged yet</h3>
                <p>Log a check-in above to get started.</p>
              </div>
            )}
            {recentLog.map((entry) => (
              <div className="item-card" key={entry.id}>
                <div className="item-content">
                  <strong>
                    {entry.date}: {entry.type === 'checkin' ? `Time with ${memberName(entry.memberId)}` : 'Faith practice'}
                    {entry.type === 'checkin' && entry.minutesSpent ? ` (${entry.minutesSpent} min)` : ''}
                  </strong>
                  {entry.type === 'faith' && entry.practiceType && (
                    <span className="reading-genre-chip">{FAITH_TYPE_LABELS[entry.practiceType] || entry.practiceType}</span>
                  )}
                  {entry.note && (
                    <div className="item-meta">
                      <span>{entry.note}</span>
                    </div>
                  )}
                </div>
                <button className="delete-button" onClick={() => deleteFamilyLogEntry(entry.id)}>
                  &times;
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === 'people' && (
        <>
          <AddMemberForm saving={saving} addFamilyMember={addFamilyMember} />
          <div className="items-list">
            {familyMembers.length === 0 && (
              <div className="empty-state">
                <div>&#128101;</div>
                <h3>No family added</h3>
                <p>Add your first family member above.</p>
              </div>
            )}
            {familyMembers.map((member) => {
              const days = daysSince(member.lastCheckIn)
              const stale = days === null || days >= STALE_DAYS
              const memberMinutes = minutesForMemberInRange(familyLog, member.id, daysAgoKey(6), todayKey())
              return (
                <div className="item-card" key={member.id}>
                  <div className="item-content">
                    <strong>{member.name}</strong>
                    {member.relationship && (
                      <div className="item-meta">
                        <span>{member.relationship}</span>
                      </div>
                    )}
                    <div className="item-meta">
                      <span className={stale ? 'family-stale' : undefined}>
                        {member.lastCheckIn ? `Last check-in: ${formatDaysSince(days)}` : 'No check-ins logged yet'}
                      </span>
                      <span>{memberMinutes} min this week</span>
                    </div>
                  </div>
                  <button className="delete-button" onClick={() => deleteFamilyMember(member.id)} aria-label={`Remove ${member.name}`}>
                    &times;
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}

      {activeTab === 'faith' && (
        <>
          <div className="gym-stats-row">
            <div className="gym-stat-card">
              <span className="gym-stat-label">CURRENT STREAK</span>
              <span className="gym-stat-value">
                {faithCurrent} day{faithCurrent === 1 ? '' : 's'}
              </span>
            </div>
            <div className="gym-stat-card">
              <span className="gym-stat-label">BEST STREAK</span>
              <span className="gym-stat-value">
                {faithBest} day{faithBest === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          <LogFaithForm saving={saving} addFamilyLog={addFamilyLog} />
          <div className="items-list">
            {familyLog.filter((e) => e.type === 'faith').length === 0 && (
              <div className="empty-state">
                <div>&#128591;</div>
                <h3>Nothing logged yet</h3>
                <p>Log today's faith practice above.</p>
              </div>
            )}
            {familyLog
              .filter((e) => e.type === 'faith')
              .slice()
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .map((entry) => (
                <div className="item-card" key={entry.id}>
                  <div className="item-content">
                    <strong>{entry.date}</strong>
                    {entry.practiceType && (
                      <span className="reading-genre-chip">{FAITH_TYPE_LABELS[entry.practiceType] || entry.practiceType}</span>
                    )}
                    {entry.note && (
                      <div className="item-meta">
                        <span>{entry.note}</span>
                      </div>
                    )}
                  </div>
                  <button className="delete-button" onClick={() => deleteFamilyLogEntry(entry.id)}>
                    &times;
                  </button>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  )
}
