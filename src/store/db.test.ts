/**
 * Tests for the IndexedDB boundary, against a fake implementation.
 *
 * What matters here is that a round-trip is lossless (a session is stored as a
 * structured clone, so anything non-cloneable would throw) and that "which
 * session reopens on launch" behaves, including after the active one is deleted.
 */

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'

import * as db from '@/store/db'
import { createSession } from '@/store/actions'
import { DEMO_SESSION } from '@/mocks/fixtures'

const make = (id: string, createdAt: number) =>
  createSession({ id, name: `Session ${id}`, createdAt })

beforeEach(async () => {
  await db.clearAll()
})

describe('round-trip', () => {
  it('stores and reloads a session unchanged', async () => {
    await db.saveSession(DEMO_SESSION)
    const back = await db.loadSession(DEMO_SESSION.id)

    // Deep equality on the real fixture: catches any field lost in the clone.
    expect(back).toEqual(DEMO_SESSION)
  })

  it('overwrites on save rather than accumulating rows', async () => {
    const s = make('a', 1)
    await db.saveSession(s)
    await db.saveSession({ ...s, name: 'Renamed' })

    expect(await db.listSessions()).toHaveLength(1)
    expect((await db.loadSession('a'))!.name).toBe('Renamed')
  })

  it('lists sessions newest first', async () => {
    await db.saveSession(make('old', 1))
    await db.saveSession(make('new', 2))

    expect((await db.listSessions()).map((s) => s.id)).toEqual(['new', 'old'])
  })
})

describe('active session', () => {
  it('reopens the session last marked active', async () => {
    await db.saveSession(make('a', 1))
    await db.saveSession(make('b', 2))
    await db.setActiveSessionId('a')

    expect((await db.loadActiveSession())!.id).toBe('a')
  })

  it('falls back to the most recent when nothing is marked active', async () => {
    await db.saveSession(make('a', 1))
    await db.saveSession(make('b', 2))

    expect((await db.loadActiveSession())!.id).toBe('b')
  })

  it('falls back when the active id points at a deleted session', async () => {
    await db.saveSession(make('a', 1))
    await db.saveSession(make('b', 2))
    await db.setActiveSessionId('a')
    await db.deleteSession('a')

    expect(await db.getActiveSessionId()).toBeUndefined()
    expect((await db.loadActiveSession())!.id).toBe('b')
  })

  it('returns nothing on an empty database', async () => {
    expect(await db.loadActiveSession()).toBeUndefined()
  })

  it('deleting a non-active session leaves the active pointer alone', async () => {
    await db.saveSession(make('a', 1))
    await db.saveSession(make('b', 2))
    await db.setActiveSessionId('a')
    await db.deleteSession('b')

    expect(await db.getActiveSessionId()).toBe('a')
    expect((await db.loadActiveSession())!.id).toBe('a')
  })
})
