import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'
import { sendPushNotification, getVapidConfigFromEnv } from '../lib/webPush.js'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../lib/notificationTriggers.js'

const router = Router()

// The frontend needs this to pass as `applicationServerKey` to
// `pushManager.subscribe()` -- it's public by design (it's what a push
// service uses to verify OUR identity, not to protect anything secret),
// but the route still 503s honestly if Dylan hasn't generated real VAPID
// keys yet rather than handing back an empty/undefined key that would
// fail confusingly deep inside the browser's own subscribe() call.
router.get('/vapid-public-key', (req, res) => {
  const vapidConfig = getVapidConfigFromEnv()
  if (!vapidConfig) {
    return res.status(503).json({ error: 'Push notifications are not configured on this server yet (missing VAPID keys in .env).' })
  }
  res.json({ publicKey: vapidConfig.keys.publicKey })
})

router.get('/subscriptions', (req, res) => {
  res.json({ count: loadData('push_subscriptions').length })
})

router.post('/subscribe', (req, res) => {
  const { subscription } = req.body
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({ error: 'A valid PushSubscription (endpoint + keys.p256dh + keys.auth) is required' })
  }

  const subscriptions = loadData('push_subscriptions')
  const alreadyKnown = subscriptions.some((s) => s.endpoint === subscription.endpoint)
  if (!alreadyKnown) {
    subscriptions.push(subscription)
    saveData('push_subscriptions', subscriptions)
  }

  // Granting the browser's own permission prompt already IS Dylan's
  // explicit opt-in -- turn the master switch on now instead of making
  // him hunt for a second toggle immediately afterward. Per-category
  // toggles and timing stay independently adjustable in Settings.
  const prefs = loadData('notification_preferences', DEFAULT_NOTIFICATION_PREFERENCES)
  if (!prefs.enabled) {
    prefs.enabled = true
    saveData('notification_preferences', prefs)
  }

  res.json({ success: true, count: subscriptions.length })
})

router.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body
  if (!endpoint) {
    return res.status(400).json({ error: 'endpoint is required' })
  }
  const subscriptions = loadData('push_subscriptions')
  const remaining = subscriptions.filter((s) => s.endpoint !== endpoint)
  saveData('push_subscriptions', remaining)
  res.json({ success: true, count: remaining.length })
})

router.get('/preferences', (req, res) => {
  res.json({ preferences: loadData('notification_preferences', DEFAULT_NOTIFICATION_PREFERENCES) })
})

router.post('/preferences', (req, res) => {
  const prefs = loadData('notification_preferences', DEFAULT_NOTIFICATION_PREFERENCES)
  const {
    enabled,
    streakReminders,
    dueDateReminders,
    morningSummary,
    nightlyTaskReminder,
    reminderHour,
    morningHour,
    dueDateLeadDays,
  } = req.body

  if (enabled !== undefined) prefs.enabled = Boolean(enabled)
  if (streakReminders !== undefined) prefs.streakReminders = Boolean(streakReminders)
  if (dueDateReminders !== undefined) prefs.dueDateReminders = Boolean(dueDateReminders)
  if (morningSummary !== undefined) prefs.morningSummary = Boolean(morningSummary)
  if (nightlyTaskReminder !== undefined) prefs.nightlyTaskReminder = Boolean(nightlyTaskReminder)
  if (reminderHour !== undefined) {
    const hour = Number(reminderHour)
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23) prefs.reminderHour = hour
  }
  if (morningHour !== undefined) {
    const hour = Number(morningHour)
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23) prefs.morningHour = hour
  }
  if (dueDateLeadDays !== undefined) {
    const days = Number(dueDateLeadDays)
    if (Number.isInteger(days) && days >= 0 && days <= 14) prefs.dueDateLeadDays = days
  }

  saveData('notification_preferences', prefs)
  res.json({ preferences: prefs })
})

// A manual "send me one now" button in Settings -- the only way to
// actually confirm the whole chain (VAPID keys → real push service →
// service worker → OS notification) works end to end, since nothing in
// this sandbox can verify a live push service round-trip itself.
router.post('/test', async (req, res) => {
  const vapidConfig = getVapidConfigFromEnv()
  if (!vapidConfig) {
    return res.status(503).json({ error: 'Push notifications are not configured yet -- add VAPID keys to .env first.' })
  }
  const subscriptions = loadData('push_subscriptions')
  if (!subscriptions.length) {
    return res.status(400).json({ error: 'No devices are subscribed yet -- enable notifications in Settings on your phone first.' })
  }

  let sent = 0
  const stillValid = []
  for (const subscription of subscriptions) {
    try {
      const result = await sendPushNotification(
        subscription,
        { title: 'Dylan AI', body: "Test notification — if you see this, it's working.", tag: 'test' },
        vapidConfig
      )
      if (!result.gone) stillValid.push(subscription)
      if (result.ok) sent += 1
    } catch (error) {
      console.error('Test push failed:', error.message)
      stillValid.push(subscription)
    }
  }
  if (stillValid.length !== subscriptions.length) saveData('push_subscriptions', stillValid)

  res.json({ sent, total: subscriptions.length })
})

export default router
