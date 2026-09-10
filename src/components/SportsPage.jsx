import { useState } from 'react'
import { Volleyball, Trophy } from 'lucide-react'
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

// Date.getDay(): 0 = Sunday .. 6 = Saturday. Only used to find "today" in
// WEEKDAY_ORDER below -- display order is always Monday-first regardless.
const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const WEEKDAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const WEEKDAY_LABELS = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}
const SCHEDULE_LABELS = { practice: 'Practice', game: 'Game', off: 'Off' }
const INTENSITY_LABELS = { light: 'Light', moderate: 'Moderate', hard: 'Hard' }
const RESULT_LABELS = { win: 'Win', loss: 'Loss', tie: 'Tie' }

function sortSessionsRecentFirst(sessions) {
  return sessions
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : new Date(b.createdAt) - new Date(a.createdAt)))
}

function summarizeSession(session) {
  if (session.type === 'game') {
    const scoreLine =
      session.teamScore !== null && session.teamScore !== undefined && session.opponentScore !== null && session.opponentScore !== undefined
        ? `${session.teamScore}-${session.opponentScore}`
        : ''
    const bits = [session.opponent || 'Game', scoreLine, RESULT_LABELS[session.result] || '']
      .filter(Boolean)
      .join(' — ')
    return bits || 'Game'
  }
  const bits = [
    session.durationMinutes ? `${session.durationMinutes} min` : '',
    session.intensity ? INTENSITY_LABELS[session.intensity] : '',
  ].filter(Boolean)
  return bits.length ? bits.join(', ') : 'Practice'
}

// Shared add/log form for both a practice and a game -- one form, the
// fields that actually matter swap based on which type is selected. Used
// both for quick-logging today's session and for adding any session from
// the Log tab.
function SessionForm({ defaultType = 'practice', defaultDate = todayKey(), saving, addSportsSession, onLogged }) {
  const [type, setType] = useState(defaultType)
  const [date, setDate] = useState(defaultDate)
  const [durationMinutes, setDurationMinutes] = useState('')
  const [intensity, setIntensity] = useState('moderate')
  const [opponent, setOpponent] = useState('')
  const [teamScore, setTeamScore] = useState('')
  const [opponentScore, setOpponentScore] = useState('')
  const [result, setResult] = useState('')
  const [notes, setNotes] = useState('')

  function reset() {
    setDurationMinutes('')
    setOpponent('')
    setTeamScore('')
    setOpponentScore('')
    setResult('')
    setNotes('')
  }

  async function handleSubmit() {
    await addSportsSession({
      date,
      type,
      durationMinutes,
      intensity,
      opponent,
      teamScore,
      opponentScore,
      result,
      notes,
    })
    reset()
    onLogged?.()
  }

  return (
    <div className="form-card sports-session-form">
      <div className="sports-session-form-header">
        <div className="sports-type-toggle">
          <button type="button" className={type === 'practice' ? 'active' : ''} onClick={() => setType('practice')}>
            Practice
          </button>
          <button type="button" className={type === 'game' ? 'active' : ''} onClick={() => setType('game')}>
            Game
          </button>
        </div>
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </div>

      <div className="sports-session-form-fields">
        <input
          type="number"
          min="0"
          placeholder="Duration (minutes)"
          value={durationMinutes}
          onChange={(event) => setDurationMinutes(event.target.value)}
        />

        {type === 'practice' ? (
          <select value={intensity} onChange={(event) => setIntensity(event.target.value)}>
            <option value="light">Light</option>
            <option value="moderate">Moderate</option>
            <option value="hard">Hard</option>
          </select>
        ) : (
          <>
            <input
              placeholder="Opponent"
              value={opponent}
              onChange={(event) => setOpponent(event.target.value)}
            />
            <input
              type="number"
              placeholder="Your score"
              value={teamScore}
              onChange={(event) => setTeamScore(event.target.value)}
            />
            <input
              type="number"
              placeholder="Their score"
              value={opponentScore}
              onChange={(event) => setOpponentScore(event.target.value)}
            />
            {(teamScore === '' || opponentScore === '') && (
              <select value={result} onChange={(event) => setResult(event.target.value)}>
                <option value="">Result (if no score)</option>
                <option value="win">Win</option>
                <option value="loss">Loss</option>
                <option value="tie">Tie</option>
              </select>
            )}
          </>
        )}
      </div>

      <textarea
        placeholder="Notes / film review -- what worked, what to fix, coach feedback"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={2}
      />

      <button onClick={handleSubmit} disabled={saving}>
        Log {type === 'game' ? 'game' : 'practice'}
      </button>
    </div>
  )
}

function SessionCard({ session, deleteSportsSession }) {
  return (
    <div className="item-card" key={session.id}>
      <div className="item-content">
        <strong>
          {session.type === 'game' ? (
            <Trophy size={13} strokeWidth={2.25} className="sports-session-icon" />
          ) : (
            <Volleyball size={13} strokeWidth={2.25} className="sports-session-icon" />
          )}
          {session.date}: {summarizeSession(session)}
        </strong>
        {session.notes && (
          <div className="item-meta">
            <span>{session.notes}</span>
          </div>
        )}
      </div>
      {deleteSportsSession && (
        <button className="delete-button" onClick={() => deleteSportsSession(session.id)}>
          &times;
        </button>
      )}
    </div>
  )
}

