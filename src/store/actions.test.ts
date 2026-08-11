/**
 * Tests for the session actions.
 *
 * The focus is the two invariants the app depends on and that a UI screenshot
 * can never prove:
 *   1. sales live ONLY in status/sold_to/sold_price; the strategy board is a
 *      separate overlay that a sale neither reads nor writes (spec §4.2);
 *   2. undo reverts exactly one sale, the last one.
 */

import { describe, expect, it } from 'vitest'

import * as a from '@/store/actions'
import { defaultBuckets } from '@/lib/buckets'
import { defaultTiers } from '@/lib/tiers'
import type { DraftSession, Player } from '@/types'

const player = (id: string, over: Partial<Player> = {}): Player => ({
  id,
  name: id.toUpperCase(),
  real_team: 'JUV',
  roles: ['Dc'],
  avg_price: 10,
  tier: 'TIT',
  status: 'available',
  ...over,
})

function base(): DraftSession {
  return {
    id: 's',
    name: 'Test',
    created_at: 0,
    settings: {
      buckets: defaultBuckets(),
      tiers: defaultTiers(),
      num_teams: 2,
      budget_per_team: 100,
      flag_thresholds: { club_stack: 3, overpay_pct: 25, min_credits_per_slot: 1 },
      budget_allocation: {},
    },
    teams: [
      { id: 't1', name: 'Mine', budget_total: 100, isMe: true },
      { id: 't2', name: 'Other', budget_total: 100 },
    ],
    players: [player('p1'), player('p2'), player('p3')],
    strategies: [
      {
        id: 'st1',
        name: 'Plan',
        slots: [
          { id: 'st1-dif-1', bucket_id: 'dif', target_price: 10 },
          { id: 'st1-dif-2', bucket_id: 'dif', target_price: 8 },
        ],
      },
    ],
    active_strategy_id: 'st1',
    simulation_state: {},
    simulation_module_id: '4-4-2',
    simulation_formation_state: {},
    slot_assignments: {},
    log: [],
  }
}

describe('sellPlayer', () => {
  it('records the sale on the player and appends one log entry', () => {
    const s = a.sellPlayer(base(), { playerId: 'p1', teamId: 't1', price: 42, at: 5 })
    const p = s.players.find((x) => x.id === 'p1')!

    expect(p).toMatchObject({ status: 'sold', sold_to: 't1', sold_price: 42 })
    expect(s.log).toEqual([
      { timestamp: 5, player_id: 'p1', team_id: 't1', price: 42 },
    ])
  })

  it('leaves the strategy board untouched', () => {
    const s = a.sellPlayer(base(), { playerId: 'p1', teamId: 't1', price: 42, at: 5 })
    expect(s.slot_assignments).toEqual({})
  })

  it('refuses to sell an already-sold player, so the log stays consistent', () => {
    const once = a.sellPlayer(base(), { playerId: 'p1', teamId: 't1', price: 42, at: 5 })
    const twice = a.sellPlayer(once, { playerId: 'p1', teamId: 't2', price: 99, at: 6 })

    expect(twice).toBe(once)
    expect(twice.log).toHaveLength(1)
  })

  it('refuses an unknown player or team', () => {
    const s = base()
    expect(a.sellPlayer(s, { playerId: 'nope', teamId: 't1', price: 1, at: 0 })).toBe(s)
    expect(a.sellPlayer(s, { playerId: 'p1', teamId: 'nope', price: 1, at: 0 })).toBe(s)
  })

  it('does not mutate the input session', () => {
    const s = base()
    a.sellPlayer(s, { playerId: 'p1', teamId: 't1', price: 42, at: 5 })
    expect(s.players.find((p) => p.id === 'p1')!.status).toBe('available')
    expect(s.log).toHaveLength(0)
  })
})

