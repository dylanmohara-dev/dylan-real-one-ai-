// Collection / document registry (Phase 0).
//
// IMPORTANT: this file does NOT define a second inventory of what data exists.
// The authoritative list of app-data collections AND the list of secret
// (credential/token) collections both come straight from lib/backup.js, which
// already had to know them for the backup feature (see its COLLECTIONS and
// EXCLUDED arrays). This module only ADDS metadata on top of that single
// source -- kind, primary key, default shape, scope, secret flag -- for later
// phases to consume.
//
// Phase 0 deliberately enforces nothing: lib/dataStore.js does NOT consult this
// registry yet, so existing inconsistent data keeps loading exactly as before.
import { COLLECTIONS, EXCLUDED } from './backup.js'

function buildRegistry() {
  const registry = new Map()

  // Data collections (from backup.js): plain, restorable app data.
  for (const name of COLLECTIONS) {
    registry.set(name, {
      name,
      kind: 'collection',
      primaryKey: 'id',
      default: [],
      scope: 'local',
      secret: false,
      source: 'backup:COLLECTIONS',
    })
  }

  // Secret collections (from backup.js): credentials and OAuth tokens a backup
  // deliberately excludes. Marked secret so future phases never surface them
  // through memory/audit paths.
  for (const entry of EXCLUDED) {
    registry.set(entry.name, {
      name: entry.name,
      kind: 'document',
      primaryKey: null,
      default: {},
      scope: 'local',
      secret: true,
      source: 'backup:EXCLUDED',
      reason: entry.reason,
    })
  }

  return registry
}

export const DATA_REGISTRY = buildRegistry()

// Fallback keeps loadData() working for any collection not yet enumerated
// above -- Phase 0 must not reject names it doesn't recognise.
export function getCollectionMeta(name) {
  return (
    DATA_REGISTRY.get(name) || {
      name,
      kind: 'collection',
      primaryKey: 'id',
      default: [],
      scope: 'local',
      secret: false,
      source: 'fallback',
    }
  )
}

export function isSecretCollection(name) {
  return getCollectionMeta(name).secret === true
}