function TodayTab({ sportsSchedule, sportsSessions, saving, addSportsSession }) {
  const todayWeekdayKey = WEEKDAY_KEYS[new Date().getDay()]
  const scheduledType = sportsSchedule?.[todayWeekdayKey] || null
  const todaysSessions = sportsSessions.filter((s) => s.date === todayKey())

  return (
    <div className="gym-today">
      <div className="gym-today-header">
        <span className="eyebrow">{WEEKDAY_LABELS[todayWeekdayKey]}</span>
        <h2 className="serif">
          {scheduledType ? SCHEDULE_LABELS[scheduledType] || 'Scheduled' : 'Nothing scheduled'}
        </h2>
      </div>

      <SessionForm
        defaultType={scheduledType === 'game' ? 'game' : 'practice'}
        defaultDate={todayKey()}
        saving={saving}
        addSportsSession={addSportsSession}
      />

      {todaysSessions.length > 0 && (
        <div className="items-list">
          {todaysSessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  )
}

function LogTab({ sportsSessions, saving, addSportsSession, deleteSportsSession }) {
  const sorted = sortSessionsRecentFirst(sportsSessions)

  return (
    <div className="gym-today">
      <SessionForm saving={saving} addSportsSession={addSportsSession} />

      <div className="items-list">
        {sorted.length ? (
          sorted.map((session) => (
            <SessionCard key={session.id} session={session} deleteSportsSession={deleteSportsSession} />
          ))
        ) : (
          <div className="empty-state">
            <div>&#127943;</div>
            <h3>No sessions logged yet</h3>
            <p>Log your first practice or game above.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ScheduleTab({ sportsSchedule, setSportsScheduleDay }) {
  return (
    <div className="gym-week-plan">
      <span className="eyebrow">WEEKLY SCHEDULE</span>
      {WEEKDAY_ORDER.map((day) => (
        <div className="gym-week-plan-row" key={day}>
          <span className="gym-week-plan-day">{WEEKDAY_LABELS[day]}</span>
          <select
            value={sportsSchedule?.[day] || ''}
            onChange={(event) => setSportsScheduleDay(day, event.target.value || null)}
          >
            <option value="">Not set</option>
            <option value="practice">Practice</option>
            <option value="game">Game</option>
            <option value="off">Off</option>
          </select>
        </div>
      ))}
    </div>
  )
}

export default function SportsPage({
  sportsSessions,
  sportsSchedule,
  saving,
  addSportsSession,
  deleteSportsSession,
  setSportsScheduleDay,
  assistantContext,
  openChat,
}) {
  const [activeTab, setActiveTab] = useState('today')

  const sessionsThisWeek = sportsSessions.filter((s) => s.date >= daysAgoKey(6) && s.date <= todayKey()).length
  const games = sportsSessions.filter((s) => s.type === 'game' && s.result)
  const wins = games.filter((g) => g.result === 'win').length
  const losses = games.filter((g) => g.result === 'loss').length
  const ties = games.filter((g) => g.result === 'tie').length

  return (
    <div className="page sports-page">
      <div className="page-header">
        <div>
          <span className="eyebrow">SPORTS MODE</span>
          <h1 className="serif">Sports</h1>
          <p>Practices, games, and film -- schedule your week once, then log as you go.</p>
        </div>
      </div>

      <ModeChatLauncher assistantContext={assistantContext} modeKey="sports" openChat={openChat} />

      <div className="gym-stats-row">
        <div className="gym-stat-card">
          <span className="gym-stat-label">THIS WEEK</span>
          <span className="gym-stat-value">
            {sessionsThisWeek} {sessionsThisWeek === 1 ? 'session' : 'sessions'}
          </span>
        </div>
        <div className="gym-stat-card">
          <span className="gym-stat-label">RECORD</span>
          <span className="gym-stat-value">
            {wins}-{losses}{ties ? `-${ties}` : ''}
          </span>
        </div>
      </div>

      <div className="gym-tabs">
        <button type="button" className={activeTab === 'today' ? 'active' : ''} onClick={() => setActiveTab('today')}>
          Today
        </button>
        <button type="button" className={activeTab === 'log' ? 'active' : ''} onClick={() => setActiveTab('log')}>
          Log
        </button>
        <button
          type="button"
          className={activeTab === 'schedule' ? 'active' : ''}
          onClick={() => setActiveTab('schedule')}
        >
          Schedule
        </button>
      </div>

      {activeTab === 'today' && (
        <TodayTab
          sportsSchedule={sportsSchedule}
          sportsSessions={sportsSessions}
          saving={saving}
          addSportsSession={addSportsSession}
        />
      )}

      {activeTab === 'log' && (
        <LogTab
          sportsSessions={sportsSessions}
          saving={saving}
          addSportsSession={addSportsSession}
          deleteSportsSession={deleteSportsSession}
        />
      )}

      {activeTab === 'schedule' && (
        <ScheduleTab sportsSchedule={sportsSchedule} setSportsScheduleDay={setSportsScheduleDay} />
      )}
    </div>
  )
}