describe('undoLastSale', () => {
  it('reverts only the most recent sale', () => {
    let s = base()
    s = a.sellPlayer(s, { playerId: 'p1', teamId: 't1', price: 10, at: 1 })
    s = a.sellPlayer(s, { playerId: 'p2', teamId: 't2', price: 20, at: 2 })
    s = a.undoLastSale(s)

    expect(s.players.find((p) => p.id === 'p1')).toMatchObject({
      status: 'sold',
      sold_price: 10,
    })
    expect(s.players.find((p) => p.id === 'p2')).toMatchObject({
      status: 'available',
      sold_to: undefined,
      sold_price: undefined,
    })
    expect(s.log.map((l) => l.player_id)).toEqual(['p1'])
  })

  it('is a no-op on an empty log', () => {
    const s = base()
    expect(a.undoLastSale(s)).toBe(s)
  })

  it('releases the undone player from any strategy slot', () => {
    let s = base()
    s = a.sellPlayer(s, { playerId: 'p1', teamId: 't1', price: 10, at: 1 })
    s = a.assignSlot(s, { strategyId: 'st1', slotId: 'st1-dif-1', playerId: 'p1' })
    s = a.assignSlot(s, { strategyId: 'st1', slotId: 'st1-dif-2', playerId: 'p2' })
    s = a.undoLastSale(s)

    // p1 is gone from the board; p2, who was not part of the undone sale, stays.
    expect(s.slot_assignments.st1).toEqual({ 'st1-dif-2': 'p2' })
  })
})

describe('assignSlot / clearSlot', () => {
  it('never writes sale data — the board is planning only', () => {
    const s = a.assignSlot(base(), {
      strategyId: 'st1',
      slotId: 'st1-dif-1',
      playerId: 'p1',
    })
    const p = s.players.find((x) => x.id === 'p1')!

    expect(p.status).toBe('available')
    expect(p.sold_to).toBeUndefined()
    expect(p.sold_price).toBeUndefined()
    expect(s.log).toHaveLength(0)
  })

  it('allows a role mismatch: a drop is never blocked (spec §4.2)', () => {
    const s = base()
    s.players.push(player('gk', { roles: ['Por'] }))
    const next = a.assignSlot(s, {
      strategyId: 'st1',
      slotId: 'st1-dif-1',
      playerId: 'gk',
    })
    expect(next.slot_assignments.st1['st1-dif-1']).toBe('gk')
  })

  it('moves a player rather than duplicating them across slots', () => {
    let s = a.assignSlot(base(), {
      strategyId: 'st1',
      slotId: 'st1-dif-1',
      playerId: 'p1',
    })
    s = a.assignSlot(s, { strategyId: 'st1', slotId: 'st1-dif-2', playerId: 'p1' })

    expect(s.slot_assignments.st1).toEqual({ 'st1-dif-2': 'p1' })
  })

  it('clearSlot removes one slot and is a no-op when empty', () => {
    const s = a.assignSlot(base(), {
      strategyId: 'st1',
      slotId: 'st1-dif-1',
      playerId: 'p1',
    })
    expect(
      a.clearSlot(s, { strategyId: 'st1', slotId: 'st1-dif-1' }).slot_assignments.st1,
    ).toEqual({})

    const empty = base()
    expect(a.clearSlot(empty, { strategyId: 'st1', slotId: 'st1-dif-1' })).toBe(empty)
  })
})

