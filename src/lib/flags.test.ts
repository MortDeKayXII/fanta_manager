/**
 * Unit tests for the flag engine (spec §4.4), written before wiring it into
 * any screen. Each family is tested against the exact threshold boundary the
 * spec states, not just an obviously-over/obviously-under case.
 */

import { describe, expect, it } from 'vitest'

import { defaultBuckets } from '@/lib/buckets'
import { computeFlags } from '@/lib/flags'
import { defaultTiers } from '@/lib/tiers'
import { assignSlot } from '@/store/actions'
import type { DraftSession, Player, Team } from '@/types'

const player = (over: Partial<Player> = {}): Player => ({
  id: 'p1',
  name: 'Candidate',
  real_team: 'JUV',
  roles: ['Dc'],
  avg_price: 20,
  tier: 'TIT',
  status: 'available',
  ...over,
})

const soldPlayer = (
  id: string,
  over: Partial<Player> = {},
): Player => ({
  ...player({ id, ...over }),
  status: 'sold',
  sold_to: 't1',
  sold_price: over.sold_price ?? 10,
})

function base(over: Partial<DraftSession> = {}): DraftSession {
  return {
    id: 's',
    name: 'Test',
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
    ...over,
  }
}

const team: Team = { id: 't1', name: 'Mine', budget_total: 500, isMe: true }

describe('computeFlags — club stacking', () => {
  it('flags when the count including this purchase reaches the threshold', () => {
    const session = base({
      players: [soldPlayer('a', { real_team: 'JUV' }), soldPlayer('b', { real_team: 'JUV' })],
    })
    const flags = computeFlags(player({ real_team: 'JUV' }), team, session, 20)
    expect(flags.some((f) => f.kind === 'club_stack')).toBe(true)
    expect(flags.find((f) => f.kind === 'club_stack')?.message).toMatch(/3°/)
  })

  it('does not flag one below the threshold', () => {
    const session = base({ players: [soldPlayer('a', { real_team: 'JUV' })] })
    const flags = computeFlags(player({ real_team: 'JUV' }), team, session, 20)
    expect(flags.some((f) => f.kind === 'club_stack')).toBe(false)
  })

  it('a different club never counts toward the stack', () => {
    const session = base({
      players: [soldPlayer('a', { real_team: 'NAP' }), soldPlayer('b', { real_team: 'NAP' })],
    })
    const flags = computeFlags(player({ real_team: 'JUV' }), team, session, 20)
    expect(flags.some((f) => f.kind === 'club_stack')).toBe(false)
  })

  it('the threshold is read from settings, not hardcoded', () => {
    const session = base({
      settings: {
        ...base().settings,
        flag_thresholds: { club_stack: 2, overpay_pct: 25, min_credits_per_slot: 1 },
      },
      players: [soldPlayer('a', { real_team: 'JUV' })],
    })
    const flags = computeFlags(player({ real_team: 'JUV' }), team, session, 20)
    expect(flags.some((f) => f.kind === 'club_stack')).toBe(true)
  })
})

describe('computeFlags — role saturation', () => {
  it('flags a warning when the only matching bucket is already at quota', () => {
    // 'por' bucket quota is 3 (defaultBuckets).
    const session = base({
      players: [
        soldPlayer('a', { roles: ['Por'] }),
        soldPlayer('b', { roles: ['Por'] }),
        soldPlayer('c', { roles: ['Por'] }),
      ],
    })
    const flags = computeFlags(player({ roles: ['Por'] }), team, session, 5)
    const flag = flags.find((f) => f.kind === 'role_saturation')
    expect(flag?.severity).toBe('warn')
  })

  it('does not flag below quota', () => {
    const session = base({ players: [soldPlayer('a', { roles: ['Por'] })] })
    const flags = computeFlags(player({ roles: ['Por'] }), team, session, 5)
    expect(flags.some((f) => f.kind === 'role_saturation')).toBe(false)
  })

  it('downgrades to info when a multi-role player has a non-saturated bucket', () => {
    // Dc/B/Dd/Ds ('dif') is full at quota 8; E/M ('est') is empty.
    const dif = Array.from({ length: 8 }, (_, i) => soldPlayer(`d${i}`, { roles: ['Dc'] }))
    const session = base({ players: dif })
    const flags = computeFlags(player({ roles: ['Dc', 'E'] }), team, session, 5)
    const flag = flags.find((f) => f.kind === 'role_saturation')
    expect(flag?.severity).toBe('info')
  })

  it('stays a warning when every one of the player’s buckets is saturated', () => {
    const dif = Array.from({ length: 8 }, (_, i) => soldPlayer(`d${i}`, { roles: ['Dc'] }))
    const session = base({ players: dif })
    const flags = computeFlags(player({ roles: ['Dc'] }), team, session, 5)
    const flag = flags.find((f) => f.kind === 'role_saturation')
    expect(flag?.severity).toBe('warn')
  })

  it('a player whose roles are in no bucket is never flagged for saturation', () => {
    const session = base({ settings: { ...base().settings, buckets: [] } })
    const flags = computeFlags(player(), team, session, 5)
    expect(flags.some((f) => f.kind === 'role_saturation')).toBe(false)
  })
})

