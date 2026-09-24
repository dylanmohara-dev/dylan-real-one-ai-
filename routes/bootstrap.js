import { Router } from 'express'
import { loadData } from '../lib/dataStore.js'
import { buildPayload as buildSkillsPayload } from './skills.js'
import { computeNetWorth } from './finance.js'
import { computeTradingStats, DEFAULT_TRADING_SETTINGS } from './trading.js'
import { DEFAULT_WEEK_PLAN } from './gym.js'
import { DEFAULT_SCHEDULE } from './sports.js'
import { loadPlayerStats } from '../lib/playerXP.js'
import { computeMindInsights } from './mind.js'
import { getHeroImages } from './heroImages.js'

const router = Router()

// One combined read for the app's entire initial/refresh load, instead of
// the ~22 separate GET requests useAppData.js's loadData() used to fire in
// parallel on every single mutation anywhere in the app -- add a task, log
// a gym set, toggle a habit, click an Overview quick-action -- all 22
// endpoints got refetched, every single time. Each of those was already
// fast individually (local Express, small JSON files), but 22 separate
// HTTP round trips, 22 route-handler invocations, and 22 JSON parses adds
// up to real, measurable overhead on every single save. This was the most
// concrete, verifiable candidate behind "the app feels slow" -- found by
// reading the actual code (`grep -c "await loadData()"` came back 63 call
// sites, all funneling through one function that does this 22-way fetch),
// not guessed.
//
// This reuses the EXACT SAME logic each individual route already runs --
// buildPayload() for skills' XP/level/streak/badge computation,
// computeNetWorth() for finance, the DEFAULT_WEEK_PLAN/DEFAULT_SCHEDULE
// merge for gym/sports -- imported directly, not copied. Nothing here is a
// second implementation that could drift out of sync with the real routes.
// All 22 individual endpoints are untouched and still work exactly as
// before; this is purely a faster additional way to fetch the same data
// in one request instead of 22.
router.get('/bootstrap', (req, res) => {
  try {
    const financeAccounts = loadData('finance_accounts')

    res.json({
      heroImages: getHeroImages(),
      tasks: loadData('tasks'),
      goals: loadData('goals'),
      notes: loadData('notes'),
      memories: loadData('memories'),
      classes: loadData('classes'),
      assignments: loadData('assignments'),
      tests: loadData('tests'),
      health: { entries: loadData('health'), goals: loadData('health_goals', {}) },
      finance: {
        accounts: financeAccounts,
        netWorth: computeNetWorth(financeAccounts),
        history: loadData('finance_history'),
        transactions: loadData('finance_transactions'),
        budgets: loadData('finance_budgets', {}),
      },
      skills: buildSkillsPayload().skills,
      gym: {
        exercises: loadData('gym_exercises'),
        logs: loadData('gym_logs'),
        routines: loadData('gym_routines'),
        weekPlan: { ...DEFAULT_WEEK_PLAN, ...loadData('gym_week_plan', DEFAULT_WEEK_PLAN) },
        weekPlanOverrides: loadData('gym_week_plan_overrides', {}),
        dayNotes: loadData('gym_day_notes'),
        sessions: loadData('gym_sessions'),
        recurringEvents: loadData('gym_recurring_events'),
      },
      sports: {
        sessions: loadData('sports_sessions'),
        schedule: { ...DEFAULT_SCHEDULE, ...loadData('sports_schedule', DEFAULT_SCHEDULE) },
        scheduleOverrides: loadData('sports_schedule_overrides', {}),
        settings: loadData('sports_settings', { sport: '' }),
        recurringEvents: loadData('sports_recurring_events'),
      },
      reading: {
        books: loadData('reading_books'),
        sessions: loadData('reading_sessions'),
        goals: loadData('reading_goals', { dailyPageGoal: 10 }),
      },
      mind: {
        habits: loadData('mind_habits'),
        completions: loadData('mind_completions'),
        reviews: loadData('mind_reviews'),
        decisions: loadData('mind_decisions'),
        skillXp: loadData('mind_skill_xp')[0] || {},
        freezes: loadData('mind_habit_freezes', {}),
        insights: computeMindInsights(),
      },
      family: {
        members: loadData('family_members'),
        log: loadData('family_log'),
        goals: loadData('family_goals', { weeklyMinutesGoal: 360 }),
      },
      trading: (() => {
        const positions = loadData('trading_positions')
        const watchlist = loadData('trading_watchlist')
        const settings = loadData('trading_settings', DEFAULT_TRADING_SETTINGS)
        const netWorth = computeNetWorth(financeAccounts)
        return {
          positions,
          watchlist,
          settings,
          stats: computeTradingStats(positions, financeAccounts, netWorth, settings.concentrationLimitPct),
        }
      })(),
      player: loadPlayerStats(),
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not load app data' })
  }
})

export default router
