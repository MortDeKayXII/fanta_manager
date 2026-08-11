/**
 * Session actions (plan step 2).
 *
 * Every mutation the app performs, as a pure `DraftSession -> DraftSession`
 * function. Keeping them here rather than inside the provider means they can be
 * unit-tested without React or IndexedDB, and the provider stays a thin binding
 * of "run action, persist result".
 *
 * Two invariants hold across this whole module:
 *  - `status`/`sold_to`/`sold_price` on a Player are the ONLY record of a sale.
 *    `slot_assignments` is a separate planning overlay (spec §4.2) and is never
 *    written by a sale, nor read by one.
 *  - `log` is append-only except for `undoLastSale`, which pops exactly one entry
 *    and reverts precisely that player.
 */

import { defaultBuckets } from '@/lib/buckets'
import { defaultTiers } from '@/lib/tiers'
import type {
  DraftSession,
  MantraRole,
  Player,
  RoleBucket,
  Settings,
  Strategy,
  Team,
  TierDef,
} from '@/types'

// --- Sales ------------------------------------------------------------------

/**
 * Record a purchase. Idempotent in the sense that re-selling an already-sold
 * player is refused: the caller must undo first, so the log can never contain
 * two open sales for one player.
 */
export function sellPlayer(
  session: DraftSession,
  { playerId, teamId, price, at }: {
    playerId: string
    teamId: string
    price: number
    /** Timestamp, injected so callers/tests control it. */
    at: number
  },
): DraftSession {
  const player = session.players.find((p) => p.id === playerId)
  if (!player || player.status === 'sold') return session
  if (!session.teams.some((t) => t.id === teamId)) return session

  return {
    ...session,
    players: session.players.map((p) =>
      p.id === playerId
        ? { ...p, status: 'sold', sold_to: teamId, sold_price: price }
        : p,
    ),
    log: [...session.log, { timestamp: at, player_id: playerId, team_id: teamId, price }],
  }
}

/**
 * Revert the most recent sale.
 *
 * Also clears any strategy slot that pointed at that player: the player is no
 * longer owned, so leaving them on the board would show a purchase that did not
 * happen. This is the one place the two data slices legitimately meet.
 */
export function undoLastSale(session: DraftSession): DraftSession {
  const last = session.log.at(-1)
  if (!last) return session

  const slot_assignments = Object.fromEntries(
    Object.entries(session.slot_assignments).map(([strategyId, slots]) => [
      strategyId,
      Object.fromEntries(
        Object.entries(slots).filter(([, playerId]) => playerId !== last.player_id),
      ),
    ]),
  )

  return {
    ...session,
    players: session.players.map((p) =>
      p.id === last.player_id
        ? { ...p, status: 'available', sold_to: undefined, sold_price: undefined }
        : p,
    ),
    slot_assignments,
    log: session.log.slice(0, -1),
  }
}

// --- Players ----------------------------------------------------------------

/** Insert or replace a player by id, preserving sale fields on an update. */
export function upsertPlayer(session: DraftSession, player: Player): DraftSession {
  const exists = session.players.some((p) => p.id === player.id)
  return {
    ...session,
    players: exists
      ? session.players.map((p) =>
          p.id === player.id
            ? { ...player, status: p.status, sold_to: p.sold_to, sold_price: p.sold_price }
            : p,
        )
      : [...session.players, player],
  }
}

/** Replace the whole player list — the "start over" branch of CSV import. */
export function replacePlayers(
  session: DraftSession,
  players: Player[],
): DraftSession {
  return { ...session, players }
}

/** Identity for imported players: the sheet has no ids, so name + club is the key. */
function importKey(p: Pick<Player, 'name' | 'real_team'>): string {
  return `${p.name.trim().toLowerCase()}|${p.real_team.trim().toUpperCase()}`
}

export interface MergeReport {
  added: number
  updated: number
  /** Existing players the incoming file did not mention. */
  untouched: number
  /** Sold players whose data was refreshed — their purchase was preserved. */
  soldPreserved: number
}

/**
 * Merge an imported list into the existing one, matching on name + club.
 *
 * This is the safe branch of import, and the one that matters mid-draft: a
 * re-imported sheet must refresh prices and tiers without forgetting who has
 * already been bought. Sale fields (`status`/`sold_to`/`sold_price`) and personal
 * annotations therefore always survive, and existing players absent from the file
 * are kept rather than deleted — an incomplete paste is far likelier than a
 * genuine intent to drop players.
 */
