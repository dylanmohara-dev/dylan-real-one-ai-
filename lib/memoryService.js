import { randomUUID } from 'node:crypto'
import { loadData, saveData } from './dataStore.js'

const MODES = new Set(['general', 'school', 'sports', 'gym', 'health', 'finance', 'skills', 'reading', 'mind', 'family'])
const KINDS = new Set(['fact', 'preference', 'pattern', 'goal', 'context'])
const SOURCES = new Set(['legacy', 'memory_page', 'onboarding', 'chat_explicit', 'suggestion'])
const SHARING = new Set(['all_modes', 'mode_only', 'private'])
const SENSITIVITY = new Set(['normal', 'sensitive'])
const STOP_WORDS = new Set(['about', 'after', 'again', 'also', 'and', 'are', 'because', 'been', 'before', 'being', 'but', 'can', 'could', 'did', 'does', 'doing', 'for', 'from', 'have', 'having', 'here', 'how', 'into', 'its', 'just', 'like', 'make', 'more', 'much', 'need', 'only', 'other', 'our', 'out', 'really', 'should', 'some', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'want', 'was', 'were', 'what', 'when', 'where', 'which', 'while', 'will', 'with', 'would', 'your'])

function valid(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback
}

function normalizeMemory(memory, now = new Date().toISOString()) {
  const original = memory && typeof memory === 'object' ? memory : { content: String(memory ?? '') }
  const createdAt = original.createdAt || now
  return {
    ...original,
    id: original.id || randomUUID(),
    content: typeof original.content === 'string' ? original.content : String(original.content ?? ''),
    kind: valid(original.kind, KINDS, 'fact'),
    source: valid(original.source, SOURCES, 'legacy'),
    modeScope: valid(original.modeScope, MODES, 'general'),
    sharingPermission: valid(original.sharingPermission, SHARING, 'all_modes'),
    sensitivity: valid(original.sensitivity, SENSITIVITY, 'normal'),
    createdAt,
    updatedAt: original.updatedAt || createdAt,
    confirmedAt: original.confirmedAt || null,
  }
}

function readNormalized({ persistNormalization = true } = {}) {
  const stored = loadData('memories')
  const memories = Array.isArray(stored) ? stored.map((memory) => normalizeMemory(memory)) : []
  if (persistNormalization && JSON.stringify(stored) !== JSON.stringify(memories)) saveData('memories', memories)
  return memories
}

export function listMemories() {
  return readNormalized()
}

export function saveMemory(content, metadata = {}) {
  const trimmed = typeof content === 'string' ? content.trim() : ''
  if (!trimmed) return null
  const memories = readNormalized()
  const existing = memories.find((memory) => memory.content.toLowerCase() === trimmed.toLowerCase())
  if (existing) {
    const source = valid(metadata.source, SOURCES, 'memory_page')
    if (source === 'suggestion') {
      existing.source = source
      existing.modeScope = valid(metadata.modeScope, MODES, existing.modeScope)
      existing.sharingPermission = valid(metadata.sharingPermission, SHARING, existing.sharingPermission)
      existing.sensitivity = valid(metadata.sensitivity, SENSITIVITY, existing.sensitivity)
      existing.confirmedAt = new Date().toISOString()
      existing.updatedAt = existing.confirmedAt
      saveData('memories', memories)
    } else if (source === 'chat_explicit' && !existing.confirmedAt) {
      existing.confirmedAt = new Date().toISOString()
      existing.updatedAt = existing.confirmedAt
      saveData('memories', memories)
    }
    return existing
  }

  const now = new Date().toISOString()
  const modeScope = valid(metadata.modeScope, MODES, 'general')
  const source = valid(metadata.source, SOURCES, 'memory_page')
  const explicitlyConfirmed = source !== 'legacy'
  const memory = normalizeMemory({
    id: randomUUID(),
    content: trimmed,
    kind: valid(metadata.kind, KINDS, 'fact'),
    source,
    modeScope,
    sharingPermission: valid(metadata.sharingPermission, SHARING, modeScope === 'general' ? 'all_modes' : 'mode_only'),
    sensitivity: valid(metadata.sensitivity, SENSITIVITY, 'normal'),
    createdAt: now,
    updatedAt: now,
    confirmedAt: explicitlyConfirmed ? now : null,
  }, now)
  memories.push(memory)
  saveData('memories', memories)
  return memory
}

export function hasMemory(content) {
  const trimmed = typeof content === 'string' ? content.trim().toLowerCase() : ''
  return Boolean(trimmed && readNormalized().some((memory) => memory.content.toLowerCase() === trimmed))
}

export function deleteMemoryById(id) {
  const memories = readNormalized()
  const remaining = memories.filter((memory) => memory.id !== id)
  if (remaining.length !== memories.length) saveData('memories', remaining)
  return remaining.length !== memories.length
}

export function deleteMemoriesContaining(query) {
  const search = typeof query === 'string' ? query.toLowerCase().trim() : ''
  if (!search) return 0
  const memories = readNormalized()
  const remaining = memories.filter((memory) => !memory.content.toLowerCase().includes(search))
  const deleted = memories.length - remaining.length
  if (deleted) saveData('memories', remaining)
  return deleted
}

function tokens(text) {
  return new Set((String(text || '').toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((word) => !STOP_WORDS.has(word)))
}

export function getMemoriesForMode(mode, query = '', { limit = 12, persistNormalization = true } = {}) {
  const activeMode = valid(mode, MODES, 'general')
  const memories = readNormalized({ persistNormalization }).filter((memory) => {
    if (memory.sharingPermission === 'private') return false
    if (memory.sharingPermission === 'mode_only') return memory.modeScope === activeMode
    return true
  })
  const queryTokens = tokens(query)
  const modeTokens = activeMode === 'general' ? new Set() : tokens(activeMode)
  const ranked = memories.map((memory, index) => {
    const words = tokens(memory.content)
    let score = 0
    for (const word of queryTokens) if (words.has(word)) score += 2
    for (const word of modeTokens) if (words.has(word)) score += 1
    return { memory, index, score }
  })
  const selected = queryTokens.size
    ? ranked.filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || b.index - a.index)
    : ranked.sort((a, b) => b.index - a.index)
  return selected.slice(0, Math.max(0, Number(limit) || 0)).map(({ memory }) => memory)
}
