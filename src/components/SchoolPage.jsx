import { useState } from 'react'
import {
  Check, Flame, Swords, Shield, FileText, X, ExternalLink, Award,
  Calculator, Plus, Divide, FlaskConical, Atom, BookOpen, Landmark, Globe,
  Languages, DollarSign, Briefcase, Palette, Music, Dumbbell, Compass,
  GraduationCap,
} from 'lucide-react'
import ModeChatLauncher from './ModeChatLauncher.jsx'
import RadialProgress from './RadialProgress.jsx'
import {
  CATEGORY_WEIGHTS, itemCategory, xpForCategory, computeClassLevel, classXP, schoolTotalXP,
  RANK_TIERS, rankForLevel, unlockedTiersForLevel,
} from '../lib/schoolProgress.js'

// Standard US 4.0 scale. No school-specific customization yet (some
// schools weight AP/honors classes, use +/- differently, etc.) — this is
// a reasonable default, not a claim that it matches Dylan's actual
// school's exact scale.
function gradeToGPA(percent) {
  if (percent >= 93) return 4.0
  if (percent >= 90) return 3.7
  if (percent >= 87) return 3.3
  if (percent >= 83) return 3.0
  if (percent >= 80) return 2.7
  if (percent >= 77) return 2.3
  if (percent >= 73) return 2.0
  if (percent >= 70) return 1.7
  if (percent >= 67) return 1.3
  if (percent >= 63) return 1.0
  if (percent >= 60) return 0.7
  return 0.0
}

// Same breakpoints as gradeToGPA above, as letters instead of GPA points --
// deliberately built from the exact same thresholds rather than a second,
// independently-tuned scale, so a 91% always reads as "A-" AND 3.7 in the
// same breath, never one without the other.
function letterGrade(percent) {
  if (percent >= 93) return 'A'
  if (percent >= 90) return 'A-'
  if (percent >= 87) return 'B+'
  if (percent >= 83) return 'B'
  if (percent >= 80) return 'B-'
  if (percent >= 77) return 'C+'
  if (percent >= 73) return 'C'
  if (percent >= 70) return 'C-'
  if (percent >= 67) return 'D+'
  if (percent >= 63) return 'D'
  if (percent >= 60) return 'D-'
  return 'F'
}

// A class's average is weighted by category, not a flat mean of every
// graded item -- a $5 homework assignment and a final exam counting
// identically was a real, previously-documented gap (see the git history
// for this exact comment before this changed). These weights are a
// reasonable default, same caveat as gradeToGPA's 4.0 scale above: not a
// claim they match Dylan's actual school's real weighting, just a far
// better default than treating everything as equal. category defaults to
// 'homework' (assignments) / 'test' (tests) for any item saved before
// this field existed, matching the backend's own POST default.
const CATEGORY_LABELS = { homework: 'Homework', quiz: 'Quiz', test: 'Test', project: 'Project' }
function classAverage(classId, assignments, tests) {
  const graded = [
    ...assignments
      .filter((a) => a.classId === classId && a.grade !== null && a.grade !== undefined)
      .map((a) => ({ ...a, category: itemCategory(a, 'homework') })),
    ...tests
      .filter((t) => t.classId === classId && t.grade !== null && t.grade !== undefined)
      .map((t) => ({ ...t, category: itemCategory(t, 'test') })),
  ]
  if (!graded.length) return null
  const totalWeight = graded.reduce((sum, item) => sum + CATEGORY_WEIGHTS[item.category], 0)
  const weightedSum = graded.reduce(
    (sum, item) => sum + Number(item.grade) * CATEGORY_WEIGHTS[item.category],
    0
  )
  return weightedSum / totalWeight
}

// Grade weighting: the standard US high school convention — Honors gets
// +0.5, AP/IB gets +1.0, regular/college-prep classes get the flat 4.0
// scale. Dylan's own class list (AP History, Honors Chemistry, College
// Prep Calculus, ...) is exactly what this is for. Every class defaults
// to 'regular' (via classLevel below) so classes created before this
// field existed read correctly without a data migration.
const LEVEL_LABELS = { regular: 'Regular', honors: 'Honors', ap: 'AP / IB' }
const WEIGHT_BONUS = { regular: 0, honors: 0.5, ap: 1.0 }

function classLevel(schoolClass) {
  return schoolClass?.level || 'regular'
}

function weightedClassGPA(percent, level) {
  return gradeToGPA(percent) + (WEIGHT_BONUS[level] || 0)
}

// Computes BOTH the traditional unweighted GPA (every class flat on the
// 4.0 scale) and the weighted GPA (Honors/AP bonus applied) in one pass.
// A class explicitly marked excludeFromGpa (non-academic periods like
// Study Hall or Lunch — real entries in Dylan's own class list) is
// skipped from both entirely, same as an ungraded class: neither counts
// as a phantom 0.0, and neither should drag down or pad the average.
// `gradeLevel` ('high-school' | 'college', Dylan's own Settings choice):
// the Honors/AP +0.5/+1.0 weighted-GPA bonus above is specifically a US
// HIGH SCHOOL convention -- college transcripts don't add bonus points
// for a harder course, they're flat 4.0-scale. So in college mode,
// "weighted" is just the same flat GPA as "unweighted" (no invented
// bonus), rather than silently applying a high-school-only rule to a
// college transcript.
function computeGPAs(classes, assignments, tests, gradeLevel = 'high-school') {
  const graded = classes
    .filter((c) => !c.excludeFromGpa)
    .map((c) => ({ avg: classAverage(c.id, assignments, tests), level: classLevel(c) }))
    .filter((entry) => entry.avg !== null)

  if (!graded.length) return { weighted: null, unweighted: null, gradedCount: 0 }

  const unweightedPoints = graded.map((entry) => gradeToGPA(entry.avg))
  const weightedPoints = gradeLevel === 'college'
    ? unweightedPoints
    : graded.map((entry) => weightedClassGPA(entry.avg, entry.level))

  return {
    weighted: weightedPoints.reduce((a, b) => a + b, 0) / weightedPoints.length,
    unweighted: unweightedPoints.reduce((a, b) => a + b, 0) / unweightedPoints.length,
    gradedCount: graded.length,
  }
}

// Every completed item with a real completedAt timestamp (stamped by
// useAppData.js's toggleAssignment/toggleTest) becomes one "day this
// class got worked on." A class created, or with items completed, before
// completedAt existed simply has no streak yet -- it starts counting from
// here forward rather than guessing at history that was never recorded.
function classCompletionDayTotals(classId, assignments, tests) {
  const totals = {}
  for (const item of [...assignments, ...tests]) {
    if (item.classId !== classId || !item.completed || !item.completedAt) continue
    const day = item.completedAt.slice(0, 10)
    totals[day] = (totals[day] || 0) + 1
  }
  return totals
}