export function mergePlayers(
  session: DraftSession,
  incoming: Player[],
): { session: DraftSession; report: MergeReport } {
  const byKey = new Map(incoming.map((p) => [importKey(p), p]))
  const report: MergeReport = { added: 0, updated: 0, untouched: 0, soldPreserved: 0 }

  const players = session.players.map((existing) => {
    const match = byKey.get(importKey(existing))
    if (!match) {
      report.untouched++
      return existing
    }
    byKey.delete(importKey(existing))
    report.updated++
    if (existing.status === 'sold') report.soldPreserved++

    return {
      ...existing,
      // Refreshed from the sheet.
      name: match.name,
      real_team: match.real_team,
      roles: match.roles,
      avg_price: match.avg_price,
      tier: match.tier,
      // Everything else — sale state and personal annotations — is mine, not the
      // sheet's, and is deliberately left as it was.
    }
  })

  const added = [...byKey.values()]
  report.added = added.length

  return { session: { ...session, players: [...players, ...added] }, report }
}

/**
 * Edit a player's sheet-side fields by hand (spec §3: "I may want to hand-tweak
 * tiers/notes after import"). Cannot touch sale state — that is `sellPlayer`'s job.
 */
export function editPlayer(
  session: DraftSession,
  playerId: string,
  patch: Partial<Pick<Player, 'name' | 'real_team' | 'roles' | 'avg_price' | 'tier'>>,
): DraftSession {
  return {
    ...session,
    players: session.players.map((p) => (p.id === playerId ? { ...p, ...patch } : p)),
  }
}

/**
 * Remove a player from the database.
 *
 * Refused for a sold player: the draft log references them by id, so deleting one
 * would leave an entry pointing at nothing and break undo. Undo the sale first.
 */
export function deletePlayer(session: DraftSession, playerId: string): DraftSession {
  const player = session.players.find((p) => p.id === playerId)
  if (!player || player.status === 'sold') return session

  const slot_assignments = Object.fromEntries(
    Object.entries(session.slot_assignments).map(([strategyId, slots]) => [
      strategyId,
      Object.fromEntries(Object.entries(slots).filter(([, id]) => id !== playerId)),
    ]),
  )

  return {
    ...session,
    players: session.players.filter((p) => p.id !== playerId),
    slot_assignments,
  }
}

/** Personal annotations (tag, note, max price) — never touches sale data. */
export function annotatePlayer(
  session: DraftSession,
  playerId: string,
  patch: Pick<Player, 'personal_tag' | 'personal_note' | 'personal_max_price'>,
): DraftSession {
  return {
    ...session,
    players: session.players.map((p) =>
      p.id === playerId ? { ...p, ...patch } : p,
    ),
  }
}

// --- Strategy slots (planning overlay only) ---------------------------------

/**
 * Put a player on a strategy slot. Always allowed, even on a role mismatch —
 * mismatch is styling, never a block (spec §4.2). A player can occupy only one
 * slot per strategy, so any previous slot holding them is released.
 */
export function assignSlot(
  session: DraftSession,
  { strategyId, slotId, playerId }: {
    strategyId: string
    slotId: string
    playerId: string
  },
): DraftSession {
  const current = session.slot_assignments[strategyId] ?? {}
  const next = Object.fromEntries(
    Object.entries(current).filter(([, id]) => id !== playerId),
  )
  next[slotId] = playerId

  return {
    ...session,
    slot_assignments: { ...session.slot_assignments, [strategyId]: next },
  }
}

export function clearSlot(
  session: DraftSession,
  { strategyId, slotId }: { strategyId: string; slotId: string },
): DraftSession {
  const current = session.slot_assignments[strategyId]
  if (!current || !(slotId in current)) return session

  const next = { ...current }
  delete next[slotId]
  return {
    ...session,
    slot_assignments: { ...session.slot_assignments, [strategyId]: next },
  }
}

// --- Settings, teams, strategies -------------------------------------------

export function updateSettings(
  session: DraftSession,
  patch: Partial<Settings>,
): DraftSession {
  return { ...session, settings: { ...session.settings, ...patch } }
}

/**
 * Replace the bucket list. Strategy slots are left alone on purpose: they
 * reference `bucket_id`, and a slot whose bucket was deleted degrades to an
 * "unassigned" section rather than being destroyed (see IMPLEMENTATION_PLAN).
 */
export function setBuckets(
  session: DraftSession,
  buckets: RoleBucket[],
): DraftSession {
  return updateSettings(session, { buckets })
}

/**
 * Patch one bucket in place.
 *
 * Deliberately takes an id + patch rather than a rebuilt array: a caller that
 * maps over the buckets it captured at render time will clobber any edit made
 * since, which loses a field when two inputs are changed in quick succession.
 */
export function patchBucket(
  session: DraftSession,
  bucketId: string,
  patch: Partial<RoleBucket>,
): DraftSession {
  return setBuckets(
    session,
    session.settings.buckets.map((b) =>
      b.id === bucketId ? { ...b, ...patch } : b,
    ),
  )
}

