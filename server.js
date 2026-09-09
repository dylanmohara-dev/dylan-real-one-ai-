import 'dotenv/config'
import express from 'express'
import cors from 'cors'

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
import slackRouter from './routes/slack.js'
import backupRouter from './routes/backup.js'
import { startModelWarmup } from './lib/ollamaWarm.js'


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
app.use('/api/slack', slackRouter)
app.use('/api/backup', backupRouter)

app.listen(port, () => {
  console.log(`Dylan AI server running on http://localhost:${port}`)
  // Load the model into RAM now, so the first real message doesn't pay for
  // a multi-second cold start, and keep it there while the app is running.
  startModelWarmup()
})

// Defensive keep-alive: on this machine the listening socket alone hasn't
// reliably kept the event loop alive (confirmed via process 'beforeExit'
// tracing — it was exiting with no signal and no error). This guarantees
// the process never goes idle-empty regardless of the underlying cause.
setInterval(() => {}, 1 << 30)
