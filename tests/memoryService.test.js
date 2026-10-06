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
let memory

before(async () => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dylan-ai-memory-'))
  const lib = path.join(sandbox, 'lib')
  dataDir = path.join(sandbox, 'data')
  fs.mkdirSync(lib, { recursive: true })
  fs.mkdirSync(dataDir, { recursive: true })
  for (const file of ['dataStore.js', 'dataDriver.js', 'memoryService.js']) {
    fs.copyFileSync(path.join(root, '..', 'lib', file), path.join(lib, file))
  }
  store = await import(pathToFileURL(path.join(lib, 'dataStore.js')).href)
  memory = await import(pathToFileURL(path.join(lib, 'memoryService.js')).href)
})

beforeEach(() => store.saveData('memories', []))

after(() => {
  if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true })
})

test('normalizes legacy records while preserving original id, content, and date', () => {
  store.saveData('memories', [{ id: 'old-1', content: 'I prefer tea', createdAt: '2020-01-02T03:04:05.000Z' }])
  const [record] = memory.listMemories()
  assert.equal(record.id, 'old-1')
  assert.equal(record.content, 'I prefer tea')
  assert.equal(record.createdAt, '2020-01-02T03:04:05.000Z')
  assert.equal(record.kind, 'fact')
  assert.equal(record.source, 'legacy')
  assert.equal(record.modeScope, 'general')
  assert.equal(record.sharingPermission, 'all_modes')
  assert.equal(record.sensitivity, 'normal')
  assert.equal(record.updatedAt, record.createdAt)
  assert.equal(record.confirmedAt, null)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'memories.json'), 'utf8'))[0], record)
})

test('saves normalized, confirmed records and deduplicates case-insensitively', () => {
  const saved = memory.saveMemory('  I prefer tea  ', { source: 'suggestion', modeScope: 'school', sharingPermission: 'mode_only' })
  assert.equal(saved.content, 'I prefer tea')
  assert.equal(saved.source, 'suggestion')
  assert.equal(saved.modeScope, 'school')
  assert.equal(saved.sharingPermission, 'mode_only')
  assert.ok(saved.confirmedAt)
  assert.equal(memory.saveMemory('i prefer TEA').id, saved.id)
})

test('deletes by id and by content search through the service', () => {
  const first = memory.saveMemory('Delete this entry', { source: 'memory_page' })
  const second = memory.saveMemory('Another private entry', { source: 'memory_page' })
  assert.equal(memory.deleteMemoryById(first.id), true)
  assert.equal(memory.deleteMemoryById(first.id), false)
  assert.equal(memory.deleteMemoriesContaining('private'), 1)
  assert.deepEqual(memory.listMemories(), [])
  assert.ok(second.id)
})

test('filters permissions and mode-only memories', () => {
  memory.saveMemory('Shared routine', { modeScope: 'general', sharingPermission: 'all_modes' })
  memory.saveMemory('School preference', { modeScope: 'school', sharingPermission: 'mode_only' })
  memory.saveMemory('Private health detail', { modeScope: 'health', sharingPermission: 'private' })
  assert.deepEqual(memory.getMemoriesForMode('school').map((item) => item.content), ['School preference', 'Shared routine'])
  assert.deepEqual(memory.getMemoriesForMode('health').map((item) => item.content), ['Shared routine'])
})

test('retrieves relevant memories for a mode and query, with a bounded result', () => {
  memory.saveMemory('I play guitar after school', { modeScope: 'skills', sharingPermission: 'mode_only' })
  memory.saveMemory('I enjoy guitar music', { modeScope: 'general', sharingPermission: 'all_modes' })
  memory.saveMemory('My favorite meal is pasta', { modeScope: 'general', sharingPermission: 'all_modes' })
  memory.saveMemory('Private guitar notes', { modeScope: 'skills', sharingPermission: 'private' })
  const result = memory.getMemoriesForMode('skills', 'How often do I play guitar?', { limit: 1 })
  assert.equal(result.length, 1)
  assert.equal(result[0].content, 'I play guitar after school')
  assert.equal(memory.getMemoriesForMode('skills', 'unrelated astronomy question').length, 0)
})
