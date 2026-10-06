import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
let sandbox
let dataDir
let store
let taskRouter
let assignmentRouter
let testRouter
let canvasRouter
let calendarSync

function findHandler(router, method, routePath) {
  const layer = router.stack.find((item) => item.route?.path === routePath && item.route.methods[method])
  assert.ok(layer, `${method.toUpperCase()} ${routePath} is registered`)
  const handler = layer.route.stack.find((item) => item.method === method)?.handle
  assert.equal(typeof handler, 'function')
  return handler
}

async function invoke(router, method, routePath, { params = {}, body = {} } = {}) {
  const handler = findHandler(router, method, routePath)
  let status = 200
  let result
  const response = {
    status(code) { status = code; return this },
    json(value) { result = value; return this },
  }
  await handler({ params, body }, response)
  return { status, body: result }
}

before(async () => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dylan-effort-api-'))
  const lib = path.join(sandbox, 'lib')
  const routes = path.join(sandbox, 'routes')
  dataDir = path.join(sandbox, 'data')
  fs.mkdirSync(lib, { recursive: true })
  fs.mkdirSync(routes, { recursive: true })
  fs.mkdirSync(dataDir, { recursive: true })
  fs.symlinkSync(path.join(root, '..', 'node_modules'), path.join(sandbox, 'node_modules'), 'dir')

  for (const file of ['dataStore.js', 'dataDriver.js', 'effortEstimate.js', 'studyPlan.js']) {
    fs.copyFileSync(path.join(root, '..', 'lib', file), path.join(lib, file))
  }
  fs.writeFileSync(path.join(lib, 'calendarAutoSync.js'), 'let syncCalls = 0\nexport async function syncCalendarEvent() { syncCalls += 1 }\nexport async function clearCalendarEvent() {}\nexport function getSyncCalls() { return syncCalls }\n')
  fs.writeFileSync(path.join(lib, 'trashStore.js'), 'export function addToTrash() {}\n')
  for (const file of ['tasks.js', 'assignments.js', 'tests.js', 'canvasCompletions.js']) {
    fs.copyFileSync(path.join(root, '..', 'routes', file), path.join(routes, file))
  }

  store = await import(pathToFileURL(path.join(lib, 'dataStore.js')).href)
  calendarSync = await import(pathToFileURL(path.join(lib, 'calendarAutoSync.js')).href)
  const routers = await Promise.all([
    import(pathToFileURL(path.join(routes, 'tasks.js')).href),
    import(pathToFileURL(path.join(routes, 'assignments.js')).href),
    import(pathToFileURL(path.join(routes, 'tests.js')).href),
    import(pathToFileURL(path.join(routes, 'canvasCompletions.js')).href),
  ])
  ;[taskRouter, assignmentRouter, testRouter, canvasRouter] = routers.map((module) => module.default)
})

beforeEach(() => {
  store.saveData('tasks', [])
  store.saveData('assignments', [])
  store.saveData('tests', [])
  store.saveData('canvas_completions', {})
})

after(() => {
  if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true })
})

const localKinds = [
  { name: 'task', router: () => taskRouter, collection: 'tasks', route: '/:id', request: { title: 'Read chapter' } },
  { name: 'assignment', router: () => assignmentRouter, collection: 'assignments', route: '/:id', request: { classId: 'class-1', title: 'Write essay' } },
  { name: 'test', router: () => testRouter, collection: 'tests', route: '/:id', request: { classId: 'class-1', title: 'Biology test' } },
]

