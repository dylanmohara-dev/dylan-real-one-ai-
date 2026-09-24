import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Snowflake } from 'lucide-react'
import ModeChatLauncher from './ModeChatLauncher.jsx'
import HeroPhotoButton from './HeroPhotoButton.jsx'

// Mirrors routes/mind.js's computeSkillLevel exactly -- mindSkillXp from
// bootstrap is raw XP totals per skill ({focus: 40, ...}), not pre-computed
// level info, so the same accelerating curve (Level N needs 50*N XP) is
// duplicated here rather than adding a frontend/backend shared-module story
// for one small formula, matching this project's existing convention
// (routes/mind.js already duplicates routes/skills.js's version the same way).
function computeSkillLevel(xp) {
  let level = 1
  let required = 50
  let remaining = Number(xp) || 0
  while (remaining >= required) {
    remaining -= required
    level += 1
    required = 50 * level
  }
  return { level, xpIntoLevel: remaining, xpForNextLevel: required }
}

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAgoKey(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// A habit's current streak: consecutive days (counting back from today)
// that have a completion row. Stops at the first gap -- a habit done
// today, yesterday, and three days ago (missed one day) has a streak of 2,
// not 3, since the gap breaks it.
function currentStreak(completions, habitId) {
  const doneDates = new Set(completions.filter((c) => c.habitId === habitId).map((c) => c.date))
  let streak = 0
  for (let i = 0; ; i += 1) {
    const key = i === 0 ? todayKey() : daysAgoKey(i)
    if (!doneDates.has(key)) break
    streak += 1
  }
  return streak
}

// Same algorithm as routes/skills.js's computeMaxStreak() and
// StatsOverlay.jsx's longestStreakFromDateKeys() -- duplicated locally per
// this codebase's established convention rather than imported. Kept
// separate from currentStreak() so a badge-worthy run stays visible as
// "Best: N days" even after today breaks it -- this is the persistent,
// always-on target Dylan asked for instead of a number buried in a
// separate Stats overlay he has to go open.
function longestDailyStreak(completions, habitId) {
  const dates = Array.from(new Set(completions.filter((c) => c.habitId === habitId).map((c) => c.date))).sort()
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

// Monday-anchored week key (the Monday of the week a given date falls in)
// -- every weekly-cadence computation below measures "this week" against
// this same anchor, so a habit checked off Sunday and Monday of the same
// calendar week both count toward one week's target, not two.
function weekStartKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const day = date.getDay() // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diffToMonday)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function shiftWeek(weekKey, deltaWeeks) {
  const [y, m, d] = weekKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + deltaWeeks * 7)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function completionsInWeek(completions, habitId, weekKey) {
  return completions.filter((c) => c.habitId === habitId && weekStartKey(c.date) === weekKey).length
}

// The weekly-cadence equivalent of currentStreak(): consecutive weeks
// (counting back from the current week) that met timesPerWeek. The
// in-progress current week only counts once it has already hit target --
// it isn't a miss yet, it's just not finished, so it's skipped rather
// than breaking the streak while today is still happening.
function currentWeeklyStreak(completions, habitId, timesPerWeek) {
  let cursor = weekStartKey(todayKey())
  if (completionsInWeek(completions, habitId, cursor) < timesPerWeek) {
    cursor = shiftWeek(cursor, -1)
  }
  let streak = 0
  while (completionsInWeek(completions, habitId, cursor) >= timesPerWeek) {
    streak += 1
    cursor = shiftWeek(cursor, -1)
  }
  return streak
}

function longestWeeklyStreak(completions, habitId, timesPerWeek) {
  const byWeek = {}
  for (const c of completions) {
    if (c.habitId !== habitId) continue
    const wk = weekStartKey(c.date)
    byWeek[wk] = (byWeek[wk] || 0) + 1
  }
  const metWeeks = Object.keys(byWeek)
    .filter((wk) => byWeek[wk] >= timesPerWeek)
    .sort()
  if (!metWeeks.length) return 0
  let longest = 1
  let running = 1
  for (let i = 1; i < metWeeks.length; i += 1) {
    const weekDiff = Math.round((new Date(metWeeks[i]) - new Date(metWeeks[i - 1])) / (7 * 86400000))
    running = weekDiff === 1 ? running + 1 : 1
    longest = Math.max(longest, running)
  }
  return longest
}

function habitStats(habit, completions) {
  if (habit.frequency === 'weekly') {
    const target = habit.timesPerWeek || 3
    return {
      cadence: 'weekly',
      target,
      countThisWeek: completionsInWeek(completions, habit.id, weekStartKey(todayKey())),
      current: currentWeeklyStreak(completions, habit.id, target),
      best: longestWeeklyStreak(completions, habit.id, target),
    }
  }
  return {
    cadence: 'daily',
    current: currentStreak(completions, habit.id),
    best: longestDailyStreak(completions, habit.id),
  }
}

function HabitStatsLine({ stats }) {
  if (stats.cadence === 'weekly') {
    return (
      <div className="item-meta mind-stats-line">
        <span>
          {stats.countThisWeek} / {stats.target} this week
        </span>
        {stats.current > 0 && <span>{stats.current} week streak</span>}
        <span className="mind-best">
          Best: {stats.best} week{stats.best === 1 ? '' : 's'}
        </span>
      </div>
    )
  }
  return (
    <div className="item-meta mind-stats-line">
      {stats.current > 0 && <span>{stats.current} day streak</span>}
      <span className="mind-best">
        Best: {stats.best} day{stats.best === 1 ? '' : 's'}
      </span>
    </div>
  )
}

function AddHabitForm({ saving, addHabit }) {
  const [name, setName] = useState('')
  const [frequency, setFrequency] = useState('daily')
  const [timesPerWeek, setTimesPerWeek] = useState(3)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!name.trim()) return
    await addHabit(
      name,
      frequency === 'weekly' ? { frequency: 'weekly', timesPerWeek: Number(timesPerWeek) || 3 } : { frequency: 'daily' }
    )
    setName('')
    setFrequency('daily')
    setTimesPerWeek(3)
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <label htmlFor="mind-habit-input">New habit</label>
      <input
        id="mind-habit-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. No phone before 9am"
      />
      <label htmlFor="mind-frequency-select">How often</label>
      <select id="mind-frequency-select" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
        <option value="daily">Every day</option>
        <option value="weekly">A set number of times per week</option>
      </select>
      {frequency === 'weekly' && (
        <>
          <label htmlFor="mind-times-input">Times per week</label>
          <input
            id="mind-times-input"
            type="number"
            min="2"
            max="6"
            value={timesPerWeek}
            onChange={(e) => setTimesPerWeek(e.target.value)}
          />
        </>
      )}
      <button type="submit" disabled={saving || !name.trim()}>
        Add habit
      </button>
    </form>
  )
}