/** Add or remove a role on a bucket. A role may sit in several buckets, or none. */
export function toggleBucketRole(
  session: DraftSession,
  bucketId: string,
  role: MantraRole,
): DraftSession {
  return setBuckets(
    session,
    session.settings.buckets.map((b) =>
      b.id === bucketId
        ? {
            ...b,
            roles: b.roles.includes(role)
              ? b.roles.filter((r) => r !== role)
              : [...b.roles, role],
          }
        : b,
    ),
  )
}

export function removeBucket(
  session: DraftSession,
  bucketId: string,
): DraftSession {
  return setBuckets(
    session,
    session.settings.buckets.filter((b) => b.id !== bucketId),
  )
}

/** Append a bucket, choosing an unused id and the next color in the ramp. */
export function addBucket(
  session: DraftSession,
  colors: readonly RoleBucket['color'][],
): DraftSession {
  const buckets = session.settings.buckets
  const taken = new Set(buckets.map((b) => b.id))
  let n = buckets.length + 1
  while (taken.has(`bucket-${n}`)) n++

  return setBuckets(session, [
    ...buckets,
    {
      id: `bucket-${n}`,
      label: `Nuovo reparto ${n}`,
      roles: [],
      quota: 1,
      color: colors[buckets.length % colors.length],
    },
  ])
}

/**
 * Replace the tier ("fascia") list. Players keep whatever tier id they had —
 * a deleted tier degrades to an "unconfigured" fallback in the UI (mirrors
 * `setBuckets`' treatment of orphaned strategy slots) rather than being
 * silently reassigned.
 */
export function setTiers(session: DraftSession, tiers: TierDef[]): DraftSession {
  return updateSettings(session, { tiers })
}

/** Patch one tier in place, by id — same reasoning as `patchBucket`. */
export function patchTier(
  session: DraftSession,
  tierId: string,
  patch: Partial<TierDef>,
): DraftSession {
  return setTiers(
    session,
    session.settings.tiers.map((t) => (t.id === tierId ? { ...t, ...patch } : t)),
  )
}

export function removeTier(session: DraftSession, tierId: string): DraftSession {
  return setTiers(
    session,
    session.settings.tiers.filter((t) => t.id !== tierId),
  )
}

/** Append a tier, choosing an unused id and the next color in the ramp. */
export function addTier(
  session: DraftSession,
  colors: readonly TierDef['color'][],
): DraftSession {
  const tiers = session.settings.tiers
  const taken = new Set(tiers.map((t) => t.id))
  let n = tiers.length + 1
  while (taken.has(`tier-${n}`)) n++

  return setTiers(session, [
    ...tiers,
    {
      id: `tier-${n}`,
      label: `Nuova fascia ${n}`,
      color: colors[tiers.length % colors.length],
    },
  ])
}

/**
 * Move a tier one position earlier or later in the list. Order is meaningful
 * here (unlike buckets): it drives the ordinal sort on the Prep board, so
 * reordering is a first-class action rather than something achieved by
 * delete+re-add.
 */
export function moveTier(
  session: DraftSession,
  tierId: string,
  direction: 'up' | 'down',
): DraftSession {
  const tiers = [...session.settings.tiers]
  const i = tiers.findIndex((t) => t.id === tierId)
  const j = direction === 'up' ? i - 1 : i + 1
  if (i === -1 || j < 0 || j >= tiers.length) return session

  ;[tiers[i], tiers[j]] = [tiers[j], tiers[i]]
  return setTiers(session, tiers)
}

export function updateTeam(
  session: DraftSession,
  teamId: string,
  patch: Partial<Team>,
): DraftSession {
  return {
    ...session,
    teams: session.teams.map((t) => (t.id === teamId ? { ...t, ...patch } : t)),
  }
}

/**
 * Resize the league to `count` teams (Setup/Settings "Numero di squadre").
 *
 * Growing appends generically-named teams at the current `budget_per_team`.
 * Shrinking removes from the end, but stops as soon as it would drop a team
 * with a logged purchase or the user's own team (`isMe`) — those removals
 * would orphan `sold_to`/`sold_price` and the draft log, so the resulting
 * team count may be higher than requested rather than corrupting a sale.
 * `newTeamId` is injected (not generated here) so the action stays pure.
 */
export function setNumTeams(
  session: DraftSession,
  count: number,
  newTeamId: (index: number) => string,
): DraftSession {
  const target = Math.max(1, Math.floor(count))
  let teams = session.teams

  if (target > teams.length) {
    const additions = Array.from({ length: target - teams.length }, (_, i) => {
      const index = teams.length + i
      return {
        id: newTeamId(index),
        name: `Squadra ${index + 1}`,
        budget_total: session.settings.budget_per_team,
      }
    })
    teams = [...teams, ...additions]
  } else if (target < teams.length) {
    while (teams.length > target) {
      const last = teams[teams.length - 1]
      const hasPurchases = session.players.some((p) => p.sold_to === last.id)
      if (last.isMe || hasPurchases) break
      teams = teams.slice(0, -1)
    }
  }

  return {
    ...session,
    teams,
    settings: { ...session.settings, num_teams: teams.length },
  }
}

