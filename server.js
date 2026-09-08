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

const app = express()
const port = 3001

app.use(cors())
app.use(express.json())

app.use('/api/tasks', tasksRouter)
app.use('/api/goals', goalsRouter)
app.use('/api/notes', notesRouter)
app.use('/api/memories', memoriesRouter)
app.use('/api/classes', classesRouter)
app.use('/api/assignments', assignmentsRouter)
app.use('/api/tests', testsRouter)
app.use('/api', chatRouter)
app.use('/api/journal', journalRouter)

app.listen(port, () => {
  console.log(`Dylan AI server running on http://localhost:${port}`)
})