for (const kind of localKinds) {
  test(`${kind.name}: create, update, clear, reject invalid effort, and accept records without effort`, async () => {
    const router = kind.router()
    const created = await invoke(router, 'post', '/', { body: {
      ...kind.request,
      estimatedEffortMinutes: '45',
      estimatedEffortProvenance: 'derived',
    } })
    assert.equal(created.status, 200)
    assert.equal(created.body[kind.name].estimatedEffortMinutes, 45)
    assert.equal(created.body[kind.name].estimatedEffortProvenance, 'user_recorded')
    const id = created.body[kind.name].id

    const syncCallsBeforeEffortUpdate = calendarSync.getSyncCalls()
    const updated = await invoke(router, 'put', kind.route, { params: { id }, body: { estimatedEffortMinutes: 90 } })
    assert.equal(updated.status, 200)
    assert.equal(updated.body[kind.name].estimatedEffortMinutes, 90)
    assert.equal(updated.body[kind.name].estimatedEffortProvenance, 'user_recorded')
    assert.equal(calendarSync.getSyncCalls(), syncCallsBeforeEffortUpdate, 'effort-only update must not rewrite the calendar event')

    for (const value of [0, -1, 1.5, 'not a number', true]) {
      const invalid = await invoke(router, 'put', kind.route, { params: { id }, body: { estimatedEffortMinutes: value } })
      assert.equal(invalid.status, 400, `${kind.name} should reject ${String(value)}`)
    }
    assert.equal(store.loadData(kind.collection)[0].estimatedEffortMinutes, 90)

    const cleared = await invoke(router, 'put', kind.route, { params: { id }, body: { estimatedEffortMinutes: '' } })
    assert.equal(cleared.status, 200)
    assert.equal(Object.hasOwn(cleared.body[kind.name], 'estimatedEffortMinutes'), false)
    assert.equal(Object.hasOwn(cleared.body[kind.name], 'estimatedEffortProvenance'), false)

    for (const value of [0, -1, 1.5, 'nope']) {
      const invalidCreate = await invoke(router, 'post', '/', { body: { ...kind.request, estimatedEffortMinutes: value } })
      assert.equal(invalidCreate.status, 400, `${kind.name} create should reject ${String(value)}`)
    }
    const oldStyle = await invoke(router, 'post', '/', { body: kind.request })
    assert.equal(oldStyle.status, 200)
    assert.equal(Object.hasOwn(oldStyle.body[kind.name], 'estimatedEffortMinutes'), false)
    assert.equal(store.loadData(kind.collection).length, 2)
  })
}

test('Canvas effort stays local and survives completion and category overlay updates', async () => {
  const canvasId = 'canvas-123'
  store.saveData('canvas_completions', {
    [canvasId]: { classId: 'class-1', title: 'Project', category: 'project', completed: false, customLocalField: 'keep-me' },
  })

  const saved = await invoke(canvasRouter, 'put', '/:canvasId/effort', {
    params: { canvasId }, body: { estimatedEffortMinutes: '60', estimatedEffortProvenance: 'external_data' },
  })
  assert.equal(saved.status, 200)
  assert.equal(saved.body.canvasCompletions[canvasId].estimatedEffortMinutes, 60)
  assert.equal(saved.body.canvasCompletions[canvasId].estimatedEffortProvenance, 'user_recorded')
  assert.equal(saved.body.canvasCompletions[canvasId].customLocalField, 'keep-me')

  const categorized = await invoke(canvasRouter, 'put', '/:canvasId/category', {
    params: { canvasId }, body: { category: 'test', classId: 'class-1', title: 'Project' },
  })
  assert.equal(categorized.body.canvasCompletions[canvasId].estimatedEffortMinutes, 60)
  assert.equal(categorized.body.canvasCompletions[canvasId].customLocalField, 'keep-me')

  const completed = await invoke(canvasRouter, 'put', '/:canvasId', {
    params: { canvasId }, body: { completed: true, classId: 'class-1', category: 'test', title: 'Project' },
  })
  assert.equal(completed.body.canvasCompletions[canvasId].estimatedEffortMinutes, 60)
  assert.equal(completed.body.canvasCompletions[canvasId].estimatedEffortProvenance, 'user_recorded')
  assert.equal(completed.body.canvasCompletions[canvasId].customLocalField, 'keep-me')

  const uncompleted = await invoke(canvasRouter, 'put', '/:canvasId', {
    params: { canvasId }, body: { completed: false },
  })
  assert.equal(uncompleted.body.canvasCompletions[canvasId].estimatedEffortMinutes, 60)

  const invalid = await invoke(canvasRouter, 'put', '/:canvasId/effort', {
    params: { canvasId }, body: { estimatedEffortMinutes: 0 },
  })
  assert.equal(invalid.status, 400)

  const cleared = await invoke(canvasRouter, 'put', '/:canvasId/effort', {
    params: { canvasId }, body: { estimatedEffortMinutes: null },
  })
  assert.equal(Object.hasOwn(cleared.body.canvasCompletions[canvasId], 'estimatedEffortMinutes'), false)
  assert.equal(Object.hasOwn(cleared.body.canvasCompletions[canvasId], 'estimatedEffortProvenance'), false)

  const canvasRouteSource = fs.readFileSync(path.join(root, '..', 'routes', 'canvas.js'), 'utf8')
  assert.doesNotMatch(canvasRouteSource, /estimatedEffortMinutes/)
  const appDataSource = fs.readFileSync(path.join(root, '..', 'src', 'hooks', 'useAppData.js'), 'utf8')
  const localEffortHandler = appDataSource.match(/async function setCanvasAssignmentEffort\([\s\S]*?\n  }/)
  assert.ok(localEffortHandler)
  assert.match(localEffortHandler[0], /\/canvas-completions\/\$\{canvasAssignment\.id\}\/effort/)
  assert.doesNotMatch(localEffortHandler[0], /\/canvas\/assignments/)
})