export function upsertStrategy(
  session: DraftSession,
  strategy: Strategy,
): DraftSession {
  const exists = session.strategies.some((s) => s.id === strategy.id)
  return {
    ...session,
    strategies: exists
      ? session.strategies.map((s) => (s.id === strategy.id ? strategy : s))
      : [...session.strategies, strategy],
  }
}

/**
 * Copy a strategy from another session into this one (spec §4.3: "can be reused
 * across multiple draft sessions since it's just role-group + price targets").
 *
 * Fresh strategy + slot ids are assigned, because `slot_assignments` is keyed
 * by them and the source session's ids mean nothing here. `bucket_id` is left
 * as-is: if this session's buckets don't have a matching id, the slot degrades
 * to the existing "unassigned" section rather than being rewritten or dropped.
 */
export function importStrategy(
  session: DraftSession,
  source: Strategy,
  newId: string,
): DraftSession {
  return upsertStrategy(session, {
    ...source,
    id: newId,
    slots: source.slots.map((slot, i) => ({
      ...slot,
      id: `${newId}-${slot.bucket_id}-${i + 1}`,
    })),
  })
}

/** Deleting a strategy also drops its slot assignments — they are meaningless. */
export function deleteStrategy(
  session: DraftSession,
  strategyId: string,
): DraftSession {
  const slot_assignments = { ...session.slot_assignments }
  delete slot_assignments[strategyId]

  const strategies = session.strategies.filter((s) => s.id !== strategyId)
  return {
    ...session,
    strategies,
    slot_assignments,
    active_strategy_id:
      session.active_strategy_id === strategyId
        ? strategies[0]?.id
        : session.active_strategy_id,
  }
}

export function setActiveStrategy(
  session: DraftSession,
  strategyId: string | undefined,
): DraftSession {
  return { ...session, active_strategy_id: strategyId }
}

export function renameSession(session: DraftSession, name: string): DraftSession {
  return { ...session, name }
}

// --- Session factory --------------------------------------------------------

const DEFAULT_THRESHOLDS = {
  club_stack: 3,
  overpay_pct: 25,
  min_credits_per_slot: 1,
}

/**
 * An empty session: default buckets, teams named generically, no players.
 *
 * `id` and `created_at` are injected rather than generated so callers and tests
 * stay deterministic.
 */
export function createSession({
  id,
  name,
  createdAt,
  numTeams = 8,
  budgetPerTeam = 500,
  myTeamName = 'La mia squadra',
}: {
  id: string
  name: string
  createdAt: number
  numTeams?: number
  budgetPerTeam?: number
  myTeamName?: string
}): DraftSession {
  const buckets = defaultBuckets()
  const tiers = defaultTiers()

  const teams: Team[] = Array.from({ length: Math.max(1, numTeams) }, (_, i) => ({
    id: `${id}-t${i + 1}`,
    name: i === 0 ? myTeamName : `Squadra ${i + 1}`,
    budget_total: budgetPerTeam,
    ...(i === 0 ? { isMe: true } : {}),
  }))

  return {
    id,
    name,
    created_at: createdAt,
    settings: {
      buckets,
      tiers,
      num_teams: teams.length,
      budget_per_team: budgetPerTeam,
      flag_thresholds: { ...DEFAULT_THRESHOLDS },
      budget_allocation: evenAllocation(buckets),
    },
    teams,
    players: [],
    strategies: [],
    slot_assignments: {},
    log: [],
  }
}

/** Split 100% across the buckets, giving the remainder to the first one. */
function evenAllocation(buckets: RoleBucket[]): Record<string, number> {
  if (buckets.length === 0) return {}
  const share = Math.floor(100 / buckets.length)
  const out: Record<string, number> = {}
  for (const b of buckets) out[b.id] = share
  out[buckets[0].id] += 100 - share * buckets.length
  return out
}

// --- Manual player entry ----------------------------------------------------

/** Build a Player from the manual "add player" form (spec §3). */
export function makePlayer({
  id,
  name,
  realTeam,
  roles,
  avgPrice,
  tier,
}: {
  id: string
  name: string
  realTeam: string
  roles: MantraRole[]
  avgPrice: number
  tier: string
}): Player {
  return {
    id,
    name: name.trim(),
    real_team: realTeam.trim().toUpperCase(),
    roles,
    avg_price: avgPrice,
    tier,
    status: 'available',
  }
}