function FrequencyEditor({ habit, saving, updateMindHabit }) {
  const isWeekly = habit.frequency === 'weekly'
  return (
    <div className="mind-frequency-editor">
      <select
        className="category-select"
        value={isWeekly ? 'weekly' : 'daily'}
        disabled={saving}
        onChange={(e) => {
          if (e.target.value === 'weekly') {
            updateMindHabit(habit.id, { frequency: 'weekly', timesPerWeek: habit.timesPerWeek || 3 })
          } else {
            updateMindHabit(habit.id, { frequency: 'daily' })
          }
        }}
      >
        <option value="daily">Every day</option>
        <option value="weekly">Times/week</option>
      </select>
      {isWeekly && (
        <select
          className="category-select"
          value={habit.timesPerWeek || 3}
          disabled={saving}
          onChange={(e) => updateMindHabit(habit.id, { timesPerWeek: Number(e.target.value) })}
        >
          {[2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n}x/week
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

const SKILL_LABELS = {
  focus: 'Focus',
  awareness: 'Awareness',
  discipline: 'Discipline',
  impulseControl: 'Impulse Control',
  decisionMaking: 'Decision-Making',
}

function SkillBar({ label, skill }) {
  const pct = skill.xpForNextLevel ? Math.round((skill.xpIntoLevel / skill.xpForNextLevel) * 100) : 0
  return (
    <div className="item-card">
      <div className="item-content">
        <div className="mind-checkbox-row">
          <strong>{label}</strong>
          <span className="skill-card-level">Level {skill.level}</span>
        </div>
        <div className="skill-xp-bar">
          <div className="skill-xp-bar-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
        </div>
        <span className="item-meta">
          {skill.xpIntoLevel} / {skill.xpForNextLevel} XP to level {skill.level + 1}
        </span>
      </div>
    </div>
  )
}

function MorningReviewForm({ saving, addMindReview, todayReview }) {
  const [intention, setIntention] = useState('')
  const [mindset, setMindset] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!intention.trim()) return
    await addMindReview('morning', { intention: intention.trim(), mindset: mindset.trim() })
    setIntention('')
    setMindset('')
  }

  if (todayReview) {
    return (
      <div className="item-card">
        <div className="item-content">
          <strong>Today's intention</strong>
          <p>{todayReview.intention}</p>
          {todayReview.mindset && <p className="item-meta">Feeling: {todayReview.mindset}</p>}
        </div>
      </div>
    )
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <label htmlFor="mind-morning-intention">What's your intention for today?</label>
      <input
        id="mind-morning-intention"
        value={intention}
        onChange={(e) => setIntention(e.target.value)}
        placeholder="e.g. Finish the proposal before anything else"
      />
      <label htmlFor="mind-morning-mindset">How do you feel right now? (optional)</label>
      <input
        id="mind-morning-mindset"
        value={mindset}
        onChange={(e) => setMindset(e.target.value)}
        placeholder="e.g. focused, anxious, tired"
      />
      <button type="submit" disabled={saving || !intention.trim()}>
        Save morning check-in
      </button>
    </form>
  )
}

function NightReviewForm({ saving, addMindReview, todayReview }) {
  const [wins, setWins] = useState('')
  const [friction, setFriction] = useState('')
  const [lesson, setLesson] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!wins.trim() && !friction.trim() && !lesson.trim()) return
    await addMindReview('night', { wins: wins.trim(), friction: friction.trim(), lesson: lesson.trim() })
    setWins('')
    setFriction('')
    setLesson('')
  }

  if (todayReview) {
    return (
      <div className="item-card">
        <div className="item-content">
          {todayReview.wins && (
            <p>
              <strong>Went well:</strong> {todayReview.wins}
            </p>
          )}
          {todayReview.friction && (
            <p>
              <strong>Didn't:</strong> {todayReview.friction}
            </p>
          )}
          {todayReview.lesson && (
            <p>
              <strong>Lesson:</strong> {todayReview.lesson}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <label htmlFor="mind-night-wins">What went well today?</label>
      <input id="mind-night-wins" value={wins} onChange={(e) => setWins(e.target.value)} placeholder="Be specific" />
      <label htmlFor="mind-night-friction">What didn't?</label>
      <input
        id="mind-night-friction"
        value={friction}
        onChange={(e) => setFriction(e.target.value)}
        placeholder="Name it plainly"
      />
      <label htmlFor="mind-night-lesson">One lesson for tomorrow</label>
      <input
        id="mind-night-lesson"
        value={lesson}
        onChange={(e) => setLesson(e.target.value)}
        placeholder="What would you do differently?"
      />
      <button type="submit" disabled={saving || (!wins.trim() && !friction.trim() && !lesson.trim())}>
        Save night review
      </button>
    </form>
  )
}

function DecisionCard({ item, saving, updateMindDecision }) {
  const [note, setNote] = useState(item.outcomeNote || '')
  const decisionLabel = { proceed: 'Proceeded anyway', wait: 'Chose to wait', different: 'Did something different' }[item.decision] || item.decision

  return (
    <div className="item-card">
      <div className="item-content">
        <strong>{item.situation}</strong>
        {item.why && <p className="item-meta">Why: {item.why}</p>}
        {item.perspective && <p className="item-meta">Outside view: {item.perspective}</p>}
        <span className="mind-best">{decisionLabel}</span>
        <label htmlFor={`mind-outcome-${item.id}`}>How'd it turn out? (optional)</label>
        <input
          id={`mind-outcome-${item.id}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            if (note !== (item.outcomeNote || '')) updateMindDecision(item.id, { outcomeNote: note })
          }}
          disabled={saving}
          placeholder="Add later once you know"
        />
      </div>
    </div>
  )
}

// --- Session 37 redesign: a big focal "orb" instead of a flat number ---
// Headspace/Calm's whole visual language is one calm, breathing shape
// that IS the screen, not a stat sitting next to a list -- this is Mind's
// version of that. The ring is today's habit-completion percentage (real
// data, updates live); the glow intensity beneath it is driven by average
// skill level, so "doubling as the skill-XP display" is literal, not just
// a caption -- a higher average level makes the whole orb glow harder.
function TodayOrb({ doneCount, totalCount, skills, urgent }) {
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0
  const avgLevel = skills.length ? skills.reduce((sum, s) => sum + s.level, 0) / skills.length : 1
  const radius = 84
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - pct / 100)
  const glow = Math.max(0.25, Math.min(1, avgLevel / 8))
  const remaining = Math.max(0, totalCount - doneCount)

  return (
    <div className="mind-orb-wrap">
      <div className={`mind-orb ${urgent ? 'urgent' : ''}`} style={{ '--mind-orb-glow': glow }}>
        <svg viewBox="0 0 200 200" className="mind-orb-ring">
          <circle cx="100" cy="100" r={radius} className="mind-orb-ring-track" />
          <circle
            cx="100"
            cy="100"
            r={radius}
            className="mind-orb-ring-fill"
            style={{ strokeDasharray: circumference, strokeDashoffset: dashOffset }}
          />
        </svg>
        <div className="mind-orb-core">
          <strong>{pct}%</strong>
          <span>
            {doneCount} / {totalCount} today
          </span>
        </div>
      </div>
      {urgent ? (
        <span className="mind-orb-urgent-note">{remaining} left, and today's running out</span>
      ) : (
        <span className="mind-orb-level">Avg skill level {avgLevel.toFixed(1)}</span>
      )}
    </div>
  )
}

// --- Session 37 redesign: Pause & Choose as a full-screen, one-question-
// at-a-time flow (Day One's entry screen was the reference) instead of a
// form sitting in the middle of a tab -- the whole point of this tool is
// making Dylan actually stop and slow down before an impulsive decision,
// and a form field he can skim past in two seconds defeats that. Forcing
// one question onto the whole screen at a time is what makes "pause"
// literal instead of just a label. Same addMindDecision call/shape as the
// old inline DecisionForm -- nothing about the data changed, only how
// it's collected.
function PauseChooseOverlay({ onClose, saving, addMindDecision, decisionCount }) {
  const [step, setStep] = useState(0)
  const [situation, setSituation] = useState('')
  const [why, setWhy] = useState('')
  const [perspective, setPerspective] = useState('')
  const [decision, setDecision] = useState('proceed')
  const [saved, setSaved] = useState(false)

  const QUESTIONS = [
    {
      key: 'situation',
      prompt: 'What are you about to do?',
      placeholder: 'e.g. Text my ex back at 1am',
      value: situation,
      onChange: setSituation,
    },
    {
      key: 'why',
      prompt: 'Why, really?',
      placeholder: "The honest reason, not the story you'd tell someone else",
      value: why,
      onChange: setWhy,
    },
    {
      key: 'perspective',
      prompt: 'What would you tell a friend doing this?',
      placeholder: 'Step outside it for a second',
      value: perspective,
      onChange: setPerspective,
    },
  ]

  const totalSteps = QUESTIONS.length + 1
  const current = QUESTIONS[step]

  async function handleFinish() {
    await addMindDecision({
      situation: situation.trim(),
      why: why.trim(),
      perspective: perspective.trim(),
      decision,
    })
    setSaved(true)
  }

  const canAdvance = step === 0 ? situation.trim().length > 0 : true

  return (
    <div className="mind-pause-overlay" role="dialog" aria-modal="true" aria-label="Pause and choose">
      <button type="button" className="mind-pause-close" onClick={onClose} aria-label="Close">
        &times;
      </button>

      {saved ? (
        <div className="mind-pause-done">
          <div className="mind-pause-done-icon">&#10003;</div>
          <h2>Logged.</h2>
          <p className="mind-pause-done-count">
            Decision #{decisionCount} you've paused on instead of just reacting.
          </p>
          <p>You can add how it turned out later, from the Pause &amp; Choose history.</p>
          <button type="button" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <div className="mind-pause-card">
          <div className="mind-pause-progress">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <span key={i} className={`mind-pause-dot ${i <= step ? 'filled' : ''}`} />
            ))}
          </div>

          {step < QUESTIONS.length ? (
            <div className="mind-pause-question" key={current.key}>
              <h2>{current.prompt}</h2>
              <textarea
                autoFocus
                value={current.value}
                onChange={(e) => current.onChange(e.target.value)}
                placeholder={current.placeholder}
                rows={3}
              />
              <div className="mind-pause-actions">
                {step > 0 && (
                  <button type="button" className="mind-pause-back" onClick={() => setStep(step - 1)}>
                    Back
                  </button>
                )}
                <button
                  type="button"
                  className="mind-pause-next"
                  disabled={!canAdvance}
                  onClick={() => setStep(step + 1)}
                >
                  {step === QUESTIONS.length - 1 ? "What's your call?" : 'Next'}
                </button>
              </div>
            </div>
          ) : (
            <div className="mind-pause-question">
              <h2>Your call</h2>
              <div className="mind-pause-decision-options">
                {[
                  { key: 'proceed', label: 'Proceed anyway' },
                  { key: 'wait', label: 'Wait -- sit on it' },
                  { key: 'different', label: 'Do something different' },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    className={`mind-pause-decision-option ${decision === opt.key ? 'active' : ''}`}
                    onClick={() => setDecision(opt.key)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="mind-pause-actions">
                <button type="button" className="mind-pause-back" onClick={() => setStep(step - 1)}>
                  Back
                </button>
                <button type="button" className="mind-pause-next" disabled={saving} onClick={handleFinish}>
                  Log it
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// --- Session 37 redesign: swipeable paging instead of a persistent tab
// row -- the same literal .gym-tabs class Finance/Gym/School all reuse
// verbatim, which was the single biggest reason every mode read as the
// same template with different colors. Arrows + dots for mouse/keyboard,
// real touch-swipe for anyone on a trackpad or phone-width layout.
const MIND_PAGES = [
  { key: 'today', label: 'Today' },
  { key: 'review', label: 'Review' },
  { key: 'pause', label: 'Pause & Choose' },
  { key: 'progress', label: 'Progress' },
  { key: 'habits', label: 'Habits' },
]

export default function MindPage({
  heroImages,
  updateHeroImage,
  resetHeroImage,
  mindHabits,
  mindCompletions,
  mindReviews,
  mindDecisions,
  mindSkillXp,
  mindInsights,
  saving,
  addMindHabit,
  updateMindHabit,
  deleteMindHabit,
  toggleMindCompletion,
  addMindReview,
  addMindDecision,
  updateMindDecision,
  assistantContext,
  openChat,
  mindFreezes,
}) {
  const [pageIndex, setPageIndex] = useState(0)
  const [pauseOverlayOpen, setPauseOverlayOpen] = useState(false)
  const touchStartXRef = useRef(null)

  const activeHabits = mindHabits.filter((h) => h.active !== false)
  const doneToday = new Set(mindCompletions.filter((c) => c.date === todayKey()).map((c) => c.habitId))
  // Mirrors exactly what a Streak Freeze exists to cover: late in the day
  // with habits still open is when a miss is about to happen, so the orb
  // should carry that pressure instead of reading identically at 7am and
  // 11pm.
  const todayUrgent = new Date().getHours() >= 18 && activeHabits.length > 0 && doneToday.size < activeHabits.length
  const todayMorningReview = mindReviews.find((r) => r.type === 'morning' && r.date === todayKey())
  const todayNightReview = mindReviews.find((r) => r.type === 'night' && r.date === todayKey())
  const decisionHistory = [...mindDecisions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  const skills = Object.keys(SKILL_LABELS).map((key) => {
    const xp = Number(mindSkillXp?.[key]) || 0
    return { key, xp, ...computeSkillLevel(xp) }
  })

  function goToPage(delta) {
    setPageIndex((i) => Math.max(0, Math.min(MIND_PAGES.length - 1, i + delta)))
  }

  function handleTouchStart(event) {
    touchStartXRef.current = event.touches[0].clientX
  }

  function handleTouchEnd(event) {
    if (touchStartXRef.current == null) return
    const dx = event.changedTouches[0].clientX - touchStartXRef.current
    if (Math.abs(dx) > 60) goToPage(dx < 0 ? 1 : -1)
    touchStartXRef.current = null
  }

  const activePageKey = MIND_PAGES[pageIndex].key

  return (
    <div className="page mind-page">
      <div
        className={`page-header${heroImages?.mind ? ' mode-hero' : ''}`}
        style={heroImages?.mind ? { '--hero-photo': `url(${heroImages.mind})` } : undefined}
      >
        <HeroPhotoButton
          modeKey="mind"
          heroUrl={heroImages?.mind}
          onChange={updateHeroImage}
          onReset={resetHeroImage}
        />
        <div>
          <span className="eyebrow">MIND MODE</span>
          <h1 className="serif">Mind</h1>
          <p>Understand yourself. Control yourself. Think clearly.</p>
        </div>
      </div>

      <ModeChatLauncher assistantContext={assistantContext} modeKey="mind" openChat={openChat} />

      <div className="mind-carousel" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <button
          type="button"
          className="mind-carousel-arrow left"
          onClick={() => goToPage(-1)}
          disabled={pageIndex === 0}
          aria-label="Previous view"
        >
          <ChevronLeft size={18} strokeWidth={2.5} />
        </button>

        <div className="mind-carousel-pane" key={activePageKey}>
          {activePageKey === 'today' && (
            <div className="mind-today">
              <TodayOrb doneCount={doneToday.size} totalCount={activeHabits.length} skills={skills} urgent={todayUrgent} />
              {activeHabits.length === 0 ? (
                <div className="empty-state">
                  <div>&#9989;</div>
                  <h3>No habits set</h3>
                  <p>Add your first habit in the Habits view.</p>
                </div>
              ) : (
                <div className="mind-today-list">
                  {activeHabits.map((habit) => {
                    const done = doneToday.has(habit.id)
                    const stats = habitStats(habit, mindCompletions)
                    const freezesAvailable = mindFreezes?.[habit.id]?.freezesAvailable || 0
                    return (
                      <label className={`mind-today-row ${done ? 'done' : ''}`} key={habit.id}>
                        <input
                          type="checkbox"
                          checked={done}
                          disabled={saving}
                          onChange={() => toggleMindCompletion(habit.id, todayKey())}
                        />
                        <span className="mind-today-row-name">{habit.name}</span>
                        {freezesAvailable > 0 && (
                          <span className="mind-habit-freeze-badge" title={`${freezesAvailable} Streak Freeze${freezesAvailable > 1 ? 's' : ''} banked -- auto-covers one missed day`}>
                            <Snowflake size={11} strokeWidth={2.5} />
                            {freezesAvailable}
                          </span>
                        )}
                        <HabitStatsLine stats={stats} />
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {activePageKey === 'review' && (
            <div className="items-list">
              <h3 className="mind-section-heading">Morning check-in</h3>
              <MorningReviewForm saving={saving} addMindReview={addMindReview} todayReview={todayMorningReview} />
              <h3 className="mind-section-heading">Night review</h3>
              <NightReviewForm saving={saving} addMindReview={addMindReview} todayReview={todayNightReview} />
              {mindReviews.length > 0 && (
                <>
                  <h3 className="mind-section-heading">History</h3>
                  {[...mindReviews]
                    .sort((a, b) => (a.date === b.date ? (a.type === 'morning' ? -1 : 1) : b.date.localeCompare(a.date)))
                    .slice(0, 14)
                    .map((r) => (
                      <div className="item-card" key={r.id}>
                        <div className="item-content">
                          <strong>
                            {r.date} -- {r.type === 'morning' ? 'Morning' : 'Night'}
                          </strong>
                          {r.intention && <p className="item-meta">Intention: {r.intention}</p>}
                          {r.mindset && <p className="item-meta">Feeling: {r.mindset}</p>}
                          {r.wins && <p className="item-meta">Went well: {r.wins}</p>}
                          {r.friction && <p className="item-meta">Didn't: {r.friction}</p>}
                          {r.lesson && <p className="item-meta">Lesson: {r.lesson}</p>}
                        </div>
                      </div>
                    ))}
                </>
              )}
            </div>
          )}

          {activePageKey === 'pause' && (
            <div className="items-list">
              <p className="mind-intro-text">
                Before you act on impulse, run it through here. Naming the decision -- even briefly -- is the whole
                point.
              </p>
              <button type="button" className="mind-pause-launch" onClick={() => setPauseOverlayOpen(true)}>
                Pause &amp; Choose now
              </button>
              {decisionHistory.length === 0 ? (
                <div className="empty-state">
                  <div>&#9878;</div>
                  <h3>Nothing logged yet</h3>
                  <p>Use this before your next impulsive decision, not after.</p>
                </div>
              ) : (
                <>
                  <h3 className="mind-section-heading">History</h3>
                  {decisionHistory.map((item) => (
                    <DecisionCard key={item.id} item={item} saving={saving} updateMindDecision={updateMindDecision} />
                  ))}
                </>
              )}
            </div>
          )}

          {activePageKey === 'progress' && (
            <div className="items-list">
              <h3 className="mind-section-heading">Skills</h3>
              {skills.map((skill) => (
                <SkillBar key={skill.key} label={SKILL_LABELS[skill.key]} skill={skill} />
              ))}

              <h3 className="mind-section-heading">Patterns</h3>
              {mindInsights.length === 0 ? (
                <p className="item-meta">Not enough history yet -- keep logging and real patterns will show up here.</p>
              ) : (
                mindInsights.map((insight, i) => (
                  <div className="item-card" key={i}>
                    <div className="item-content">
                      <p>{insight}</p>
                    </div>
                  </div>
                ))
              )}

              <h3 className="mind-section-heading">Habit streaks</h3>
              {activeHabits.length === 0 && (
                <div className="empty-state">
                  <div>&#128200;</div>
                  <h3>No progress yet</h3>
                  <p>Add a habit in the Habits view to start tracking real streaks.</p>
                </div>
              )}
              {activeHabits.map((habit) => {
                const stats = habitStats(habit, mindCompletions)
                return (
                  <div className="item-card" key={habit.id}>
                    <div className="item-content">
                      <strong>{habit.name}</strong>
                      <HabitStatsLine stats={stats} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {activePageKey === 'habits' && (
            <>
              <AddHabitForm saving={saving} addHabit={addMindHabit} />
              <div className="items-list">
                {mindHabits.length === 0 && (
                  <div className="empty-state">
                    <div>&#128203;</div>
                    <h3>No habits yet</h3>
                    <p>Add your first one above.</p>
                  </div>
                )}
                {mindHabits.map((habit) => {
                  const stats = habitStats(habit, mindCompletions)
                  return (
                    <div className="item-card" key={habit.id}>
                      <div className="item-content">
                        <strong style={habit.active === false ? { opacity: 0.5 } : undefined}>{habit.name}</strong>
                        <HabitStatsLine stats={stats} />
                        <FrequencyEditor habit={habit} saving={saving} updateMindHabit={updateMindHabit} />
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => updateMindHabit(habit.id, { active: habit.active === false })}
                        >
                          {habit.active === false ? 'Reactivate' : 'Archive'}
                        </button>
                      </div>
                      <button
                        className="delete-button"
                        onClick={() => deleteMindHabit(habit.id)}
                        aria-label={`Delete ${habit.name}`}
                      >
                        &times;
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          className="mind-carousel-arrow right"
          onClick={() => goToPage(1)}
          disabled={pageIndex === MIND_PAGES.length - 1}
          aria-label="Next view"
        >
          <ChevronRight size={18} strokeWidth={2.5} />
        </button>
      </div>

      <div className="mind-carousel-dots">
        {MIND_PAGES.map((page, i) => (
          <button
            key={page.key}
            type="button"
            className={`mind-carousel-dot ${i === pageIndex ? 'active' : ''}`}
            onClick={() => setPageIndex(i)}
            title={page.label}
            aria-label={page.label}
          />
        ))}
      </div>

      {pauseOverlayOpen && (
        <PauseChooseOverlay onClose={() => setPauseOverlayOpen(false)} saving={saving} addMindDecision={addMindDecision} decisionCount={mindDecisions.length + 1} />
      )}
    </div>
  )
}
