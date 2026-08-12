import { describe, expect, it } from 'vitest'

import { defaultBuckets } from '@/lib/buckets'
import {defaultPrepFilters} from '@/lib/prep'
import { parseSessionFile, serializeSession, sessionFileName } from '@/lib/sessionFile'
import { defaultTiers } from '@/lib/tiers'
import type { DraftSession } from '@/types'

function base(): DraftSession {
  return {
    id: 's1',
    name: 'Lega Mantra',
    created_at: 0,
    settings: {
      buckets: defaultBuckets(),
      tiers: defaultTiers(),
      num_teams: 1,
      budget_per_team: 500,
      flag_thresholds: { club_stack: 3, overpay_pct: 25, min_credits_per_slot: 1 },
      budget_allocation: {},
    },
    teams: [{ id: 't1', name: 'Mine', budget_total: 500, isMe: true }],
    players: [],
    strategies: [],
    simulation_state: {},
    simulation_module_id: '4-4-2',
    simulation_formation_state: {},
    slot_assignments: {},
    log: [],
    prep_filters: defaultPrepFilters(),
  }
}

describe('serializeSession / parseSessionFile round-trip', () => {
  it('a serialized session parses back to an equivalent object', () => {
    const session = base()
    const parsed = parseSessionFile(serializeSession(session))
    expect(parsed.error).toBeUndefined()
    expect(parsed.session).toEqual(session)
  })
})

describe('parseSessionFile', () => {
  it('rejects invalid JSON', () => {
    const parsed = parseSessionFile('{not json')
    expect(parsed.error).toBeDefined()
    expect(parsed.session).toBeUndefined()
  })

  it('rejects a bare primitive', () => {
    expect(parseSessionFile('42').error).toBeDefined()
  })

  it('rejects an array — it has no session keys, even though typeof is "object"', () => {
    const parsed = parseSessionFile('[1,2,3]')
    expect(parsed.error).toMatch(/incompleto/)
    expect(parsed.session).toBeUndefined()
  })

  it('rejects an object missing required session keys', () => {
    const parsed = parseSessionFile(JSON.stringify({ id: 'x', name: 'y' }))
    expect(parsed.error).toMatch(/incompleto/)
    expect(parsed.session).toBeUndefined()
  })

  it('accepts an object with all required keys present', () => {
    const parsed = parseSessionFile(serializeSession(base()))
    expect(parsed.error).toBeUndefined()
    expect(parsed.session?.id).toBe('s1')
  })
})

describe('sessionFileName', () => {
  it('slugifies the session name and appends the export date', () => {
    const name = sessionFileName(base(), Date.parse('2026-08-30T12:00:00Z'))
    expect(name).toBe('fantadraft-lega-mantra-2026-08-30.json')
  })

  it('strips accents so the filename stays ASCII-safe', () => {
    const session = { ...base(), name: 'Asta perché sì' }
    const name = sessionFileName(session, Date.parse('2026-01-01T00:00:00Z'))
    expect(name).toBe('fantadraft-asta-perche-si-2026-01-01.json')
  })

  it('falls back to a generic name when the session name has no ascii-mappable characters', () => {
    const session = { ...base(), name: '!!!' }
    const name = sessionFileName(session, Date.parse('2026-01-01T00:00:00Z'))
    expect(name).toBe('fantadraft-sessione-2026-01-01.json')
  })
})
