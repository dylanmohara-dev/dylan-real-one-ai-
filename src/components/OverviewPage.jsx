import { useMemo, useState } from 'react'
import { Sparkles, Droplet, Moon, BookOpen, CheckCircle2, Heart } from 'lucide-react'
import { WELCOME_GREETINGS } from '../data/lifeModes.js'
import FootballIcon from './FootballIcon.jsx'

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// One-tap logging for the modes where a sensible, honest default actually
// exists -- School, Finance, and Gym are deliberately left out of this row:
// School's tasks/tests are project-specific (there's no default "class"
// to attach a quick entry to), a Finance quick-button would mean guessing
// at real money, and Gym needs a specific exercise+weight chosen, none of
// which have a default that wouldn't just be fabricated data. Each button
// here calls the exact same backend endpoint the mode's own full form
// uses -- this is a shortcut to a real save, not a separate lightweight
// system.
function QuickActions({
  saving,
  addHealthEntry,
  readingBooks,
  addReadingSession,
  disciplineHabits,
  disciplineCompletions,
  toggleDisciplineCompletion,
  addFamilyLog,
  addSportsSession,
  skills,
  addSkillSession,
}) {
  const [busyKey, setBusyKey] = useState(null)

  async function run(key, fn) {
    if (busyKey) return
    setBusyKey(key)
    try {
      await fn()
    } finally {
      setBusyKey(null)
    }
  }

  const activeBook = readingBooks?.find((b) => b.status === 'reading')
  const activeHabits = (disciplineHabits || []).filter((h) => h.active !== false)
  const doneTodayIds = new Set((disciplineCompletions || []).filter((c) => c.date === todayKey()).map((c) => c.habitId))
  const topSkill = skills && skills.length ? skills[0] : null

  const buttons = []

  buttons.push({
    key: 'water',
    icon: Droplet,
    label: '+1 glass of water',
    onClick: () => run('water', () => addHealthEntry('water', '1 glass', '', 1)),
  })
  buttons.push({
    key: 'sleep',
    icon: Moon,
    label: 'Log 8h sleep',
    onClick: () => run('sleep', () => addHealthEntry('sleep', '8 hours', '', 8)),
  })

  if (activeBook) {
    buttons.push({
      key: 'reading',
      icon: BookOpen,
      label: `+10 pages (${activeBook.title})`,
      onClick: () => run('reading', () => addReadingSession({ bookId: activeBook.id, date: todayKey(), pagesRead: 10 })),
    })
  }

  buttons.push({
    key: 'sports',
    icon: FootballIcon,
    label: 'Log quick practice (60 min)',
    onClick: () => run('sports', () => addSportsSession({ date: todayKey(), type: 'practice', durationMinutes: 60 })),
  })

  buttons.push({
    key: 'faith',
    icon: Heart,
    label: 'Log faith practice today',
    onClick: () => run('faith', () => addFamilyLog({ type: 'faith', date: todayKey(), note: '' })),
  })

  if (topSkill) {
    buttons.push({
      key: 'skill',
      icon: Sparkles,
      label: `+1 ${topSkill.unit || 'rep'} — ${topSkill.name}`,
      onClick: () => run('skill', () => addSkillSession(topSkill.id, 1)),
    })
  }

  return (
    <div className="quick-actions">
      <span className="eyebrow">QUICK ACTIONS</span>
      <div className="quick-actions-row">
        {buttons.map((btn) => {
          const Icon = btn.icon
          return (
            <button
              key={btn.key}
              type="button"
              className="quick-action-button"
              disabled={saving || busyKey === btn.key}
              onClick={btn.onClick}
            >
              <Icon size={14} strokeWidth={2.25} />
              {btn.label}
            </button>
          )
        })}

        {activeHabits.map((habit) => {
          const done = doneTodayIds.has(habit.id)
          return (
            <button
              key={`habit-${habit.id}`}
              type="button"
              className={done ? 'quick-action-button done' : 'quick-action-button'}
              disabled={saving}
              onClick={() => toggleDisciplineCompletion(habit.id, todayKey())}
            >
              <CheckCircle2 size={14} strokeWidth={2.25} />
              {habit.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function OverviewPage({
  overviewEyebrow,
  userName,
  modesCount,
  setUpCount,
  overviewCards,
  setActivePage,
  openChat,
  saving,
  addHealthEntry,
  readingBooks,
  addReadingSession,
  disciplineHabits,
  disciplineCompletions,
  toggleDisciplineCompletion,
  addFamilyLog,
  addSportsSession,
  skills,
  addSkillSession,
}) {
  const greeting = useMemo(() => {
    const pick = WELCOME_GREETINGS[Math.floor(Math.random() * WELCOME_GREETINGS.length)]
    return pick(userName || 'there')
  }, [userName])

  return (
    <div className="overview-page">
      <div className="overview-header">
        <div>
          <span className="eyebrow">{overviewEyebrow}</span>
          <h1 className="serif">{greeting}</h1>
        </div>

        <div className="overview-stats">
          <div className="overview-stat">
            <span>Modes</span>
            <strong>{modesCount}</strong>
          </div>

          <div className="overview-stat">
            <span>Set Up</span>
            <strong>{setUpCount}</strong>
          </div>

          <div className="overview-stat">
            <span>Assistants</span>
            <strong>{modesCount}</strong>
          </div>
        </div>
      </div>

      <button className="overview-ask-ai" onClick={openChat}>
        <span className="overview-ask-ai-icon">
          <Sparkles size={16} strokeWidth={2.25} />
        </span>
        <span className="overview-ask-ai-text">
          <strong>Ask Dylan AI anything</strong>
          <span>It can log things for you too — try "I ate 300 calories of chicken"</span>
        </span>
        <span className="overview-ask-ai-arrow">→</span>
      </button>

      <QuickActions
        saving={saving}
        addHealthEntry={addHealthEntry}
        readingBooks={readingBooks}
        addReadingSession={addReadingSession}
        disciplineHabits={disciplineHabits}
        disciplineCompletions={disciplineCompletions}
        toggleDisciplineCompletion={toggleDisciplineCompletion}
        addFamilyLog={addFamilyLog}
        addSportsSession={addSportsSession}
        skills={skills}
        addSkillSession={addSkillSession}
      />

      <div className="overview-divider" />

      <div className="mode-grid">
        {overviewCards.map((card) => {
          const Icon = card.icon

          return (
            <button
              className={`mode-card theme-${card.key}`}
              key={card.key}
              style={{
                '--card-rgb': card.rgb,
                '--card-rgb2': card.rgb2,
              }}
              onClick={() => setActivePage(card.key)}
            >
              <div className="mode-card-top">
                <span className="mode-card-label">
                  <Icon size={14} strokeWidth={2.25} />
                  {card.title}
                </span>

                <span className="mode-card-dot" />
              </div>

              <h3 className="serif">{card.headline}</h3>
              <p>{card.subtitle}</p>

              <div className="mode-card-metric">
                <span>{card.metricLabel}</span>
                <strong>{card.metricValue}</strong>
              </div>

              <div className="mode-progress-track">
                <div
                  className="mode-progress-fill"
                  style={{ width: `${card.progress}%` }}
                />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
