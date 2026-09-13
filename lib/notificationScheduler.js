// Runs the two notification checks on a timer for as long as `node
// server.js` is alive -- same honest constraint as everything else in
// this Express app (the AI warmup, the calendar sync): nothing fires
// while Dylan's Mac is asleep or the server isn't running. There is no
// separate always-on notification service here, by design -- a second
// process would need its own scheduling/state-sharing story for no real
// benefit, since this app already assumes the server is the one thing
// that has to be running for anything in it to work.
import { checkDueDateReminders, checkStreakReminders, checkMorningTaskSummary, checkNightlyTaskReminder } from './notificationTriggers.js'

// 15 minutes: frequent enough that a due-date reminder or the evening
// streak check never lags noticeably behind its real trigger moment,
// infrequent enough to not be its own small background cost.
const CHECK_INTERVAL_MS = 15 * 60 * 1000

async function runChecks() {
  try {
    await checkDueDateReminders()
  } catch (error) {
    console.error('Due-date reminder check failed:', error)
  }
  try {
    await checkStreakReminders()
  } catch (error) {
    console.error('Streak reminder check failed:', error)
  }
  try {
    await checkMorningTaskSummary()
  } catch (error) {
    console.error('Morning task summary check failed:', error)
  }
  try {
    await checkNightlyTaskReminder()
  } catch (error) {
    console.error('Nightly task reminder check failed:', error)
  }
}

export function startNotificationScheduler() {
  // Run once immediately on boot (not just after the first interval) --
  // otherwise restarting the server right after 8pm would silently wait
  // up to 15 minutes before the first check even happens.
  runChecks()
  setInterval(runChecks, CHECK_INTERVAL_MS)
}
