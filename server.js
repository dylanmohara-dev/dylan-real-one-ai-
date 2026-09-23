import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

import tasksRouter from './routes/tasks.js'
import goalsRouter from './routes/goals.js'
import notesRouter from './routes/notes.js'
import memoriesRouter from './routes/memories.js'
import classesRouter from './routes/classes.js'
import assignmentsRouter from './routes/assignments.js'
import testsRouter from './routes/tests.js'
import chatRouter from './routes/chat.js'
import journalRouter from './routes/journal.js'
import healthRouter from './routes/health.js'
import calendarRouter from './routes/calendar.js'
import financeRouter from './routes/finance.js'
import onboardingRouter from './routes/onboarding.js'
import skillsRouter from './routes/skills.js'
import gmailRouter from './routes/gmail.js'
import driveRouter from './routes/drive.js'
import googleCalendarRouter from './routes/googleCalendar.js'
import canvasRouter from './routes/canvas.js'
import slackRouter from './routes/slack.js'
import backupRouter from './routes/backup.js'
import gymRouter from './routes/gym.js'
import sportsRouter from './routes/sports.js'
import readingRouter from './routes/reading.js'
import mindRouter from './routes/mind.js'
import familyRouter from './routes/family.js'
import bootstrapRouter from './routes/bootstrap.js'
import notificationsRouter from './routes/notifications.js'
import playerRouter from './routes/player.js'
import tradingRouter from './routes/trading.js'
import searchRouter from './routes/search.js'
import { startModelWarmup } from './lib/ollamaWarm.js'
import { startNotificationScheduler } from './lib/notificationScheduler.js'


const app = express()
const port = 3001

app.use(cors())
// Default express.json() body limit is 100kb — a base64-encoded photo from
// a phone camera or a screenshot is routinely several MB once encoded, so
// every real image-chat attempt was hitting Express's body-parser limit
// BEFORE it ever reached routes/chat.js. That failure happens in
// middleware, outside any route's own try/catch, so Express's default
// handler sent back an HTML error page instead of JSON — which is why the
// client saw a garbled generic error instead of anything specific. This was
// almost certainly the real reason image-chat "just didn't work," separate
// from (and probably more common than) the vision-model question.
app.use(express.json({ limit: '20mb' }))

app.use('/api/tasks', tasksRouter)
app.use('/api/goals', goalsRouter)
app.use('/api/notes', notesRouter)
app.use('/api/memories', memoriesRouter)
app.use('/api/classes', classesRouter)
app.use('/api/assignments', assignmentsRouter)
app.use('/api/tests', testsRouter)
app.use('/api', chatRouter)
app.use('/api/journal', journalRouter)
app.use('/api/health', healthRouter)
app.use('/api/calendar', calendarRouter)
app.use('/api/finance', financeRouter)
app.use('/api/onboarding', onboardingRouter)
app.use('/api/skills', skillsRouter)
app.use('/api/gmail', gmailRouter)
app.use('/api/drive', driveRouter)
app.use('/api/google-calendar', googleCalendarRouter)
app.use('/api/canvas', canvasRouter)
app.use('/api/slack', slackRouter)
app.use('/api/backup', backupRouter)
app.use('/api/gym', gymRouter)
app.use('/api/sports', sportsRouter)
app.use('/api/reading', readingRouter)
app.use('/api/mind', mindRouter)
app.use('/api/family', familyRouter)
app.use('/api', bootstrapRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/player', playerRouter)
app.use('/api/trading', tradingRouter)
app.use('/api', searchRouter)

// Phone access (via a tunnel to this Mac) needs the frontend and the API
// reachable through the SAME origin/port, since a free tunnel forwards
// exactly one port -- this is also why src/hooks/useAppData.js and
// useCalendar.js now fetch a relative '/api' path in production instead
// of a hardcoded localhost URL. Run `npm run build` once, then start
// this server (`npm run server` or `node server.js`) -- it serves the
// built frontend here. This block is a no-op during normal local
// development (`npm run dev`), which still runs Vite's own dev server
// on its own port exactly as before -- dist/ simply won't exist yet, so
// none of these routes match anything and Vite keeps handling the UI.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, 'dist')
const distIndex = path.join(distDir, 'index.html')

if (fs.existsSync(distIndex)) {
  app.use(express.static(distDir))
  // SPA fallback: any non-API GET that isn't a real static file (e.g. a
  // page refresh on a client-side route) still gets the app shell, so
  // React Router-style navigation doesn't 404 on phone or tunnel access.
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(distIndex)
  })
}

app.listen(port, () => {
  console.log(`Dylan AI server running on http://localhost:${port}`)
  // Load the model into RAM now, so the first real message doesn't pay for
  // a multi-second cold start, and keep it there while the app is running.
  startModelWarmup()
  // Push notifications only ever fire while this process is alive -- same
  // honest constraint as the AI warmup above and the calendar auto-sync.
  // A no-op until Dylan has both real VAPID keys in .env AND at least one
  // subscribed device; see lib/notificationTriggers.js.
  startNotificationScheduler()
})

// Defensive keep-alive: on this machine the listening socket alone hasn't
// reliably kept the event loop alive (confirmed via process 'beforeExit'
// tracing — it was exiting with no signal and no error). This guarantees
// the process never goes idle-empty regardless of the underlying cause.
setInterval(() => {}, 1 << 30)