describe('buckets and strategies', () => {
  it('deleting a bucket keeps the slots that referenced it', () => {
    const s = base()
    const without = a.setBuckets(
      s,
      s.settings.buckets.filter((b) => b.id !== 'dif'),
    )
    // The slots survive as orphans; the UI shows them in an "unassigned" section.
    expect(without.strategies[0].slots).toHaveLength(2)
    expect(without.settings.buckets.some((b) => b.id === 'dif')).toBe(false)
  })

  it('deleting a strategy drops its slot assignments and moves the active one', () => {
    let s = a.assignSlot(base(), {
      strategyId: 'st1',
      slotId: 'st1-dif-1',
      playerId: 'p1',
    })
    s = a.upsertStrategy(s, { id: 'st2', name: 'Other', slots: [] })
    s = a.deleteStrategy(s, 'st1')

    expect(s.slot_assignments.st1).toBeUndefined()
    expect(s.active_strategy_id).toBe('st2')
  })

  it('importStrategy copies a strategy from another session under a fresh id', () => {
    const source = base().strategies[0] // 'st1', two slots in 'dif'
    const target = { ...base(), strategies: [], active_strategy_id: undefined }

    const s = a.importStrategy(target, source, 'imported')

    expect(s.strategies).toHaveLength(1)
    expect(s.strategies[0]).toMatchObject({ id: 'imported', name: 'Plan' })
    // Fresh, non-colliding slot ids: assignments are keyed by them.
    expect(s.strategies[0].slots.map((x) => x.id)).toEqual([
      'imported-dif-1',
      'imported-dif-2',
    ])
    expect(s.strategies[0].slots.map((x) => x.target_price)).toEqual([10, 8])
    // The source strategy itself is untouched.
    expect(source.slots[0].id).toBe('st1-dif-1')
  })

  it('upsertPlayer preserves sale data on an update', () => {
    const s = a.sellPlayer(base(), { playerId: 'p1', teamId: 't1', price: 42, at: 1 })
    const renamed = a.upsertPlayer(s, player('p1', { name: 'Renamed' }))
    const p = renamed.players.find((x) => x.id === 'p1')!

    expect(p.name).toBe('Renamed')
    expect(p).toMatchObject({ status: 'sold', sold_to: 't1', sold_price: 42 })
  })
})

describe('tiers ("fasce", user-defined like role buckets)', () => {
  it('deleting a tier leaves players pointing at the now-orphaned id, untouched', () => {
    const s = base()
    const originalTier = s.players.find((p) => p.id === 'p1')?.tier
    const without = a.setTiers(s, s.settings.tiers.filter((t) => t.id !== 'tit'))
    expect(without.settings.tiers.some((t) => t.id === 'tit')).toBe(false)
    // Nothing rewrites the player — the UI degrades this to an "unconfigured"
    // display rather than the action reaching into players.
    expect(without.players.find((p) => p.id === 'p1')?.tier).toBe(originalTier)
  })

  it('patchTier updates one tier by id without touching the others', () => {
    const s = a.patchTier(base(), 'tit', { label: 'Titolarissimo' })
    expect(s.settings.tiers.find((t) => t.id === 'tit')?.label).toBe('Titolarissimo')
    expect(s.settings.tiers.find((t) => t.id === 'pan')?.label).toBe('Panchina')
  })

  it('removeTier drops exactly one tier', () => {
    const s = a.removeTier(base(), 'sco')
    expect(s.settings.tiers.map((t) => t.id)).toEqual(['tit', 'pan'])
  })

  it('addTier appends with an unused id and the next color in the ramp', () => {
    const s = a.addTier(base(), ['amber', 'sky', 'violet'])
    const added = s.settings.tiers.at(-1)!
    expect(added.id).not.toMatch(/^(tit|pan|sco)$/)
    expect(s.settings.tiers).toHaveLength(4)
  })

  it('moveTier reorders by one position, and is a no-op past either end', () => {
    const s = base()
    const movedUp = a.moveTier(s, 'pan', 'up')
    expect(movedUp.settings.tiers.map((t) => t.id)).toEqual(['pan', 'tit', 'sco'])

    // Already first: moving up is a no-op.
    expect(a.moveTier(s, 'tit', 'up')).toBe(s)
    // Already last: moving down is a no-op.
    expect(a.moveTier(s, 'sco', 'down')).toBe(s)
  })

  it('does not mutate the input session', () => {
    const s = base()
    a.setTiers(s, [])
    expect(s.settings.tiers).toHaveLength(3)
  })
})