// Same day-walk as routes/skills.js's computeCurrentStreak: today counts
// if it already has a completion, otherwise the walk starts from
// yesterday so a streak isn't reported broken before the day is even over.
function currentStreakFromTotals(totals) {
  const today = todayKey()
  const cursor = new Date()
  if (!totals[today]) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (true) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    if (totals[key] > 0) {
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}

// Deterministic per-class accent color -- "everything is the same color,
// hard to distinguish" was Dylan's own diagnosis of School mode. Derived
// from the class id (a stable hash into a small curated hue set) rather
// than stored on the class or picked in a settings UI, so every class --
// including ones already saved before this existed -- gets a distinct,
// legible color immediately, with no migration and no new field.
// 4 fixed category accents (design-brief round 14) -- replaces the old
// 9-hue hash palette. Fewer, curated hues that were chosen specifically
// not to clash with the gold that owns the rest of the page, instead of
// a hash spraying nine competing colors (one of which was itself
// amber/yellow) across a page that's already gold end to end.
const CLASS_COLOR_PALETTE = [
  '111, 198, 222', // teal
  '227, 138, 155', // maroon
  '199, 158, 224', // plum
  '127, 216, 160', // green
]

function classColorRgb(classId) {
  const key = String(classId || '')
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  return CLASS_COLOR_PALETTE[hash % CLASS_COLOR_PALETTE.length]
}

// Canvas hands us class names as "Subject - Teacher - Term" (confirmed
// against the real data: 8 of Dylan's 9 synced classes follow this exactly,
// e.g. "AP Physics - Bray - YR"). Dumping that whole string as the card
// title is what made cards look like raw data exports instead of a
// designed UI. There's no separate "room" field anywhere in the data
// model, so a room/teacher meta line can only ever be a teacher line --
// showing a room here would mean inventing one, which is exactly the kind
// of fabricated-numbers problem the LIFE AREAS SNAPSHOT work above exists
// to eliminate. Manually-added classes (typed into the "+ Add Class" box)
// and the one Canvas class that doesn't follow the pattern ("School
// Counselors (Class of 2028)") don't split into exactly 3 parts, so they
// fall back to showing the name exactly as stored -- never a guessed split.
const TERM_LABELS = { YR: 'Full Year', S1: 'Semester 1', S2: 'Semester 2' }

function parseClassName(name) {
  const parts = String(name || '').split(' - ')
  if (parts.length !== 3) {
    return { subject: name, teacher: null, term: null }
  }
  const [subject, teacher, termCode] = parts
  return { subject, teacher, term: TERM_LABELS[termCode] || termCode }
}

// Dylan's ask: every class should feel visually distinct based on what it
// actually IS -- math gets math motifs, science gets science motifs, not
// just an arbitrary color. Keyword-matched against the parsed subject
// (see parseClassName above), not the class ID, so it's based on what the
// class actually is rather than an arbitrary hash.
//
// Colors deliberately still come from the same 4-hue CLASS_COLOR_PALETTE
// from round 14, not a new color per category -- that round's whole fix
// was "everything is a different clashing color, cut it down to 4 curated
// hues." Reusing those 4 across 9 categories and leaning on the icon +
// motif symbols to tell classes apart avoids re-breaking that.
const SUBJECT_THEMES = [
  { key: 'math', match: /\b(calc(ulus)?|algebra|geometry|trig(onometry)?|statistics|stats|math)\b/i, paletteIndex: 0, Icon: Calculator, motifIcons: [Plus, Divide] },
  { key: 'science', match: /\b(physics|chem(istry)?|bio(logy)?|science|anatomy|environmental)\b/i, paletteIndex: 3, Icon: FlaskConical, motifIcons: [FlaskConical, Atom] },
  { key: 'english', match: /\b(english|literature|lit|language arts|writing|composition)\b/i, paletteIndex: 2, Icon: BookOpen, motifIcons: [BookOpen] },
  { key: 'history', match: /\b(history|social studies|government|civics|world)\b/i, paletteIndex: 1, Icon: Landmark, motifIcons: [Landmark, Globe] },
  { key: 'language', match: /\b(spanish|french|german|latin|mandarin|chinese|italian|language)\b/i, paletteIndex: 2, Icon: Languages, motifIcons: [Languages] },
  { key: 'business', match: /\b(business|finance|marketing|career|accounting|economics)\b/i, paletteIndex: 0, Icon: DollarSign, motifIcons: [DollarSign, Briefcase] },
  { key: 'arts', match: /\b(art|music|band|choir|theate?r|drama|design)\b/i, paletteIndex: 1, Icon: Palette, motifIcons: [Palette, Music] },
  { key: 'pe', match: /\b(gym|p\.?e\.?|physical education|health|fitness)\b/i, paletteIndex: 3, Icon: Dumbbell, motifIcons: [Dumbbell] },
  { key: 'advisory', match: /\b(advisory|counsel(or|ing)?|homeroom)\b/i, paletteIndex: 0, Icon: Compass, motifIcons: [Compass] },
]

function classTheme(schoolClass) {
  const { subject } = parseClassName(schoolClass?.name)
  const matched = SUBJECT_THEMES.find((theme) => theme.match.test(subject || ''))
  if (matched) {
    return {
      colorRgb: CLASS_COLOR_PALETTE[matched.paletteIndex],
      Icon: matched.Icon,
      motifIcons: matched.motifIcons,
    }
  }
  // No subject keyword matched -- keep classes visually distinct (old
  // hash-based color) rather than dumping every unrecognized class into
  // one identical fallback look.
  return { colorRgb: classColorRgb(schoolClass?.id), Icon: GraduationCap, motifIcons: [GraduationCap] }
}

// Boss Battle HP: a test's own health bar, drained by real prep -- each
// completed study-plan session (a real Task, toggled in Tasks mode same
// as any other task) is one hit landed. No plan generated yet reads as
// full HP (the fight hasn't started), not zero and not hidden.
function bossHp(test, tasks) {
  const planTasks = (tasks || []).filter((t) => t.studyPlanFor === test.id)
  if (!planTasks.length) return 100
  const done = planTasks.filter((t) => t.completed).length
  return Math.round(100 - (done / planTasks.length) * 100)
}

// Persistent School-mode HUD -- Dylan's explicit ask for a lobby-style bar
// pinned at the top, separate from the page content scrolling below it.
// bestStreak is the LONGEST current streak across any one class, not a
// sum -- summing would reward spreading thin work across many classes
// over actually staying consistent in any single one.
// Flat, hand-drawn (not photographic) golden-hour campus skyline -- the
// hero banner's whole point per the design brief is to replace the old
// stock photo with real illustration: gothic towers, a clock tower, a
// domed hall, silhouetted in near-black against a layered sunset sky.
// Every shape is a plain SVG primitive (rects/polygons/circles/paths) --
// no photo, no gradients-as-a-crutch, just a skyline reads instantly even
// at a glance.
function SchoolHeroSkyline() {
  return (
    <svg
      className="school-hero-skyline"
      viewBox="0 0 800 220"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect x="-10" y="150" width="90" height="80" />
      <rect x="70" y="100" width="46" height="130" />
      <polygon points="70,100 93,62 116,100" />
      <rect x="130" y="140" width="70" height="90" />
      <rect x="210" y="115" width="54" height="115" />
      <circle cx="237" cy="98" r="17" fill="none" stroke="#100c08" strokeWidth="6" />
      <rect x="234" y="80" width="6" height="14" />
      <rect x="230" y="96" width="14" height="4" />
      <rect x="276" y="150" width="64" height="80" />
      <path d="M348 150 a62 62 0 0 1 124 0 z" />
      <rect x="340" y="150" width="140" height="80" />
      <rect x="492" y="120" width="50" height="110" />
      <polygon points="492,120 517,86 542,120" />
      <rect x="556" y="145" width="80" height="85" />
      <rect x="646" y="105" width="44" height="125" />
      <rect x="700" y="135" width="68" height="95" />
      <polygon points="700,135 734,100 768,135" />
      <rect x="780" y="155" width="40" height="75" />
    </svg>
  )
}

// Dean's List threshold -- Dylan's design brief mockup showed this badge
// as static example content with no real rule behind it. Rather than
// display an honor he didn't actually earn, this gates it on his real,
// already-computed weighted GPA. 3.5 is a common real-world Dean's List
// cutoff, not Dylan's own school's actual policy (unknown) -- easy to
// change here if his school uses a different number.
const DEANS_LIST_GPA_THRESHOLD = 3.5

function SchoolHero({ level, onJumpToClasses, weightedGPA, gradeLevel = 'high-school' }) {
  const onDeansList = weightedGPA !== null && weightedGPA !== undefined && weightedGPA >= DEANS_LIST_GPA_THRESHOLD
  // "Dean's List" is specifically a COLLEGE/university honor -- the high
  // school equivalent is "Honor Roll." Showing the college term to a high
  // schooler (or vice versa) is a small but real factual mismatch, so this
  // now follows Dylan's own Settings -> School Grade Level choice instead
  // of hardcoding the college term for everyone.
  const honorLabel = gradeLevel === 'college' ? "Dean's List" : 'Honor Roll'
  return (
    <div className="school-hero">
      <div className="school-hero-sun" aria-hidden="true" />
      <SchoolHeroSkyline />
      <div className="school-hero-content">
        <span className="eyebrow school-hero-eyebrow">Dylan AI &middot; Campus Life</span>
        <h1 className="school-hero-title">School</h1>
        <p className="school-hero-subtitle">Pick a class, or add a new one.</p>
      </div>
      <div className="school-hero-lvl" title={`Level ${level}`}>
        <span className="school-hero-lvl-label">LVL</span>
        <span className="school-hero-lvl-value">{level}</span>
      </div>
      {onDeansList && (
        <span className="school-hero-honor" title={`Weighted GPA ${weightedGPA.toFixed(2)} is at or above ${DEANS_LIST_GPA_THRESHOLD.toFixed(1)}`}>
          <Award size={11} strokeWidth={2.5} />
          {honorLabel}
        </span>
      )}
      <button type="button" className="school-hero-cta" onClick={onJumpToClasses}>
        View Full Schedule &rarr;
      </button>
    </div>
  )
}

function SchoolHUD({ classes, assignments, tests, canvasCompletions }) {
  const totalXp = schoolTotalXP(classes, assignments, tests, canvasCompletions)
  const { level, xpIntoLevel, xpForNextLevel } = computeClassLevel(totalXp)
  const pct = Math.min(100, Math.round((xpIntoLevel / xpForNextLevel) * 100))
  const bestStreak = classes.reduce((max, c) => {
    const streak = currentStreakFromTotals(classCompletionDayTotals(c.id, assignments, tests))
    return Math.max(max, streak)
  }, 0)
  // Dylan's videogame-rewards ask: this rank title is the one already-real
  // number (School's own level, computed above from actual completed
  // work) mapped to a title -- see src/lib/schoolProgress.js RANK_TIERS.
  const rank = rankForLevel(level)
  return (
    <div className="school-hud">
      <div className="school-hud-row">
        <span className="school-hud-tag-icon" aria-hidden="true"><Award size={13} strokeWidth={2.5} /></span>
        <span className="school-hud-tag">Overall Academic Progress</span>
        <span className="school-hud-rank-title">{rank.title}</span>
        <span className="school-hud-transition">LV {level} &rarr; {level + 1}</span>
        {bestStreak > 0 && (
          <span className="school-hud-streak" title={`Best current streak: ${bestStreak} day${bestStreak === 1 ? '' : 's'}`}>
            <Flame size={14} strokeWidth={2.5} />
            {bestStreak}
          </span>
        )}
      </div>
      <div className="school-hud-track" title={`${xpIntoLevel} / ${xpForNextLevel} XP to next level`}>
        <div className="school-hud-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="school-hud-row school-hud-row-footer">
        <span className="school-hud-xp">{xpIntoLevel.toLocaleString()} XP</span>
        <span className="school-hud-xp-remaining">{(xpForNextLevel - xpIntoLevel).toLocaleString()} XP to Level {level + 1}</span>
      </div>
    </div>
  )
}

// The actual "unlock more things" reward Dylan asked for: a permanent
// trophy shelf of rank titles, unlocked as School's real level climbs.
// Every tier always renders (locked ones too, greyed out with the level
// needed) so there's something to see working toward, not just a blank
// space until it's earned.
function TrophyCase({ level }) {
  const unlockedKeys = new Set(unlockedTiersForLevel(level).map((tier) => tier.key))
  return (
    <div className="school-trophy-case">
      <div className="school-section-header">
        <h2>Trophy Case</h2>
      </div>
      <div className="school-trophy-grid">
        {RANK_TIERS.map((tier) => {
          const isUnlocked = unlockedKeys.has(tier.key)
          return (
            <div key={tier.key} className={`school-trophy ${isUnlocked ? 'school-trophy-unlocked' : 'school-trophy-locked'}`}>
              <Award size={22} strokeWidth={2} />
              <div className="school-trophy-text">
                <strong>{tier.title}</strong>
                <span>{isUnlocked ? tier.subtitle : `Unlocks at Level ${tier.minLevel}`}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ClassQuestBar({ classId, assignments, tests, size, canvasCompletions }) {
  const xp = classXP(classId, assignments, tests, canvasCompletions)
  const { level, xpIntoLevel, xpForNextLevel } = computeClassLevel(xp)
  const streak = currentStreakFromTotals(classCompletionDayTotals(classId, assignments, tests))
  const pct = Math.min(100, Math.round((xpIntoLevel / xpForNextLevel) * 100))
  return (
    <div className={`school-quest-bar${size === 'lg' ? ' lg' : ''}`}>
      <span className="school-quest-level" title={`Level ${level} in this class`}>
        LV {level}
      </span>
      <div className="school-quest-track" title={`${xpIntoLevel} / ${xpForNextLevel} XP to next level`}>
        <div className="school-quest-fill" style={{ width: `${pct}%` }} />
      </div>
      {streak > 0 && (
        <span className="school-quest-streak" title={`${streak}-day streak in this class`}>
          <Flame size={12} strokeWidth={2.5} />
          {streak}
        </span>
      )}
    </div>
  )
}

// The class-detail page's stat strip needs the SAME level/XP numbers as
// ClassQuestBar above (never a second, drifting copy of the math) but
// laid out as Dylan's reference mockup: a "LEVEL" pill plus a labeled bar
// with "XP to Level N" and the exact "1,234 / 2,500" readout on screen,
// not tucked into a hover title.
function ClassLevelStatBlock({ classId, assignments, tests, canvasCompletions }) {
  const xp = classXP(classId, assignments, tests, canvasCompletions)
  const { level, xpIntoLevel, xpForNextLevel } = computeClassLevel(xp)
  const pct = Math.min(100, Math.round((xpIntoLevel / xpForNextLevel) * 100))
  return (
    <>
      <div className="school-stat-level" title={`Level ${level} in this class`}>
        <span className="school-stat-level-label">LEVEL</span>
        <span className="school-stat-level-value">{level}</span>
      </div>
      <div className="school-stat-xp">
        <span className="school-stat-xp-label">XP to Level {level + 1}</span>
        <div className="school-stat-xp-track">
          <div className="school-stat-xp-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="school-stat-xp-numbers">
          {xpIntoLevel.toLocaleString()} / {xpForNextLevel.toLocaleString()}
        </span>
      </div>
    </>
  )
}

// Deadline dashboard: every incomplete assignment/test with a date,
// across every class, sorted soonest-first. Overdue items sort first
// (negative daysUntil), not hidden -- an overdue item is exactly the
// thing you most need to see, not something to bury.
//
// Timezone-safe by construction: dueDate/date are bare "YYYY-MM-DD"
// strings. "Today" is read from local date parts (so it matches the
// calendar day the user is actually living in), then both sides are
// compared as UTC-anchored day numbers -- never round-tripped through
// `new Date(bareDateString)`, which is the exact bug that shifted goal/
// assignment/test dates back a day earlier this session.
function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysBetween(fromKey, toKey) {
  const [fy, fm, fd] = fromKey.split('-').map(Number)
  const [ty, tm, td] = toKey.split('-').map(Number)
  const from = Date.UTC(fy, fm - 1, fd)
  const to = Date.UTC(ty, tm - 1, td)
  return Math.round((to - from) / 86400000)
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// UTC-anchored on purpose, same convention as daysBetween() above -- a
// bare 'YYYY-MM-DD' has no timezone of its own, and parsing it any other
// way (e.g. `new Date(dateKey)`, which treats it as UTC midnight then
// renders in local time) can walk it back a day depending on Dylan's
// timezone. This reads back the exact same calendar day the string says.
function weekdayForDateKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  return WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

const CHIP_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

// Parses the app's bare "YYYY-MM-DD" convention directly (no Date/timezone
// involved) into the two pieces the date chip needs -- same reasoning as
// todayKey() elsewhere in this project: a bare calendar date should never
// pass through a timezone-aware Date object, or it can silently shift a
// day in either direction depending on where the server/browser think
// "local" is.
function dateChipParts(dateKey) {
  if (!dateKey) return { month: '--', day: '--' }
  const [, m, d] = dateKey.split('-')
  const monthIdx = Number(m) - 1
  return { month: CHIP_MONTHS[monthIdx] || '--', day: d || '--' }
}

function deadlineLabel(daysUntil, dateKey) {
  const weekday = dateKey ? ` (${weekdayForDateKey(dateKey)})` : ''
  if (daysUntil < 0) return `${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? '' : 's'} overdue${weekday}`
  if (daysUntil === 0) return `Due today${weekday}`
  if (daysUntil === 1) return `Due tomorrow${weekday}`
  return `Due in ${daysUntil} days${weekday}`
}

const LINGER_MS = 24 * 60 * 60 * 1000

function stillLingering(item) {
  if (!item.completed || !item.completedAt) return false
  return Date.now() - new Date(item.completedAt).getTime() < LINGER_MS
}

function upcomingItems(classes, assignments, tests, canvasAssignments) {
  const today = todayKey()
  const classNameById = Object.fromEntries(classes.map((c) => [c.id, c.name]))
  // Canvas's own courseId -> this app's local class id, built from classes
  // routes/canvas.js's /sync-classes has already linked or created. A
  // Canvas course with no matching local class (sync hasn't run yet, or
  // failed silently) just falls back to classId: null below, same as
  // before this existed.
  const classIdByCourseId = Object.fromEntries(
    classes.filter((c) => c.canvasCourseId).map((c) => [c.canvasCourseId, c.id])
  )

  const fromAssignments = assignments
    .filter((a) => a.dueDate && (!a.completed || stillLingering(a)))
    .map((a) => ({
      id: `assignment-${a.id}`,
      kind: 'Assignment',
      title: a.title,
      className: classNameById[a.classId] || 'Unknown class',
      classId: a.classId,
      dueDate: a.dueDate,
      completed: Boolean(a.completed),
      raw: a,
    }))

  const fromTests = tests
    .filter((t) => t.date && (!t.completed || stillLingering(t)))
    .map((t) => ({
      id: `test-${t.id}`,
      kind: 'Test',
      title: t.title,
      className: classNameById[t.classId] || 'Unknown class',
      classId: t.classId,
      dueDate: t.date,
      completed: Boolean(t.completed),
      raw: t,
    }))

  // Canvas assignments are read-only here (Canvas is the source of truth,
  // not this app), so they carry no classId/raw-toggle -- they're merged
  // into the same "Coming up" list rather than living in a second,
  // easy-to-miss place, which was Dylan's actual complaint: Canvas showed
  // as connected but its due dates never appeared here or on the
  // calendar. A submitted item is dropped the same way a completed local
  // assignment is -- it's no longer something to look at.
  const fromCanvas = (canvasAssignments || [])
    .filter((c) => c.dueAt && !c.submitted)
    .map((c) => {
      const classId = classIdByCourseId[c.courseId] || null
      return {
        id: c.id,
        kind: 'Canvas',
        title: c.title,
        className: (classId && classNameById[classId]) || c.courseName || 'Canvas',
        classId,
        dueDate: c.dueAt.slice(0, 10),
        raw: c,
      }
    })

  return [...fromAssignments, ...fromTests, ...fromCanvas]
    .map((item) => ({ ...item, daysUntil: daysBetween(today, item.dueDate) }))
    .sort((a, b) => a.daysUntil - b.daysUntil)
}

export default function SchoolPage({
  heroImages,
  updateHeroImage,
  resetHeroImage,
  classes,
  assignments,
  tests,
  canvas,
  canvasCompletions,
  toggleCanvasAssignment,
  setCanvasAssignmentCategory,
  schoolGradeLevel,
  selectedClassId,
  setSelectedClassId,
  classNameInput,
  setClassNameInput,
  assignmentInput,
  setAssignmentInput,
  assignmentDueDate,
  setAssignmentDueDate,
  testInput,
  setTestInput,
  testDate,
  setTestDate,
  testTopics,
  setTestTopics,
  setTestTopicsValue,
  saving,
  addClass,
  deleteClass,
  updateClass,
  addAssignment,
  toggleAssignment,
  setAssignmentGrade,
  setAssignmentCategory,
  deleteAssignment,
  tasks,
  addTest,
  toggleTest,
  setTestGrade,
  setTestCategory,
  deleteTest,
  generateStudyPlan,
  clearStudyPlan,
  setActivePage,
  assistantContext,
  openChat,
}) {
  const classAssignments = (classId) => assignments.filter((a) => a.classId === classId)
  const classTests = (classId) => tests.filter((t) => t.classId === classId)
  // Canvas assignments filed under this class's page, not just the
  // top-level "Coming up" list -- matched the same way upcomingItems()
  // above matches them, via the class's own canvasCourseId (set by
  // routes/canvas.js's /sync-classes). A submitted item drops off the
  // same way a completed local assignment would.
  const canvasClassAssignments = (classId) => {
    const activeClassForId = classes.find((c) => c.id === classId)
    if (!activeClassForId?.canvasCourseId) return []
    return (canvas?.assignments || []).filter(
      (c) => !c.submitted && c.dueAt && c.courseId === activeClassForId.canvasCourseId
    )
  }
  const { weighted: weightedGPA, unweighted: unweightedGPA, gradedCount } = computeGPAs(classes, assignments, tests, schoolGradeLevel)

  // Decluttering fix: Dylan's own complaint was that "Coming up" felt
  // cluttered -- it used to be one flat list, unlimited length, with no
  // distinction between "due today" and "due in six weeks." Grouping by
  // real urgency and collapsing the long tail behind a click is the
  // actual fix; nothing about which items show is changed, only how
  // they're organized.
  const [showLaterDeadlines, setShowLaterDeadlines] = useState(false)
  // Holds the id of whichever deadline item was just checked off, so its
  // row can play a completion animation for a beat before upcomingItems()
  // (driven by the real completed flag) drops it from the list on the
  // next data refresh.
  const [celebratingId, setCelebratingId] = useState(null)
  // Dylan's ask: "when I do an assignment an animation shows it complete
  // and it takes me to this bar and I see it leveling up." Separate from
  // celebratingId above (that one's scoped to the "Coming up" deadline
  // dashboard) -- this one's for the Quest Log's own checkbox, native
  // AND Canvas items alike, since checking either should feel identical.
  const [questCelebratingId, setQuestCelebratingId] = useState(null)
  // Briefly true right as a Quest Log completion lands, so the XP
  // bar/track can flash to draw the eye to the number that just moved --
  // the bar's own width already animates (school-stat-xp-fill's CSS
  // transition), this just makes the moment impossible to miss.
  const [xpBarFlash, setXpBarFlash] = useState(false)
  // Shared by both the native-assignment and Canvas-assignment checkboxes
  // below: play the check-pop animation, scroll the class's XP bar into
  // view, THEN fire the real toggle (which awards XP / detects a level-up)
  // after a short beat -- same "let the animation read before the item's
  // state actually flips" timing as completeWithCelebration below.
  function completeQuestItem(id, doToggle) {
    setQuestCelebratingId(id)
    document.getElementById('school-stat-strip')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => {
      doToggle()
      setQuestCelebratingId(null)
      setXpBarFlash(true)
      window.setTimeout(() => setXpBarFlash(false), 900)
    }, 420)
  }
  // Manual "remove now" for a lingering-completed item (see deadline-
  // dismiss below) -- declared before `deadlines` uses it; a const
  // referenced above its own declaration would throw at runtime (temporal
  // dead zone), not just read as undefined.
  const [dismissedIds, setDismissedIds] = useState(() => new Set())
  const deadlines = upcomingItems(classes, assignments, tests, canvas?.assignments).filter(
    (item) => !dismissedIds.has(item.id)
  )
  function completeWithCelebration(item) {
    setCelebratingId(item.id)
    window.setTimeout(() => {
      if (item.kind === 'Assignment') toggleAssignment(item.raw)
      else toggleTest(item.raw)
    }, 420)
  }
  const overdueDeadlines = deadlines.filter((item) => item.daysUntil < 0)
  const thisWeekDeadlines = deadlines.filter((item) => item.daysUntil >= 0 && item.daysUntil <= 7)
  const laterDeadlines = deadlines.filter((item) => item.daysUntil > 7)

  function renderDeadlineItem(item) {
    const tone = item.completed ? 'done' : item.daysUntil < 0 ? 'overdue' : item.daysUntil <= 2 ? 'soon' : 'normal'
    const isCanvas = item.kind === 'Canvas'
    const isCelebrating = celebratingId === item.id
    const { month, day } = dateChipParts(item.dueDate)
    // Canvas overrides the pill regardless of Test/Assignment -- it's the
    // one piece of Dylan's own explicit "yes" that Canvas items should
    // read as visibly different (synced/read-only), same rule the old
    // dashed-border treatment followed.
    const pillKind = isCanvas ? 'canvas' : item.kind.toLowerCase()
    const pillLabel = isCanvas ? 'Canvas' : item.kind
    return (
      <div
        className={`deadline-item deadline-${tone}${isCanvas ? '' : ' deadline-clickable'}${isCelebrating ? ' deadline-celebrating' : ''}`}
        key={item.id}
        style={item.classId ? { '--class-color-rgb': classColorRgb(item.classId) } : undefined}
        onClick={() => {
          // Canvas rows no longer navigate away on a plain click -- Dylan's
          // own complaint. Opening Canvas is now the small explicit
          // ExternalLink button below, a separate deliberate action.
          if (!isCanvas) setSelectedClassId(item.classId)
        }}
      >
        {isCanvas ? (
          <span className="check-button check-button-canvas" title="From Canvas -- read-only here"></span>
        ) : (
          <button
            className={`check-button${isCelebrating || item.completed ? ' check-button-done' : ''}`}
            onClick={(event) => {
              event.stopPropagation()
              if (!isCelebrating && !item.completed) completeWithCelebration(item)
            }}
            title={item.completed ? 'Done' : 'Mark done'}
          >
            {(isCelebrating || item.completed) && <Check size={14} strokeWidth={3} />}
          </button>
        )}
        <div className="deadline-date-chip" aria-hidden="true">
          <span className="deadline-date-month">{month}</span>
          <span className="deadline-date-day">{day}</span>
        </div>
        <div className="deadline-body">
          <strong>{item.title}</strong>
          {/* Real data only -- no invented due-time or room number here.
              The app only ever stores a bare due DATE (see upcomingItems
              above), never a time or room, so this stays to what's
              actually known: the class, and for Canvas items, that it's
              synced rather than typed in by hand. */}
          <span className="deadline-class">
            {item.className}
            {isCanvas ? ' · Synced from Canvas' : ''}
          </span>
        </div>
        <div className="deadline-right">
          <span className={`deadline-pill deadline-pill-${pillKind}`}>
            {item.kind === 'Test' && <Swords size={10} strokeWidth={2.5} />}
            {item.kind === 'Assignment' && !isCanvas && <FileText size={10} strokeWidth={2.5} />}
            {pillLabel}
          </span>
          {item.completed ? (
            <span className="deadline-when deadline-when-done">Done</span>
          ) : (
            <span className="deadline-when">{deadlineLabel(item.daysUntil, item.dueDate)}</span>
          )}
        </div>
        {item.completed && (
          <button
            type="button"
            className="deadline-dismiss"
            title="Remove now"
            onClick={(event) => {
              event.stopPropagation()
              setDismissedIds((prev) => new Set(prev).add(item.id))
            }}
          >
            <X size={12} strokeWidth={2.5} />
          </button>
        )}
        {isCanvas && (
          <button
            type="button"
            className="deadline-canvas-open"
            title="Open in Canvas"
            onClick={(event) => {
              event.stopPropagation()
              window.open(item.raw.url, '_blank', 'noopener')
            }}
          >
            <ExternalLink size={12} strokeWidth={2.5} />
          </button>
        )}
      </div>
    )
  }

  if (!selectedClassId) {
    const heroLevel = computeClassLevel(schoolTotalXP(classes, assignments, tests, canvasCompletions)).level
    return (
      <div className="page school-page">
        <SchoolHero
          level={heroLevel}
          weightedGPA={weightedGPA}
          gradeLevel={schoolGradeLevel}
          onJumpToClasses={() => {
            document.getElementById('school-classes-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
        />

        <SchoolHUD classes={classes} assignments={assignments} tests={tests} canvasCompletions={canvasCompletions} />

        <TrophyCase level={computeClassLevel(schoolTotalXP(classes, assignments, tests, canvasCompletions)).level} />

      <ModeChatLauncher assistantContext={assistantContext} modeKey="school" openChat={openChat} />

        {weightedGPA !== null && (
          <div className="school-gpa-banner">
            <span className="school-gpa-label">Weighted GPA</span>
            <span className="school-gpa-value">{weightedGPA.toFixed(2)}</span>
            <span className="school-gpa-note">
              Unweighted: {unweightedGPA.toFixed(2)} &middot; across {gradedCount} graded class{gradedCount === 1 ? '' : 'es'} &middot; Honors +0.5, AP/IB +1.0
            </span>
          </div>
        )}

        <div className="school-deadlines">
          <div className="panel-heading">
            <h2>Coming up</h2>
          </div>
          {deadlines.length ? (
            <div className="deadline-list">
              {overdueDeadlines.length > 0 && (
                <div className="deadline-group">
                  <span className="deadline-group-label">Overdue</span>
                  {overdueDeadlines.map(renderDeadlineItem)}
                </div>
              )}
              {thisWeekDeadlines.length > 0 && (
                <div className="deadline-group">
                  <span className="deadline-group-label">This week</span>
                  {thisWeekDeadlines.map(renderDeadlineItem)}
                </div>
              )}
              {laterDeadlines.length > 0 && (
                <div className="deadline-group">
                  <button
                    type="button"
                    className="deadline-group-toggle"
                    onClick={() => setShowLaterDeadlines((prev) => !prev)}
                  >
                    {showLaterDeadlines ? 'Hide later items ▲' : `Show ${laterDeadlines.length} later item${laterDeadlines.length === 1 ? '' : 's'} ▼`}
                  </button>
                  {showLaterDeadlines && laterDeadlines.map(renderDeadlineItem)}
                </div>
              )}
            </div>
          ) : (
            <div className="mini-empty">Nothing due -- add a due date to an assignment or test to see it here.</div>
          )}
        </div>

        <div className="form-card">
          <input
            value={classNameInput}
            onChange={(event) => setClassNameInput(event.target.value)}
            placeholder="Class name (e.g. AP History)"
          />
          <button onClick={addClass} disabled={saving || !classNameInput.trim()}>
            + Add Class
          </button>
        </div>

        <div className="school-section-header">
          <h2>Your Classes</h2>
        </div>

        <div className="items-list school-classes-grid" id="school-classes-grid">
          {classes.length ? (
            classes.map((schoolClass) => {
              const avg = classAverage(schoolClass.id, assignments, tests)
              const level = classLevel(schoolClass)
              const { subject, teacher, term } = parseClassName(schoolClass.name)
              const theme = classTheme(schoolClass)
              return (
                <div
                  className="item-card school-class-card"
                  key={schoolClass.id}
                  style={{ '--class-color-rgb': theme.colorRgb }}
                >
                  {/* Purely decorative, aria-hidden -- a couple of the
                      subject's own icons faded into the card background so
                      a math class visibly reads as math (plus/divide) and a
                      science class as science (flask/atom) at a glance,
                      instead of every card only differing by a color swatch. */}
                  <div className="school-class-motif" aria-hidden="true">
                    {theme.motifIcons.map((MotifIcon, i) => (
                      <MotifIcon key={i} size={i === 0 ? 64 : 40} strokeWidth={1.5} />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="school-grade-ring-button"
                    onClick={() => setSelectedClassId(schoolClass.id)}
                    title={avg !== null ? `${avg.toFixed(1)}% average` : 'No grades yet'}
                  >
                    <RadialProgress percent={avg} size={40} strokeWidth={4} label={avg !== null ? Math.round(avg) : '–'} />
                  </button>
                  <div
                    className="item-content"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedClassId(schoolClass.id)}
                  >
                    <strong>
                      <theme.Icon className="school-class-subject-icon" size={14} strokeWidth={2.25} />
                      {subject}
                      {level !== 'regular' && <span className="school-level-badge">{LEVEL_LABELS[level]}</span>}
                    </strong>
                    {teacher && (
                      <div className="school-class-teacher">
                        {teacher}
                        {term && ` · ${term}`}
                      </div>
                    )}
                    <div className="item-meta">
                      <span>
                        {classAssignments(schoolClass.id).length + canvasClassAssignments(schoolClass.id).length} assignments
                        {canvasClassAssignments(schoolClass.id).length > 0
                          ? ` (${canvasClassAssignments(schoolClass.id).length} Canvas)`
                          : ''}
                      </span>
                      <span> · {classTests(schoolClass.id).length} tests</span>
                      {avg !== null && (
                        <span>
                          {' '}
                          · {avg.toFixed(1)}% ({weightedClassGPA(avg, level).toFixed(1)} GPA
                          {level !== 'regular' ? ', weighted' : ''})
                        </span>
                      )}
                      {schoolClass.excludeFromGpa && <span> · not counted in GPA</span>}
                    </div>
                    <ClassQuestBar classId={schoolClass.id} assignments={assignments} tests={tests} canvasCompletions={canvasCompletions} />
                  </div>
                  <button className="delete-button" onClick={() => deleteClass(schoolClass.id)}>
                    ×
                  </button>
                </div>
              )
            })
          ) : (
            <div className="empty-state">
              <div>⌂</div>
              <h3>No classes yet</h3>
              <p>Add your first class above.</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  const activeClass = classes.find((c) => c.id === selectedClassId)
  const currentAssignments = classAssignments(selectedClassId)
  const currentTests = classTests(selectedClassId)
  const classAvg = classAverage(selectedClassId, assignments, tests)
  // Same subject theme as the class card it was opened from -- the whole
  // point Dylan asked for is that a class feels consistently "itself"
  // across the app, not just on the grid tile.
  const activeTheme = activeClass ? classTheme(activeClass) : null

  return (
    <div className="page school-page">
      {/* This sub-view's header was missing the mode-hero class every other
          mode page applies (Sports, Gym, Health, etc. -- see their own
          page-header divs), which is what gives room for the full-bleed
          photo behind it. Without it, the class-name title had no top
          clearance and rendered clipped against the page edge -- the "text
          is still cut off" Dylan flagged, and a real layout bug, not a
          font-size guess. */}
      <div
        className={`page-header school-class-detail-header${heroImages?.school ? ' mode-hero' : ''}`}
        style={{
          ...(heroImages?.school ? { '--hero-photo': `url(${heroImages.school})` } : undefined),
          ...(activeTheme ? { '--class-color-rgb': activeTheme.colorRgb } : undefined),
        }}
      >
        {activeTheme && (
          <div className="school-class-motif school-class-motif-header" aria-hidden="true">
            {activeTheme.motifIcons.map((MotifIcon, i) => (
              <MotifIcon key={i} size={i === 0 ? 120 : 80} strokeWidth={1} />
            ))}
          </div>
        )}
        <div>
          <span className="eyebrow">SCHOOL MODE</span>
          <h1 className="serif">
            {activeTheme && <activeTheme.Icon className="school-class-subject-icon school-class-subject-icon-lg" size={28} strokeWidth={2} />}
            {activeClass ? parseClassName(activeClass.name).subject : 'Class'}
          </h1>
          {activeClass && parseClassName(activeClass.name).teacher && (
            <p className="school-class-teacher school-class-teacher-detail">
              {parseClassName(activeClass.name).teacher}
              {parseClassName(activeClass.name).term && ` · ${parseClassName(activeClass.name).term}`}
            </p>
          )}
        </div>
        <button className="school-back-to-classes" onClick={() => setSelectedClassId(null)}>
          ← Back to Classes
        </button>
      </div>

      {/* Stat strip -- Dylan's reference mockup (Algebra II) pulls the
          grade ring, letter grade, Level pill, and labeled XP bar out of
          the header band into their own raised strip right below it. */}
      {activeClass && (
        <div id="school-stat-strip" className={`school-stat-strip${xpBarFlash ? ' xp-bar-flash' : ''}`} style={activeTheme ? { '--class-color-rgb': activeTheme.colorRgb } : undefined}>
          {classAvg !== null && (
            <div className="school-stat-grade">
              <RadialProgress percent={classAvg} size={84} strokeWidth={7} label={`${Math.round(classAvg)}%`} />
              <span className="school-stat-grade-letter">{letterGrade(classAvg)}</span>
              <span className="school-stat-grade-caption">Current Grade</span>
            </div>
          )}
          <ClassLevelStatBlock classId={selectedClassId} assignments={assignments} tests={tests} canvasCompletions={canvasCompletions} />
        </div>
      )}
      {activeClass && (
        <p className="school-class-summary-line">
          Assignments and tests for this class.
          {classAvg !== null &&
            ` Current average: ${classAvg.toFixed(1)}% (${weightedClassGPA(classAvg, classLevel(activeClass)).toFixed(1)} GPA${
              classLevel(activeClass) !== 'regular' ? ', weighted' : ''
            }).`}
        </p>
      )}

      <SchoolHUD classes={classes} assignments={assignments} tests={tests} canvasCompletions={canvasCompletions} />

      <ModeChatLauncher assistantContext={assistantContext} modeKey="school" openChat={openChat} />

      {activeClass && (
        <div className="school-class-settings">
          <div className="school-level-picker">
            {['regular', 'honors', 'ap'].map((level) => (
              <button
                key={level}
                type="button"
                className={classLevel(activeClass) === level ? 'active' : ''}
                onClick={() => updateClass(activeClass.id, { level })}
              >
                {LEVEL_LABELS[level]}
              </button>
            ))}
          </div>
          <label className="school-exclude-toggle">
            <input
              type="checkbox"
              checked={Boolean(activeClass.excludeFromGpa)}
              onChange={(event) => updateClass(activeClass.id, { excludeFromGpa: event.target.checked })}
            />
            Don't count this class in my GPA (e.g. Study Hall, Lunch)
          </label>
        </div>
      )}

      <div className="school-quest-boss-frame" style={activeTheme ? { '--class-color-rgb': activeTheme.colorRgb } : undefined}>
      <div className="dashboard-grid">
        <section className="dashboard-panel">
          <div className="panel-heading school-panel-heading-quest">
            <h2>Quest Log</h2>
            <span className="school-quest-counter">
              {currentAssignments.filter((a) => !a.completed).length +
                canvasClassAssignments(selectedClassId).filter((c) => !canvasCompletions[c.id]?.completed).length} of{' '}
              {currentAssignments.length + canvasClassAssignments(selectedClassId).length} open
            </span>
          </div>
          <div className="form-card">
            <input
              value={assignmentInput}
              onChange={(event) => setAssignmentInput(event.target.value)}
              placeholder="Assignment name"
            />
            <input
              type="date"
              value={assignmentDueDate}
              onChange={(event) => setAssignmentDueDate(event.target.value)}
            />
            <button onClick={addAssignment} disabled={saving || !assignmentInput.trim()}>
              + Add
            </button>
          </div>
          <div className="items-list">
            {currentAssignments.length || canvasClassAssignments(selectedClassId).length ? (
              <>
                {currentAssignments.map((assignment) => {
                  const isCelebratingQuest = questCelebratingId === assignment.id
                  return (
                  <div
                    className={`item-card school-quest-item ${assignment.completed ? 'completed' : ''}${isCelebratingQuest ? ' quest-celebrating' : ''}`}
                    key={assignment.id}
                  >
                    <button
                      className={`check-button${isCelebratingQuest || assignment.completed ? ' check-button-done' : ''}`}
                      onClick={() => {
                        if (assignment.completed) {
                          toggleAssignment(assignment)
                        } else if (!isCelebratingQuest) {
                          completeQuestItem(assignment.id, () => toggleAssignment(assignment))
                        }
                      }}
                    >
                      {(assignment.completed || isCelebratingQuest) && <Check size={14} strokeWidth={3} />}
                    </button>
                    <div className="item-content">
                      <strong>{assignment.title}</strong>
                      <div className="item-meta">
                        <span className="school-item-tag">{CATEGORY_LABELS[itemCategory(assignment, 'homework')]}</span>
                        {assignment.dueDate && (
                        <span>
                          Due {assignment.dueDate} ({weekdayForDateKey(assignment.dueDate)})
                        </span>
                      )}
                      </div>
                    </div>
                    <span className="school-item-xp">+{xpForCategory(assignment, 'homework')} XP</span>
                    <select
                      className="category-select"
                      value={itemCategory(assignment, 'homework')}
                      title="Grade weight category"
                      onChange={(event) => setAssignmentCategory(assignment, event.target.value)}
                    >
                      {Object.keys(CATEGORY_LABELS).map((key) => (
                        <option key={key} value={key}>
                          {CATEGORY_LABELS[key]} ({CATEGORY_WEIGHTS[key]}%)
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      className="grade-input"
                      min="0"
                      max="100"
                      placeholder="Grade %"
                      defaultValue={assignment.grade ?? ''}
                      onBlur={(event) => {
                        if (event.target.value !== String(assignment.grade ?? '')) {
                          setAssignmentGrade(assignment, event.target.value)
                        }
                      }}
                    />
                    <button className="delete-button" onClick={() => deleteAssignment(assignment.id)}>
                      ×
                    </button>
                  </div>
                  )
                })}
                {canvasClassAssignments(selectedClassId).map((c) => {
                  const completionRecord = canvasCompletions[c.id]
                  const isDone = !!completionRecord?.completed
                  const category = itemCategory(completionRecord || {}, 'homework')
                  const isCelebratingQuest = questCelebratingId === c.id
                  return (
                    <div
                      className={`item-card school-quest-item ${isDone ? 'completed' : ''}${isCelebratingQuest ? ' quest-celebrating' : ''}`}
                      key={c.id}
                    >
                      <button
                        className={`check-button${isCelebratingQuest || isDone ? ' check-button-done' : ''}`}
                        onClick={() => {
                          if (isDone) {
                            toggleCanvasAssignment(c, selectedClassId)
                          } else if (!isCelebratingQuest) {
                            completeQuestItem(c.id, () => toggleCanvasAssignment(c, selectedClassId))
                          }
                        }}
                        title={
                          isDone
                            ? 'Mark not done (local only -- never touches Canvas)'
                            : 'Mark done (local only -- never touches Canvas or your real grade there)'
                        }
                      >
                        {(isDone || isCelebratingQuest) && <Check size={14} strokeWidth={3} />}
                      </button>
                      <div className="item-content">
                        <strong>{c.title}</strong>
                        <div className="item-meta">
                          <span className="school-item-tag">{CATEGORY_LABELS[category]}</span>
                          <span>
                            Due {c.dueAt.slice(0, 10)} ({weekdayForDateKey(c.dueAt.slice(0, 10))}) &middot; Canvas
                          </span>
                        </div>
                      </div>
                      <span className="school-item-xp">+{xpForCategory(completionRecord || {}, 'homework')} XP</span>
                      <select
                        className="category-select"
                        value={category}
                        title="Grade weight category (local only, doesn't touch Canvas)"
                        onChange={(event) => setCanvasAssignmentCategory(c, selectedClassId, event.target.value)}
                      >
                        {Object.keys(CATEGORY_LABELS).map((key) => (
                          <option key={key} value={key}>
                            {CATEGORY_LABELS[key]} ({CATEGORY_WEIGHTS[key]}%)
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="deadline-canvas-open"
                        title="Open in Canvas"
                        onClick={() => window.open(c.url, '_blank', 'noopener')}
                      >
                        <ExternalLink size={12} strokeWidth={2.5} />
                      </button>
                    </div>
                  )
                })}
              </>
            ) : (
              <div className="mini-empty">No assignments yet.</div>
            )}
          </div>
        </section>

        <section className="dashboard-panel">
          <div className="panel-heading">
            <h2>Boss Battles</h2>
          </div>
          <div className="form-card">
            <input
              value={testInput}
              onChange={(event) => setTestInput(event.target.value)}
              placeholder="Test name"
            />
            <input
              type="date"
              value={testDate}
              onChange={(event) => setTestDate(event.target.value)}
            />
            <input
              value={testTopics}
              onChange={(event) => setTestTopics(event.target.value)}
              placeholder="Topics covered, comma-separated (optional -- makes the study plan specific)"
            />
            <button onClick={addTest} disabled={saving || !testInput.trim()}>
              + Add
            </button>
          </div>
          <div className="items-list">
            {currentTests.length ? (
              currentTests.map((test) => {
                const planTasks = (tasks || []).filter((t) => t.studyPlanFor === test.id)
                return (
                  <div
                    className={`item-card school-test-card ${test.completed ? 'completed' : ''}`}
                    key={test.id}
                  >
                    <div className="school-test-row">
                      <button className="check-button" onClick={() => toggleTest(test)}>
                        {test.completed ? '✓' : ''}
                      </button>
                      <div className="item-content">
                        <strong>
                          <Shield size={13} strokeWidth={2.5} className="school-boss-shield" />
                          {test.title}
                        </strong>
                        <div className="item-meta">
                          {test.date && <span>{test.date}</span>}
                        </div>
                      </div>
                      <select
                        className="category-select"
                        value={itemCategory(test, 'test')}
                        title="Grade weight category"
                        onChange={(event) => setTestCategory(test, event.target.value)}
                      >
                        {Object.keys(CATEGORY_LABELS).map((key) => (
                          <option key={key} value={key}>
                            {CATEGORY_LABELS[key]} ({CATEGORY_WEIGHTS[key]}%)
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        className="grade-input"
                        min="0"
                        max="100"
                        placeholder="Grade %"
                        defaultValue={test.grade ?? ''}
                        onBlur={(event) => {
                          if (event.target.value !== String(test.grade ?? '')) {
                            setTestGrade(test, event.target.value)
                          }
                        }}
                      />
                      <button className="delete-button" onClick={() => deleteTest(test.id)}>
                        ×
                      </button>
                    </div>

                    {!test.completed && (
                      <div
                        className={`school-boss-bar${bossHp(test, tasks) <= 30 ? ' school-boss-low' : ''}`}
                        title="Boss HP -- drops as you complete this test's study plan. A 90%+ grade is what actually defeats it."
                      >
                        <span className="school-boss-label-text">HP</span>
                        <div className="school-boss-track">
                          <div className="school-boss-fill" style={{ width: `${bossHp(test, tasks)}%` }} />
                        </div>
                        <span className="school-boss-label">{bossHp(test, tasks)} / 100</span>
                      </div>
                    )}

                    {test.date && (
                      <>
                        <div className="school-topics-row">
                          <input
                            className="school-topics-input"
                            defaultValue={test.topics || ''}
                            placeholder="What does this test cover? (comma-separated topics)"
                            onBlur={(event) => {
                              if (event.target.value.trim() !== (test.topics || '')) {
                                setTestTopicsValue(test, event.target.value)
                              }
                            }}
                          />
                        </div>

                        <div className="school-study-plan-row">
                          {planTasks.length ? (
                            <>
                              <span className="school-study-plan-status">
                                Study plan: {planTasks.length} session{planTasks.length === 1 ? '' : 's'} scheduled
                              </span>
                              <button
                                type="button"
                                className="school-study-plan-action"
                                onClick={() => generateStudyPlan(test.id)}
                              >
                                Regenerate
                              </button>
                              <button
                                type="button"
                                className="school-study-plan-action"
                                onClick={() => clearStudyPlan(test.id)}
                              >
                                Clear
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="school-study-plan-action"
                              onClick={() => generateStudyPlan(test.id)}
                            >
                              Generate study plan
                            </button>
                          )}
                        </div>

                        {planTasks.length > 0 && (
                          // The actual plan, visible right here -- not just a
                          // count. Dylan's own words: the old version was "just
                          // like a placeholder... there isn't actually a plan
                          // for me to study or do." This is the plan itself:
                          // every session's date, technique, and (when topics
                          // were given above) exactly what it covers.
                          <ol className="school-study-plan-sessions">
                            {planTasks
                              .slice()
                              .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))
                              .map((task) => (
                                <li key={task.id}>
                                  <strong>
                                    {task.dueDate} &mdash; {task.title.split(': ').slice(-1)[0]}
                                  </strong>
                                  <p>{task.studyPlanDetail}</p>
                                </li>
                              ))}
                          </ol>
                        )}
                      </>
                    )}
                  </div>
                )
              })
            ) : (
              <div className="mini-empty">No tests yet.</div>
            )}
          </div>
        </section>
      </div>
      </div>
    </div>
  )
}
