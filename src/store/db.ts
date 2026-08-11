/**
 * IndexedDB persistence (plan step 2).
 *
 * One row per draft session, whole-object writes. A draft session is small
 * (~600 players plus settings) and is always read and written in full, so
 * normalising it across tables would buy nothing and cost transactional
 * complexity on every sale.
 *
 * Writes are debounced by the caller (`store/session.tsx`); this module is only
 * the storage boundary and holds no domain logic.
 */

import Dexie, { type EntityTable } from 'dexie'

import { defaultTiers } from '@/lib/tiers'
import type { DraftSession } from '@/types'

/** Which session to reopen on launch — Dexie's key/value side table. */
interface Meta {
  key: string
  value: string
}

const db = new Dexie('fantadraft') as Dexie & {
  sessions: EntityTable<DraftSession, 'id'>
  meta: EntityTable<Meta, 'key'>
}

db.version(1).stores({
  sessions: 'id, created_at, name',
  meta: 'key',
})

const ACTIVE_KEY = 'active_session_id'

/**
 * Backfills fields added to `Settings` after a session was already saved.
 * IndexedDB has no schema migration of its own, and a session persisted
 * before `settings.tiers` existed comes back with it simply absent — every
 * screen assumes it's there, so this runs on every read rather than
 * threading an `undefined` check through each call site.
 */
function normalizeSession(session: DraftSession): DraftSession {
  if (session.settings.tiers) return session
  return { ...session, settings: { ...session.settings, tiers: defaultTiers() } }
}

export async function listSessions(): Promise<DraftSession[]> {
  const sessions = await db.sessions.orderBy('created_at').reverse().toArray()
  return sessions.map(normalizeSession)
}

export async function loadSession(id: string): Promise<DraftSession | undefined> {
  const session = await db.sessions.get(id)
  return session && normalizeSession(session)
}

export async function saveSession(session: DraftSession): Promise<void> {
  await db.sessions.put(session)
}

export async function deleteSession(id: string): Promise<void> {
  await db.transaction('rw', db.sessions, db.meta, async () => {
    await db.sessions.delete(id)
    if ((await getActiveSessionId()) === id) await db.meta.delete(ACTIVE_KEY)
  })
}

export async function getActiveSessionId(): Promise<string | undefined> {
  return (await db.meta.get(ACTIVE_KEY))?.value
}

export async function setActiveSessionId(id: string): Promise<void> {
  await db.meta.put({ key: ACTIVE_KEY, value: id })
}

const BASE_SESSION_KEY = 'saved_session_template'

export async function saveBaseSession(session: DraftSession): Promise<void> {
  await db.meta.put({ key: BASE_SESSION_KEY, value: JSON.stringify(session) })
}

export async function loadBaseSession(): Promise<DraftSession | undefined> {
  const stored = await db.meta.get(BASE_SESSION_KEY)
  if (!stored?.value) return undefined
  try {
    return normalizeSession(JSON.parse(stored.value))
  } catch {
    await db.meta.delete(BASE_SESSION_KEY)
    return undefined
  }
}

export async function clearBaseSession(): Promise<void> {
  await db.meta.delete(BASE_SESSION_KEY)
}

/**
 * The session to show on launch: the one last opened, else the most recent, else
 * nothing — the caller decides what to do with an empty database.
 */
export async function loadActiveSession(): Promise<DraftSession | undefined> {
  const id = await getActiveSessionId()
  if (id) {
    const found = await db.sessions.get(id)
    if (found) return normalizeSession(found)
  }
  const [latest] = await db.sessions.orderBy('created_at').reverse().limit(1).toArray()
  return latest && normalizeSession(latest)
}

/** Wipes everything. Used by tests and by "reset all data" in settings. */
export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.sessions, db.meta, async () => {
    await db.sessions.clear()
    await db.meta.clear()
  })
}