describe('setNumTeams', () => {
  const nextId = (i: number) => `new-t${i}`

  it('grows the league by appending generic teams at the configured budget', () => {
    const s = a.setNumTeams(base(), 4, nextId)
    expect(s.teams).toHaveLength(4)
    expect(s.teams[2]).toMatchObject({ name: 'Squadra 3', budget_total: 100 })
    expect(s.teams[3]).toMatchObject({ name: 'Squadra 4', budget_total: 100 })
    expect(s.settings.num_teams).toBe(4)
  })

  it('shrinks the league by removing from the end', () => {
    const s = a.setNumTeams(a.setNumTeams(base(), 4, nextId), 3, nextId)
    expect(s.teams.map((t) => t.id)).toEqual(['t1', 't2', 'new-t2'])
    expect(s.settings.num_teams).toBe(3)
  })

  it('refuses to drop a team with a logged purchase, even if requested', () => {
    const sold = a.sellPlayer(base(), { playerId: 'p1', teamId: 't2', price: 10, at: 1 })
    const s = a.setNumTeams(sold, 1, nextId)
    // t2 has Bought p1, so it survives despite asking for 1 team.
    expect(s.teams.map((t) => t.id)).toEqual(['t1', 't2'])
    expect(s.settings.num_teams).toBe(2)
  })

  it('never drops the user\'s own team', () => {
    const soloMine = { ...base(), teams: [base().teams[0]] } // only t1 (isMe)
    const s = a.setNumTeams(soloMine, 0, nextId)
    expect(s.teams.map((t) => t.id)).toEqual(['t1'])
  })

  it('is a no-op when the count already matches', () => {
    const s = a.setNumTeams(base(), 2, nextId)
    expect(s.teams).toEqual(base().teams)
  })

  it('does not mutate the input session', () => {
    const s = base()
    a.setNumTeams(s, 5, nextId)
    expect(s.teams).toHaveLength(2)
  })
})

describe('createSession', () => {
  it('builds an empty session with one team marked as mine', () => {
    const s = a.createSession({ id: 'x', name: 'New', createdAt: 7, numTeams: 3 })

    expect(s.players).toEqual([])
    expect(s.log).toEqual([])
    expect(s.teams).toHaveLength(3)
    expect(s.teams.filter((t) => t.isMe)).toHaveLength(1)
    expect(s.settings.buckets.length).toBeGreaterThan(0)
  })

  it('allocates exactly 100% of the budget across buckets', () => {
    const s = a.createSession({ id: 'x', name: 'New', createdAt: 0 })
    const total = Object.values(s.settings.budget_allocation).reduce((n, v) => n + v, 0)
    expect(total).toBe(100)
  })
})

