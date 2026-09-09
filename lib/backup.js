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
import { loadData } from './dataStore.js'

// name -> the loadData() collection key. Every one of these is plain
// app data, never a credential.
const COLLECTIONS = [
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

const EXCLUDED = [
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
