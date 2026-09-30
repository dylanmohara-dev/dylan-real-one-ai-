import { useMemo, useState } from 'react'
import { Sparkles, Droplet, Moon, BookOpen, CheckCircle2, Heart, Flame, GraduationCap } from 'lucide-react'
import { WELCOME_GREETINGS } from '../data/lifeModes.js'
import FootballIcon from './FootballIcon.jsx'
import HeroPhotoButton from './HeroPhotoButton.jsx'
import DeadlineItem from './DeadlineItem.jsx'
import { upcomingItems } from '../lib/schoolDeadlines.js'

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
  mindHabits,
  mindCompletions,
  toggleMindCompletion,
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
  const activeHabits = (mindHabits || []).filter((h) => h.active !== false)
  const doneTodayIds = new Set((mindCompletions || []).filter((c) => c.date === todayKey()).map((c) => c.habitId))
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
              onClick={() => toggleMindCompletion(habit.id, todayKey())}
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

// The "home-base agent" panel: a short, real, prioritized list of what
// actually needs attention, computed in useAppData's dailyFocus from
// Dylan's own data (overdue tests, an overconcentrated trading position,
// habits not done yet, etc.) -- not a canned greeting. Clicking an item
// jumps straight to the mode it's about; items with no specific mode
// (e.g. a generic overdue task) aren't clickable.
function DailyFocus({ items, setActivePage }) {
  if (!items || !items.length) {
    return (
      <div className="overview-focus overview-focus-clear">
        <CheckCircle2 size={15} strokeWidth={2.25} />
        <span>Nothing urgent right now — you're caught up.</span>
      </div>
    )
  }

  return (
    <div className="overview-focus">
      <span className="overview-focus-heading">Today's focus</span>
      <div className="overview-focus-list">
        {items.map((item, index) => (
          <button
            key={index}
            className={`overview-focus-item ${item.urgent ? 'urgent' : ''}`}
            onClick={() => item.mode && setActivePage(item.mode)}
            disabled={!item.mode}
          >
            {item.text}
          </button>
        ))}
      </div>
    </div>
  )
}