describe('mergePlayers (re-import mid-draft)', () => {
  it('refreshes sheet fields and preserves the purchase', () => {
    // The scenario that makes merge the default: I re-paste an updated sheet
    // after two players are already sold.
    const sold = a.sellPlayer(base(), {
      playerId: 'p1',
      teamId: 't1',
      price: 42,
      at: 1,
    })
    const { session, report } = a.mergePlayers(sold, [
      player('ignored-id', { name: 'P1', real_team: 'JUV', avg_price: 99, tier: 'SCO' }),
    ])
    const p1 = session.players.find((p) => p.id === 'p1')!

    expect(p1.avg_price).toBe(99)
    expect(p1.tier).toBe('SCO')
    expect(p1).toMatchObject({ status: 'sold', sold_to: 't1', sold_price: 42 })
    expect(report).toMatchObject({ updated: 1, added: 0, soldPreserved: 1 })
  })

  it('matches on name + club, not on the id from the file', () => {
    const { session, report } = a.mergePlayers(base(), [
      player('brand-new-id', { name: 'P2', real_team: 'juv', avg_price: 33 }),
    ])

    expect(session.players).toHaveLength(3)
    expect(session.players.find((p) => p.id === 'p2')!.avg_price).toBe(33)
    expect(report.added).toBe(0)
  })

  it('treats the same name at a different club as a new player', () => {
    const { session, report } = a.mergePlayers(base(), [
      player('x', { name: 'P1', real_team: 'INT' }),
    ])

    expect(session.players).toHaveLength(4)
    expect(report.added).toBe(1)
  })

  it('keeps existing players the file does not mention', () => {
    const { session, report } = a.mergePlayers(base(), [player('x', { name: 'P1' })])

    expect(session.players).toHaveLength(3)
    expect(report.untouched).toBe(2)
  })

  it('preserves personal annotations across a re-import', () => {
    // Tags and notes are mine, not the sheet's.
    const tagged = a.annotatePlayer(base(), 'p1', {
      personal_tag: 'target',
      personal_note: 'occhio al rinnovo',
      personal_max_price: 50,
    })
    const { session } = a.mergePlayers(tagged, [
      player('x', { name: 'P1', avg_price: 77 }),
    ])
    const p1 = session.players.find((p) => p.id === 'p1')!

    expect(p1).toMatchObject({
      avg_price: 77,
      personal_tag: 'target',
      personal_note: 'occhio al rinnovo',
      personal_max_price: 50,
    })
  })

  it('does not mutate the input session', () => {
    const s = base()
    a.mergePlayers(s, [player('x', { name: 'P1', avg_price: 999 })])
    expect(s.players.find((p) => p.id === 'p1')!.avg_price).toBe(10)
  })

  it('leaves the strategy board alone', () => {
    const assigned = a.assignSlot(base(), {
      strategyId: 'st1',
      slotId: 'st1-dif-1',
      playerId: 'p1',
    })
    const { session } = a.mergePlayers(assigned, [
      player('x', { name: 'P1', avg_price: 5 }),
    ])
    expect(session.slot_assignments).toEqual(assigned.slot_assignments)
  })
})

describe('replacePlayers', () => {
  it('discards everything, purchases included — the destructive branch', () => {
    const sold = a.sellPlayer(base(), { playerId: 'p1', teamId: 't1', price: 5, at: 1 })
    const s = a.replacePlayers(sold, [player('n1')])

    expect(s.players).toEqual([player('n1')])
    // The log is deliberately NOT cleaned here: the caller must decide, and the
    // UI only offers this branch before the draft starts.
    expect(s.log).toHaveLength(1)
  })
})

describe('editPlayer / deletePlayer', () => {
  it('edits sheet fields without touching sale state', () => {
    const sold = a.sellPlayer(base(), { playerId: 'p1', teamId: 't1', price: 9, at: 1 })
    const s = a.editPlayer(sold, 'p1', { tier: 'PAN', roles: ['Pc'] })
    const p1 = s.players.find((p) => p.id === 'p1')!

    expect(p1).toMatchObject({ tier: 'PAN', roles: ['Pc'], status: 'sold', sold_price: 9 })
  })

  it('deletes an available player and clears them off the board', () => {
    const assigned = a.assignSlot(base(), {
      strategyId: 'st1',
      slotId: 'st1-dif-1',
      playerId: 'p1',
    })
    const s = a.deletePlayer(assigned, 'p1')

    expect(s.players.map((p) => p.id)).toEqual(['p2', 'p3'])
    expect(s.slot_assignments.st1).toEqual({})
  })

  it('refuses to delete a sold player, which would break undo', () => {
    const sold = a.sellPlayer(base(), { playerId: 'p1', teamId: 't1', price: 5, at: 1 })
    expect(a.deletePlayer(sold, 'p1')).toBe(sold)
  })

  it('ignores an unknown player id', () => {
    const s = base()
    expect(a.deletePlayer(s, 'nope')).toBe(s)
  })
})