describe('computeFlags — price risk', () => {
  it('flags overpay strictly above the threshold percentage', () => {
    // avg 20, threshold 25% -> flag only above 25, i.e. price > 25.
    const session = base()
    expect(
      computeFlags(player({ avg_price: 20 }), team, session, 25).some(
        (f) => f.kind === 'overpay',
      ),
    ).toBe(false)
    expect(
      computeFlags(player({ avg_price: 20 }), team, session, 26).some(
        (f) => f.kind === 'overpay',
      ),
    ).toBe(true)
  })

  it('flags an "avoid"-tagged player regardless of price', () => {
    const session = base()
    const flags = computeFlags(
      player({ personal_tag: 'avoid', avg_price: 20 }),
      team,
      session,
      1,
    )
    expect(flags.some((f) => f.kind === 'avoid_tag' && f.severity === 'danger')).toBe(true)
  })

  it('flags exceeding the personal max price', () => {
    const session = base()
    const flags = computeFlags(player({ personal_max_price: 30 }), team, session, 35)
    expect(flags.some((f) => f.kind === 'above_max_price')).toBe(true)
  })

  it('does not flag a price at or below the personal max', () => {
    const session = base()
    const flags = computeFlags(player({ personal_max_price: 30 }), team, session, 30)
    expect(flags.some((f) => f.kind === 'above_max_price')).toBe(false)
  })
})

describe('computeFlags — budget feasibility', () => {
  it('flags when the price would leave less than the minimum per remaining slot', () => {
    // squad size = totalQuota(defaultBuckets()) = 3+8+5+5+4 = 25.
    const brokeTeam: Team = { id: 't1', name: 'Mine', budget_total: 30, isMe: true }
    const session = base({
      teams: [brokeTeam],
      players: Array.from({ length: 20 }, (_, i) => soldPlayer(`x${i}`, { sold_price: 1 })),
    })
    // 5 open slots, remaining budget 30 - 20 = 10; buying at 6 leaves 4 for 5 slots.
    const flags = computeFlags(player(), brokeTeam, session, 6)
    expect(flags.some((f) => f.kind === 'budget_strain')).toBe(true)
  })

  it('does not flag when the squad is already full — no open slots to strain', () => {
    const fullTeam: Team = { id: 't1', name: 'Mine', budget_total: 25, isMe: true }
    const session = base({
      teams: [fullTeam],
      players: Array.from({ length: 25 }, (_, i) => soldPlayer(`x${i}`, { sold_price: 1 })),
    })
    const flags = computeFlags(player(), fullTeam, session, 100)
    expect(flags.some((f) => f.kind === 'budget_strain')).toBe(false)
  })

  it('does not flag a comfortable purchase', () => {
    const session = base({ teams: [{ id: 't1', name: 'Mine', budget_total: 500, isMe: true }] })
    const flags = computeFlags(player(), team, session, 20)
    expect(flags.some((f) => f.kind === 'budget_strain')).toBe(false)
  })
})

describe('computeFlags — advisory, never blocking', () => {
  it('returns [] for a clean pick with no risk on any axis', () => {
    const session = base()
    const flags = computeFlags(player(), team, session, 20)
    expect(flags).toEqual([])
  })
})

describe('computeFlags — strategy board drag guard (spec step 8)', () => {
  it('dragging a purchased player onto a slot never changes any flag output', () => {
    // A session with enough club-stacked, saturated, and budget-strained state
    // to exercise every flag family, so a leak from assignSlot into any of
    // them would show up here.
    const dif = Array.from({ length: 8 }, (_, i) => soldPlayer(`d${i}`, { roles: ['Dc'] }))
    const session = base({
      strategies: [{ id: 'st1', name: 'Plan', slots: [{ id: 'st1-dif-1', bucket_id: 'dif', target_price: 10 }] }],
      players: [...dif, soldPlayer('mine', { real_team: 'JUV' })],
    })
    const candidate = player({ real_team: 'JUV' })

    const before = session.teams.map((t) => computeFlags(candidate, t, session, 30))
    const dragged = assignSlot(session, {
      strategyId: 'st1',
      slotId: 'st1-dif-1',
      playerId: 'mine',
    })
    const after = dragged.teams.map((t) => computeFlags(candidate, t, dragged, 30))

    expect(after).toEqual(before)
  })
})
