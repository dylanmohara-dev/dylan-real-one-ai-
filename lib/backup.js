// Builds the one-click backup payload.
//
// Deliberately NOT a raw copy of the data/ directory: that folder also
// holds live credentials (Apple ID + app-specific password in PLAINTEXT in
// apple_calendar_credentials.json, plus OAuth tokens for Gmail/Drive/Slack).
// Those are secrets, not data — they don't belong in a file that gets
// downloaded to Dylan's Downloads folder, possibly emailed to himself,
// possibly synced to iCloud/Dropbox. They're also replaceable (reconnect in
// Settings) in a way tasks/goals/journal entries are not, which is the
// actual point of a backup: protect what can't be recreated.
import fs from 'fs'
import path from 'path'
import { loadData, saveData, dataDirectory } from './dataStore.js'

// name -> the loadData() collection key. Every one of these is plain
// app data, never a credential. Exported so lib/dataRegistry.js can use this
// list as the single source of truth for data-vs-secret classification.
export const COLLECTIONS = [
  'tasks',
  'goals',
  'notes',
  'memories',
  'classes',
  'assignments',
  'tests',
  'health',
  'finance_accounts',
  'finance_history',
  'skills',
  'skill_sessions',
  'skill_videos',
  // Still AES-256-GCM ciphertext at rest — journal.js only ever decrypts in
  // memory with a session key derived from Dylan's passphrase. Exporting
  // the ciphertext + salt/verifier is safe; nothing here is readable
  // without that passphrase, which this backup does not contain.
  'journal',
  'journal_meta',
]

// Secret/credential stores (exported for lib/dataRegistry.js, same single
// source of truth).
export const EXCLUDED = [
  { name: 'apple_calendar_credentials', reason: 'contains your iCloud app-specific password in plaintext — reconnect from Settings instead of restoring this' },
  { name: 'gmail_tokens', reason: 'OAuth token — reconnect from Settings if you want Gmail back' },
  { name: 'drive_tokens', reason: 'OAuth token — reconnect from Settings if you want Drive back' },
  { name: 'slack_tokens', reason: 'OAuth token — reconnect from Settings if you want Slack back' },
  { name: 'calendar_tokens', reason: 'orphaned Google Calendar OAuth token, not the live calendar path' },
]

export function buildBackupPayload() {
  const data = {}
  for (const name of COLLECTIONS) {
    data[name] = loadData(name)
  }

  return {
    app: 'Dylan AI',
    exportedAt: new Date().toISOString(),
    formatVersion: 1,
    notes: [
      'Credentials and OAuth tokens are intentionally NOT included — see excludedForSecurity below.',
      'Skill practice VIDEO FILES (data/skill_videos/*, not their metadata) are not included — this is JSON, not a file bundle. Copy that folder in Finder separately if you want the actual clips backed up.',
    ],
    excludedForSecurity: EXCLUDED,
    data,
  }
}

export function backupFilename(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `dylan-ai-backup-${y}-${m}-${d}.json`
}

// Inspects an uploaded backup file WITHOUT touching any real data — so
// Settings can show Dylan exactly what he's about to overwrite before he
// commits to anything, the same way the delete-confirmation on calendar
// events shows what's about to happen before it happens.
export function previewBackupPayload(payload) {
  if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') {
    throw new Error('This does not look like a Dylan AI backup file (missing a top-level "data" object).')
  }

  const counts = {}
  const skipped = []
  for (const name of COLLECTIONS) {
    const value = payload.data[name]
    if (value === undefined) continue // fine — an older backup may predate a newer collection
    if (!Array.isArray(value)) {
      skipped.push(name)
      continue
    }
    counts[name] = value.length
  }

  const unknownKeys = Object.keys(payload.data).filter((key) => !COLLECTIONS.includes(key))

  return {
    exportedAt: payload.exportedAt || null,
    formatVersion: payload.formatVersion ?? null,
    counts,
    skipped, // present but not an array — malformed, won't be restored
    unknownKeys, // keys this version of the app doesn't recognize — ignored, not written anywhere
  }
}

// Actually overwrites local data with what's in the backup. Two safety
// properties that matter more than the restore itself:
//
// 1. It can ONLY ever write to the same fixed COLLECTIONS list backup
//    export reads from — never to apple_calendar_credentials or any
//    tokens file, and never to any key just because an uploaded file
//    happens to contain it. A malformed or tampered backup file can skip
//    or corrupt app data; it cannot use this path to plant credentials.
// 2. Before writing anything, it snapshots whatever is CURRENTLY on disk
//    to data/backups/ — so restoring the wrong file, or restoring by
//    mistake, is itself undoable. This is not optional and cannot be
//    skipped by a caller.
export function restoreFromPayload(payload) {
  const preview = previewBackupPayload(payload) // throws if the shape is wrong, before anything is touched

  const backupsDir = path.join(dataDirectory, 'backups')
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true })
  const snapshotPath = path.join(backupsDir, `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  fs.writeFileSync(snapshotPath, JSON.stringify(buildBackupPayload(), null, 2), 'utf8')

  const restored = []
  for (const name of COLLECTIONS) {
    const value = payload.data[name]
    if (!Array.isArray(value)) continue
    saveData(name, value)
    restored.push(name)
  }

  return { restoredCollections: restored, snapshotPath, preview }
}
