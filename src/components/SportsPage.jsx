import { useState } from 'react'
import { Trophy } from 'lucide-react'
import ModeChatLauncher from './ModeChatLauncher.jsx'
import FootballIcon from './FootballIcon.jsx'
import ModeCalendarMonth, { RecurringEventsManager, formatTimeRange } from './ModeCalendarMonth.jsx'

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

// A single Mon-Sun template can never represent a real season -- games
// get rescheduled, bye weeks happen, extra practices get added. A
// per-date override always wins over that date's normal weekday value;
// see routes/sports.js's own comment for the full reasoning.
function dateWeekdayKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  return WEEKDAY_KEYS[new Date(y, m - 1, d).getDay()]
}

function effectiveScheduleType(schedule, overrides, dateKey) {
  if (overrides && dateKey in overrides) return overrides[dateKey] || null
  return schedule?.[dateWeekdayKey(dateKey)] || null
}

// Compares the last `days` days' effective schedule against what was
// actually logged -- this is the direct answer to "does my schedule
// match reality," instead of the schedule and the log being two
// completely disconnected views of the week.
function scheduleAdherence(schedule, overrides, sessions, days) {
  const rows = []
  for (let i = days - 1; i >= 0; i -= 1) {
    const dateKey = daysAgoKey(i)
    const planned = effectiveScheduleType(schedule, overrides, dateKey)
    const actual = sessions.filter((s) => s.date === dateKey)
    const actualTypes = new Set(actual.map((s) => s.type))
    let status
    if (!planned || planned === 'off') {
      status = actual.length > 0 ? 'extra' : 'match'
    } else if (actualTypes.has(planned)) {
      status = 'match'
    } else if (actual.length > 0) {
      status = 'different'
    } else {
      status = 'missed'
    }
    rows.push({ dateKey, weekdayKey: dateWeekdayKey(dateKey), planned, actual, status })
  }
  return rows
}

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
  const timeLabel =
    session.startTime && session.endTime
      ? formatTimeRange(session.startTime, session.endTime)
      : session.durationMinutes
      ? `${session.durationMinutes} min`
      : ''
  const bits = [timeLabel, session.intensity ? INTENSITY_LABELS[session.intensity] : ''].filter(Boolean)
  return bits.length ? bits.join(', ') : 'Practice'
}

