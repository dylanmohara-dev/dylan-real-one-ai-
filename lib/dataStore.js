// Thin, stable facade over lib/dataDriver.js (Phase 0).
//
// The public API is preserved EXACTLY -- every existing
//   import { loadData, saveData, dataDirectory, getDataPath } from '.../dataStore.js'
// keeps working, synchronously, with identical behavior. The actual disk I/O
// (atomic writes, per-file locking, directory handling) now lives in
// lib/dataDriver.js so the storage strategy can change later without touching
// call sites.
import { fileExists, readRaw, writeRaw } from './dataDriver.js'

// Re-exported unchanged so the two external consumers (lib/backup.js and
// routes/skills.js import dataDirectory; getDataPath is part of the original
// public surface) keep working without importing the driver directly.
export { dataDirectory, getDataPath } from './dataDriver.js'

// defaultValue lets a caller store a plain object (settings-shaped data,
// e.g. a single weekly plan) instead of the usual list -- always returned
// as a fresh clone, never the literal defaultValue reference, so a caller
// that mutates what it gets back can never accidentally corrupt a shared
// default across calls.
export function loadData(name, defaultValue = []) {
  try {
    if (!fileExists(name)) {
      // Preserve the original bytes exactly: JSON.stringify(defaultValue) with
      // NO indentation (pretty:false), matching the previous writeFileSync.
      writeRaw(name, defaultValue)
      return structuredClone(defaultValue)
    }
    const raw = readRaw(name)
    if (!raw || !raw.trim()) return structuredClone(defaultValue)
    return JSON.parse(raw)
  } catch (error) {
    console.error(`Could not load ${name}:`, error)
    return structuredClone(defaultValue)
  }
}

// Read an optional record without creating it when absent. Useful for newly
// introduced settings where "not configured" must remain a true unknown.
export function loadDataIfExists(name, defaultValue = []) {
  try {
    if (!fileExists(name)) return structuredClone(defaultValue)
    const raw = readRaw(name)
    if (!raw || !raw.trim()) return structuredClone(defaultValue)
    return JSON.parse(raw)
  } catch (error) {
    console.error(`Could not load ${name}:`, error)
    return structuredClone(defaultValue)
  }
}

export function saveData(name, data) {
  // pretty:true reproduces the original JSON.stringify(data, null, 2).
  writeRaw(name, data, { pretty: true })
}
