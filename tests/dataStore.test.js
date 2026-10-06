// Characterization test for the Phase 0 data-access seam.
//
// Runs the REAL lib/dataStore.js + lib/dataDriver.js -- byte-copied at test
// time -- inside an isolated temporary directory, so the modules' dataDirectory
// resolves to the temp folder and the app's real data/*.json files are never
// read or written.
//
// Covers the four behaviors Phase 0 must not change:
//   1. saveData() round-trips a value through loadData()
//   2. saveData() writes pretty JSON: JSON.stringify(data, null, 2)
//   3. loadData() creates a missing file from the supplied default (no indent)
//   4. no temporary .tmp files remain after successful writes
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LIB_DIR = path.join(__dirname, '..', 'lib')

let sandboxDir
let sandboxDataDir
let store

before(async () => {
  sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dylan-ai-datastore-'))
  const sandboxLibDir = path.join(sandboxDir, 'lib')
  sandboxDataDir = path.join(sandboxDir, 'data')
  fs.mkdirSync(sandboxLibDir, { recursive: true })
  fs.mkdirSync(sandboxDataDir, { recursive: true })

  // Copy the production modules so the code under test is identical, but their
  // `dataDirectory` (computed relative to the module's own location) points at
  // this sandbox instead of the real app/data folder.
  for (const file of ['dataStore.js', 'dataDriver.js']) {
    fs.copyFileSync(path.join(LIB_DIR, file), path.join(sandboxLibDir, file))
  }

  // Unique URL per run -> a fresh module instance with its own dataDirectory
  // and its own per-file lock map.
  store = await import(pathToFileURL(path.join(sandboxLibDir, 'dataStore.js')).href)
})

after(() => {
  if (sandboxDir) fs.rmSync(sandboxDir, { recursive: true, force: true })
})

function readSandboxFile(name) {
  return fs.readFileSync(path.join(sandboxDataDir, name), 'utf8')
}

test('isolation: the module under test points at the sandbox, not app/data', () => {
  // Compare real paths: on macOS os.tmpdir() (/var/...) is a symlink to
  // /private/var/..., and Node's loader canonicalizes the imported module's
  // own path, so the two sides differ only by that symlink prefix.
  assert.equal(
    fs.realpathSync(store.dataDirectory),
    fs.realpathSync(sandboxDataDir)
  )
})

test('saveData() round-trips a value through loadData()', () => {
  const value = { tasks: [{ id: '1', title: 'Read' }], count: 2, done: false }
  store.saveData('roundtrip', value)
  assert.deepEqual(store.loadData('roundtrip'), value)
})

test('saveData() writes pretty JSON (JSON.stringify(data, null, 2))', () => {
  const value = { a: 1, list: [1, 2] }
  store.saveData('pretty', value)
  assert.equal(readSandboxFile('pretty.json'), JSON.stringify(value, null, 2))
})

test('loadData() creates a missing file from the supplied default', () => {
  // Array default -> written with NO indentation, matching the original
  // writeFileSync(filePath, JSON.stringify(defaultValue)).
  assert.deepEqual(store.loadData('missing_array', []), [])
  assert.equal(readSandboxFile('missing_array.json'), JSON.stringify([]))

  // Object default (document-shaped store).
  const defaultObject = { weeklyMinutesGoal: 360 }
  assert.deepEqual(store.loadData('missing_object', defaultObject), defaultObject)
  assert.equal(readSandboxFile('missing_object.json'), JSON.stringify(defaultObject))
})

test('no temporary .tmp files remain after successful writes', () => {
  store.saveData('tidy', { ok: true })
  store.loadData('tidy_missing', {})
  const leftovers = fs.readdirSync(sandboxDataDir).filter((name) => name.endsWith('.tmp'))
  assert.deepEqual(leftovers, [])
})