// Dylan's explicit ask, in his own words: "i should be able to click it
// off on the home screen THIS WEEK." Reuses the exact same upcomingItems()
// merge/sort and DeadlineItem row component School's own "Coming up"
// dashboard uses (src/lib/schoolDeadlines.js, src/components/
// DeadlineItem.jsx) -- same real data, same real checkbox that awards XP
// and can trigger a level-up, not a second lightweight copy. Capped to
// what's overdue or due in the next 7 days (a home screen widget that
// scrolled for a whole semester's worth of Canvas homework would be its
// own new complaint), with a link to the full dashboard for anything
// past that window.
function UpcomingSchoolWidget({
  classes, assignments, tests, canvas, canvasCompletions,
  toggleAssignment, toggleTest, toggleCanvasAssignment, setActivePage,
}) {
  const [celebratingId, setCelebratingId] = useState(null)
  const [dismissedIds, setDismissedIds] = useState(() => new Set())

  const hasSchoolData = (classes && classes.length > 0) || (canvas?.assignments && canvas.assignments.length > 0)
  if (!hasSchoolData) return null

  const all = upcomingItems(classes || [], assignments || [], tests || [], canvas?.assignments, canvasCompletions).filter(
    (item) => !dismissedIds.has(item.id)
  )
  const items = all.filter((item) => item.daysUntil <= 7).slice(0, 5)
  if (!items.length) return null

  function completeItem(item) {
    setCelebratingId(item.id)
    window.setTimeout(() => {
      if (item.kind === 'Canvas') toggleCanvasAssignment(item.raw, item.classId)
      else if (item.kind === 'Assignment') toggleAssignment(item.raw)
      else toggleTest(item.raw)
      setCelebratingId(null)
    }, 420)
  }

  return (
    <div className="overview-school-widget">
      <div className="overview-school-widget-header">
        <span className="overview-school-widget-title">
          <GraduationCap size={15} strokeWidth={2.25} />
          Coming up — School
        </span>
        <button type="button" className="overview-school-widget-link" onClick={() => setActivePage('School')}>
          Full schedule →
        </button>
      </div>
      <div className="overview-school-widget-list">
        {items.map((item) => (
          <DeadlineItem
            key={item.id}
            item={item}
            celebrating={celebratingId === item.id}
            onComplete={() => completeItem(item)}
            onOpenClass={() => setActivePage('School')}
            onDismiss={() => setDismissedIds((prev) => new Set(prev).add(item.id))}
          />
        ))}
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
  dailyFocus,
  setActivePage,
  openChat,
  saving,
  addHealthEntry,
  readingBooks,
  addReadingSession,
  mindHabits,
  mindCompletions,
  toggleMindCompletion,
  addFamilyLog,
  addSportsSession,
  skills,
  addSkillSession,
  heroImages,
  updateHeroImage,
  resetHeroImage,
  classes,
  assignments,
  tests,
  canvas,
  canvasCompletions,
  toggleAssignment,
  toggleTest,
  toggleCanvasAssignment,
}) {
  const greeting = useMemo(() => {
    const pick = WELCOME_GREETINGS[Math.floor(Math.random() * WELCOME_GREETINGS.length)]
    return pick(userName || 'there')
  }, [userName])

  // GTA-menu-style tilt for the mode cards below (Dylan's "clickable, GTA
  // real feel" ask) -- a real per-frame 3D tilt tracked off the actual
  // cursor position within each card, not a canned CSS hover animation.
  // Deliberately plain DOM writes (card.style.transform) instead of React
  // state: this fires on every mousemove, and re-rendering 9 cards' worth
  // of React state that many times a second would be the wrong tool for a
  // purely visual, non-data effect. touch devices never fire mousemove,
  // so they simply keep the flat card with no tilt -- never broken, just
  // plainer, which is correct for a surface that can't hover anyway.
  const applyCardTilt = (event, pressed) => {
    // Reduced-motion users get the flat, untilted card -- same as anyone
    // on a touch device that never fires mousemove at all. This is a
    // direct DOM write, not a CSS animation, so it's the JS side (not
    // App.css's prefers-reduced-motion block) that has to be the one to
    // skip it.
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const card = event.currentTarget
    const rect = card.getBoundingClientRect()
    const px = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) - 0.5
    const py = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) - 0.5
    const rotateY = px * 14
    const rotateX = py * -14
    const scale = pressed ? 0.965 : 1.035
    const lift = pressed ? 0 : -4
    card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale}) translateY(${lift}px)`
  }
  const resetCardTilt = (event) => {
    event.currentTarget.style.transform = ''
  }

  return (
    <div
      className="overview-page"
      style={heroImages?.overview ? { '--hero-photo': `url(${heroImages.overview})` } : undefined}
    >
      {/* Dylan asked for the photo to cover the whole home screen, not a
          240px strip -- this is a real full-bleed hero band (see
          .overview-hero-bg in App.css), not just a taller header. It's
          absolutely positioned and out of flow specifically so it can
          break out of .overview-page's own 1000px reading-column width
          via negative margins, while .overview-header (right below it,
          in normal flow) still renders at the same visual spot it always
          did -- nothing else on this page had to move. */}
      <div className="overview-hero-bg" />

      <div className="overview-header">
        <HeroPhotoButton
          modeKey="overview"
          heroUrl={heroImages?.overview}
          onChange={updateHeroImage}
          onReset={resetHeroImage}
        />
        <div>
          <span className="eyebrow">{overviewEyebrow}</span>
          <h1 className="serif">{greeting}</h1>
        </div>

      </div>

      <DailyFocus items={dailyFocus} setActivePage={setActivePage} />

      <UpcomingSchoolWidget
        classes={classes}
        assignments={assignments}
        tests={tests}
        canvas={canvas}
        canvasCompletions={canvasCompletions}
        toggleAssignment={toggleAssignment}
        toggleTest={toggleTest}
        toggleCanvasAssignment={toggleCanvasAssignment}
        setActivePage={setActivePage}
      />

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
        mindHabits={mindHabits}
        mindCompletions={mindCompletions}
        toggleMindCompletion={toggleMindCompletion}
        addFamilyLog={addFamilyLog}
        addSportsSession={addSportsSession}
        skills={skills}
        addSkillSession={addSkillSession}
      />

      <div className="overview-divider" />

      <div className="mode-grid">
        {overviewCards.map((card) => {
          const Icon = card.icon

          const photoUrl = heroImages?.[card.key]

          return (
            <button
              className={`mode-card theme-${card.key}${photoUrl ? ' has-photo' : ''}`}
              key={card.key}
              style={{
                '--card-rgb': card.rgb,
                '--card-rgb2': card.rgb2,
              }}
              onClick={() => setActivePage(card.key)}
              onMouseMove={(event) => applyCardTilt(event, false)}
              onMouseDown={(event) => applyCardTilt(event, true)}
              onMouseUp={(event) => applyCardTilt(event, false)}
              onMouseLeave={resetCardTilt}
            >
              {photoUrl && (
                <div
                  className="mode-card-photo"
                  style={{ backgroundImage: `url(${photoUrl})` }}
                />
              )}
              <div className="mode-card-scrim" />

              <div className="mode-card-content">
                <div className="mode-card-top">
                  <span className="mode-card-label">
                    <Icon size={14} strokeWidth={2.25} />
                    {card.title}
                  </span>

                  <span className="mode-card-top-right">
                    {card.streak > 0 && (
                      <span className="mode-card-streak" title={`${card.streak} day streak`}>
                        <Flame size={11} strokeWidth={2.5} />
                        {card.streak}
                      </span>
                    )}
                    <span className="mode-card-dot" />
                  </span>
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
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
