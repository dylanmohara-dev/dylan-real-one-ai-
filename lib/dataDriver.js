// Low-level JSON storage driver for Dylan AI (Phase 0).
//
// This is the ONLY module that touches the data/ directory on disk. It exists
// so lib/dataStore.js can stay a thin, stable facade while the physical storage
// strategy can change later (SQLite/Postgres/...) behind this same surface.
//
// Phase 0 preserves, deliberately:
//   - synchronous reads/writes (callers rely on it; nothing here is async)
//   - the same data/ directory and the same "<name>.json" file naming
//   - the directory being created at import time if missing
//   - atomic writes (temp file + rename) so a crash -- or two writers -- can
//     never leave a half-written, unparseable JSON file behind
//   - an in-process, per-file lock so async callers can serialize a whole
//     read -> await -> write sequence against the same file
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Same directory the app has always used (app/data).
export const dataDirectory = path.join(__dirname, '..', 'data')

if (!fs.existsSync(dataDirectory)) {
  fs.mkdirSync(dataDirectory, { recursive: true })
}

export function getDataPath(name) {
  return path.join(dataDirectory, `${name}.json`)
}

// --- Atomic write ---------------------------------------------------------
// Write to a uniquely-named temp file in the SAME directory, then rename over
// the target. rename(2) is atomic on the same filesystem, so a reader (or a
// crash mid-write) can never observe a partially written file, and concurrent
// writers each land a complete file instead of interleaving bytes.
let tempSequence = 0

function writeAtomicallySync(filePath, contents) {
  tempSequence += 1
  const tempPath = `${filePath}.${process.pid}.${tempSequence}.tmp`
  try {
    fs.writeFileSync(tempPath, contents, 'utf8')
    // Preserve the existing file's permission bits when overwriting, so an
    // atomic replace never silently widens access to a data file (e.g. a 0600
    // secret staying 0600). On first write the file doesn't exist yet, so the
    // temp file's default mode is kept.
    try {
      fs.chmodSync(tempPath, fs.statSync(filePath).mode & 0o777)
    } catch {
      // No existing target -- keep the default mode.
    }
    fs.renameSync(tempPath, filePath)
  } catch (error) {
    // Best-effort cleanup so a failed write never leaves a stray .tmp behind.
    fs.rmSync(tempPath, { force: true })
    throw error
  }
}

// --- Per-file in-process lock --------------------------------------------
// Node runs JS on a single thread, so two *synchronous* writes to the same file
// can never truly overlap. The real hazard is an async caller doing
// read -> await ... -> write: two such callers can both read the same snapshot,
// then both write, and the second silently clobbers the first (the
// duplicate/lost-write class of bug this project has already hit). withFileLock
// serializes same-file work so those interleavings cannot happen. The chain is
// per file name, so unrelated files never block each other.
const fileQueues = new Map()

export function withFileLock(name, fn) {
  const previous = fileQueues.get(name) || Promise.resolve()
  const result = previous.then(fn, fn)
  // Store an always-settling tail so a rejected operation can't poison the
  // queue for later operations on the same file.
  fileQueues.set(name, result.catch(() => undefined))
  return result
}

// --- Raw read/write used by the dataStore facade -------------------------
export function fileExists(name) {
  return fs.existsSync(getDataPath(name))
}

export function readRaw(name) {
  const filePath = getDataPath(name)
  if (!fs.existsSync(filePath)) return null
  return fs.readFileSync(filePath, 'utf8')
}

// pretty:false reproduces the exact bytes dataStore.loadData has always written
// when creating a MISSING file (JSON.stringify(defaultValue), no indentation).
// pretty:true reproduces saveData's JSON.stringify(data, null, 2). Keeping this
// explicit is what preserves the on-disk format.
export function writeRaw(name, data, { pretty = false } = {}) {
  const contents = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)
  writeAtomicallySync(getDataPath(name), contents)
}
