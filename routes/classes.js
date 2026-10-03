import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'
import { addToTrash } from '../lib/trashStore.js'
import { excludeCourse, includeCourse } from '../lib/canvasExclusions.js'

const router = Router()

router.get('/', (req, res) => {
  res.json({ classes: loadData('classes') })
})

// level: 'regular' | 'honors' | 'ap' -- drives the GPA weighting bonus in
// SchoolPage.jsx (Honors +0.5, AP/IB +1.0, the standard US convention).
// Defaults to 'regular' so every existing class (created before this
// field existed) reads the same as an explicitly-regular one.
const VALID_LEVELS = ['regular', 'honors', 'ap']

router.post('/', (req, res) => {
  try {
    const { name, level } = req.body
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Class name is required' })
    }
    const classes = loadData('classes')
    const schoolClass = {
      id: Date.now().toString(),
      name: name.trim(),
      level: VALID_LEVELS.includes(level) ? level : 'regular',
      // Non-academic periods (Study Hall, Lunch) can be created like any
      // other class and then excluded from GPA math individually --
      // simpler than a separate "is this even a class" concept.
      excludeFromGpa: false,
      createdAt: new Date().toISOString(),
    }
    classes.push(schoolClass)
    saveData('classes', classes)
    res.json({ class: schoolClass })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save class' })
  }
})

router.put('/:id', (req, res) => {
  try {
    const classes = loadData('classes')
    const index = classes.findIndex((c) => c.id === req.params.id)
    if (index === -1) {
      return res.status(404).json({ error: 'Class not found' })
    }
    const updates = {}
    if (typeof req.body.name === 'string' && req.body.name.trim()) {
      updates.name = req.body.name.trim()
    }
    if (VALID_LEVELS.includes(req.body.level)) {
      updates.level = req.body.level
    }
    if (typeof req.body.excludeFromGpa === 'boolean') {
      updates.excludeFromGpa = req.body.excludeFromGpa
    }
    classes[index] = { ...classes[index], ...updates }
    saveData('classes', classes)
    res.json({ class: classes[index] })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not update class' })
  }
})

router.delete('/:id', (req, res) => {
  const classes = loadData('classes')
  const deletedClass = classes.find((c) => c.id === req.params.id)
  const remaining = classes.filter((c) => c.id !== req.params.id)
  saveData('classes', remaining)

  const allAssignments = loadData('assignments')
  const deletedAssignments = allAssignments.filter((a) => a.classId === req.params.id)
  saveData('assignments', allAssignments.filter((a) => a.classId !== req.params.id))

  const allTests = loadData('tests')
  const deletedTests = allTests.filter((t) => t.classId === req.params.id)
  const deletedTestIds = new Set(deletedTests.map((t) => t.id))
  saveData('tests', allTests.filter((t) => t.classId !== req.params.id))

  // Deleting a class cascades to its tests -- and any study-plan tasks
  // generated for those tests would otherwise be left pointing at a test
  // that no longer exists.
  let deletedTasks = []
  if (deletedTestIds.size) {
    const allTasks = loadData('tasks')
    deletedTasks = allTasks.filter((t) => deletedTestIds.has(t.studyPlanFor))
    saveData('tasks', allTasks.filter((t) => !deletedTestIds.has(t.studyPlanFor)))
  }

  // Feeds the door/key "Recently Deleted" panel (TrashPanel.jsx) -- see
  // lib/trashStore.js and routes/trash.js's 'class' restore handler for
  // the matching shape this snapshot needs.
  if (deletedClass) {
    addToTrash({
      mode: 'school',
      kind: 'class',
      label: `Class: ${deletedClass.name}`,
      snapshot: { class: deletedClass, assignments: deletedAssignments, tests: deletedTests, tasks: deletedTasks },
    })
    // Canvas-linked class -- without this, routes/canvas.js's
    // /sync-classes (run on every page load) would see this course has
    // no local class anymore and recreate it right back, which is
    // exactly the "I deleted it and it came back on refresh" bug.
    if (deletedClass.canvasCourseId !== undefined) {
      excludeCourse(deletedClass.canvasCourseId)
    }
  }

  res.json({ success: true })
})

// Restores a previously-deleted class exactly as it was (undo support in
// SchoolPage.jsx / useAppData.js). Unlike POST / this takes the FULL
// record, including its original id -- so a redo (re-delete) can target
// the same id, and so this can be called before its cascaded
// assignments/tests are restored without anything breaking.
router.post('/restore', (req, res) => {
  const record = req.body.class
  if (!record?.id || !record?.name) {
    return res.status(400).json({ error: 'A full class record with id and name is required' })
  }
  const classes = loadData('classes')
  if (!classes.some((c) => c.id === record.id)) {
    classes.push(record)
    saveData('classes', classes)
  }
  if (record.canvasCourseId !== undefined) {
    includeCourse(record.canvasCourseId)
  }
  res.json({ class: record })
})

export default router