// Shared add/log form for both a practice and a game -- one form, the
// fields that actually matter swap based on which type is selected. Used
// both for quick-logging today's session and for adding any session from
// the Log tab.
function SessionForm({ defaultType = 'practice', defaultDate = todayKey(), saving, addSportsSession, onLogged }) {
  const [type, setType] = useState(defaultType)
  const [date, setDate] = useState(defaultDate)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [intensity, setIntensity] = useState('moderate')
  const [opponent, setOpponent] = useState('')
  const [teamScore, setTeamScore] = useState('')
  const [opponentScore, setOpponentScore] = useState('')
  const [result, setResult] = useState('')
  const [notes, setNotes] = useState('')

  function reset() {
    setStartTime('')
    setEndTime('')
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
      startTime,
      endTime,
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
        <div className="mode-time-range-fields mode-time-range-inline">
          <label>
            Start
            <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
          </label>
          <label>
            End
            <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
          </label>
        </div>

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
            <FootballIcon size={13} strokeWidth={2.25} className="sports-session-icon" />
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

function TodayOverrideControl({ dateKey, scheduledType, overrides, setSportsScheduleOverride }) {
  const [editing, setEditing] = useState(false)
  const hasOverride = dateKey in (overrides || {})

  if (!editing) {
    return (
      <button type="button" className="reading-goal-edit-link" onClick={() => setEditing(true)}>
        {hasOverride ? 'Change (overridden today)' : "Change today's plan"}
      </button>
    )
  }

  return (
    <div className="reading-goal-edit-form">
      <select
        value={scheduledType || ''}
        onChange={(event) => {
          setSportsScheduleOverride(dateKey, event.target.value || null)
          setEditing(false)
        }}
      >
        <option value="">Nothing scheduled</option>
        <option value="practice">Practice</option>
        <option value="game">Game</option>
        <option value="off">Off</option>
      </select>
      {hasOverride && (
        <button
          type="button"
          onClick={() => {
            setSportsScheduleOverride(dateKey, null)
            setEditing(false)
          }}
        >
          Revert to normal
        </button>
      )}
      <button type="button" onClick={() => setEditing(false)}>
        Cancel
      </button>
    </div>
  )
}

function TodayTab({ sportsSchedule, sportsScheduleOverrides, sportsSessions, saving, addSportsSession, setSportsScheduleOverride }) {
  const dateKey = todayKey()
  const todayWeekdayKey = WEEKDAY_KEYS[new Date().getDay()]
  const scheduledType = effectiveScheduleType(sportsSchedule, sportsScheduleOverrides, dateKey)
  const todaysSessions = sportsSessions.filter((s) => s.date === dateKey)

  return (
    <div className="gym-today">
      <div className="gym-today-header">
        <span className="eyebrow">{WEEKDAY_LABELS[todayWeekdayKey]}</span>
        <h2 className="serif">
          {scheduledType ? SCHEDULE_LABELS[scheduledType] || 'Scheduled' : 'Nothing scheduled'}
        </h2>
        <TodayOverrideControl
          dateKey={dateKey}
          scheduledType={scheduledType}
          overrides={sportsScheduleOverrides}
          setSportsScheduleOverride={setSportsScheduleOverride}
        />
      </div>

      <SessionForm
        defaultType={scheduledType === 'game' ? 'game' : 'practice'}
        defaultDate={dateKey}
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

const ADHERENCE_LABELS = {
  match: 'Matched',
  different: 'Different than planned',
  missed: 'Nothing logged',
  extra: 'Logged, unscheduled',
}

// Only the last 7 days' MISMATCHES are worth showing -- a wall of "Monday:
// Matched, Tuesday: Matched..." is noise. This is the direct, concrete
// answer to "does my schedule match reality," instead of the schedule and
// the actual log being two silently disconnected views of the week.
function ScheduleRealityCheck({ sportsSchedule, sportsScheduleOverrides, sportsSessions }) {
  const rows = scheduleAdherence(sportsSchedule, sportsScheduleOverrides, sportsSessions, 7)
  const mismatches = rows.filter((row) => row.status !== 'match')

  return (
    <div className="reality-check">
      <span className="eyebrow">LAST 7 DAYS: SCHEDULE VS. REALITY</span>
      {mismatches.length === 0 ? (
        <p className="reality-check-empty">Every day this week matched what was actually logged.</p>
      ) : (
        <div className="items-list">
          {mismatches.map((row) => (
            <div className="item-card" key={row.dateKey}>
              <div className="item-content">
                <strong>
                  {WEEKDAY_LABELS[row.weekdayKey]} ({row.dateKey})
                </strong>
                <div className="item-meta">
                  <span>
                    Scheduled: {row.planned ? SCHEDULE_LABELS[row.planned] : 'Nothing'} &middot; {ADHERENCE_LABELS[row.status]}
                    {row.actual.length > 0 ? ` (logged: ${row.actual.map((s) => SCHEDULE_LABELS[s.type] || s.type).join(', ')})` : ''}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ScheduleTab({ sportsSchedule, sportsScheduleOverrides, sportsSessions, setSportsScheduleDay }) {
  return (
    <>
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
      <ScheduleRealityCheck
        sportsSchedule={sportsSchedule}
        sportsScheduleOverrides={sportsScheduleOverrides}
        sportsSessions={sportsSessions}
      />
    </>
  )
}

// Sports' own Calendar -- separate from Gym's, and from the main app-wide
// Calendar page. "Planned" comes from the recurring-events list (Tue/Thu
// practice at 3:30-5:30, etc.); "actual" comes from the real logged
// sessions. Showing both together is the same plan-vs-reality idea as
// ScheduleRealityCheck above, just laid out as a real calendar instead of
// a list of mismatches.
function SportsCalendarTab({ sportsRecurringEvents, sportsSessions, saving, addSportsRecurringEvent, deleteSportsRecurringEvent }) {
  function getDayData(dateKey) {
    const weekday = dateWeekdayKey(dateKey)
    const planned = sportsRecurringEvents
      .filter((event) => event.weekdays.includes(weekday))
      .map((event) => ({
        id: event.id,
        label: `${event.label} (${formatTimeRange(event.startTime, event.endTime)})`,
        timeLabel: formatTimeRange(event.startTime, event.endTime),
      }))
    const actual = sportsSessions
      .filter((session) => session.date === dateKey)
      .map((session) => ({
        id: session.id,
        label: summarizeSession(session),
        timeLabel:
          session.startTime && session.endTime
            ? formatTimeRange(session.startTime, session.endTime)
            : SCHEDULE_LABELS[session.type] || session.type,
      }))
    return { planned, actual }
  }

  return (
    <div className="gym-today">
      <ModeCalendarMonth
        getDayData={getDayData}
        legend={
          <>
            <span className="mode-cal-legend-item">
              <span className="mode-cal-swatch swatch-planned" /> Scheduled
            </span>
            <span className="mode-cal-legend-item">
              <span className="mode-cal-swatch swatch-actual" /> Logged
            </span>
            <span className="mode-cal-legend-item">
              <span className="mode-cal-swatch swatch-missed" /> Missed
            </span>
          </>
        }
      />
      <RecurringEventsManager
        title="RECURRING PRACTICES &amp; GAMES"
        events={sportsRecurringEvents}
        saving={saving}
        addEvent={addSportsRecurringEvent}
        deleteEvent={deleteSportsRecurringEvent}
        showType
      />
    </div>
  )
}

export default function SportsPage({
  sportsSessions,
  sportsSchedule,
  sportsScheduleOverrides,
  sportsSettings,
  sportsRecurringEvents,
  saving,
  addSportsSession,
  deleteSportsSession,
  setSportsScheduleDay,
  setSportsScheduleOverride,
  setSportsSport,
  addSportsRecurringEvent,
  deleteSportsRecurringEvent,
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

      <div className="sports-sport-field">
        <label htmlFor="sports-which-sport">Which sport?</label>
        <input
          id="sports-which-sport"
          defaultValue={sportsSettings?.sport || ''}
          placeholder="e.g. Football"
          onBlur={(event) => {
            if (event.target.value.trim() !== (sportsSettings?.sport || '')) {
              setSportsSport(event.target.value.trim())
            }
          }}
        />
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
        <button
          type="button"
          className={activeTab === 'calendar' ? 'active' : ''}
          onClick={() => setActiveTab('calendar')}
        >
          Calendar
        </button>
      </div>

      {activeTab === 'today' && (
        <TodayTab
          sportsSchedule={sportsSchedule}
          sportsScheduleOverrides={sportsScheduleOverrides}
          sportsSessions={sportsSessions}
          saving={saving}
          addSportsSession={addSportsSession}
          setSportsScheduleOverride={setSportsScheduleOverride}
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
        <ScheduleTab
          sportsSchedule={sportsSchedule}
          sportsScheduleOverrides={sportsScheduleOverrides}
          sportsSessions={sportsSessions}
          setSportsScheduleDay={setSportsScheduleDay}
        />
      )}

      {activeTab === 'calendar' && (
        <SportsCalendarTab
          sportsRecurringEvents={sportsRecurringEvents}
          sportsSessions={sportsSessions}
          saving={saving}
          addSportsRecurringEvent={addSportsRecurringEvent}
          deleteSportsRecurringEvent={deleteSportsRecurringEvent}
        />
      )}
    </div>
  )
}
