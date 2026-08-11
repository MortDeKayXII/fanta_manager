/**
 * Bucket helpers. Buckets are user-defined (see types.ts / RoleBucket), so all
 * bucket reasoning lives here and every screen iterates `settings.buckets`
 * rather than assuming a fixed set.
 */

import {
  MANTRA_ROLES,
  type MantraRole,
  type Player,
  type RoleBucket,
  type Settings,
} from '@/types'

/** The default preset shipped with the app (spec §1 defaults). Editable. */
export function defaultBuckets(): RoleBucket[] {
  return [
    { id: 'por', label: 'Portieri', roles: ['Por'], quota: 3, color: 'amber' },
    {
      id: 'dif',
      label: 'Difensori',
      roles: ['Dc', 'B', 'Dd', 'Ds'],
      quota: 8,
      color: 'sky',
    },
    {
      id: 'est',
      label: 'Esterni/Mediani',
      roles: ['E', 'M'],
      quota: 5,
      color: 'teal',
    },
    {
      id: 'coff',
      label: 'Centrocampisti offensivi',
      roles: ['C', 'T'],
      quota: 5,
      color: 'violet',
    },
    {
      id: 'att',
      label: 'Attaccanti',
      roles: ['W', 'A', 'Pc'],
      quota: 4,
      color: 'rose',
    },
  ]
}

/** Total squad size implied by the current quotas. */
export function totalQuota(buckets: RoleBucket[]): number {
  return buckets.reduce((sum, b) => sum + b.quota, 0)
}

export function findBucket(
  buckets: RoleBucket[],
  bucketId: string,
): RoleBucket | undefined {
  return buckets.find((b) => b.id === bucketId)
}

/**
 * Every bucket the player belongs to. A multi-role player can land in several
 * buckets — the role-saturation flag (spec §4.4.2) depends on this to downgrade
 * a warning to an info note when at least one of their buckets is not full.
 * Returns [] for a player whose roles are in no bucket.
 */
export function bucketsForPlayer(
  buckets: RoleBucket[],
  player: Player,
): RoleBucket[] {
  return buckets.filter((b) => b.roles.some((r) => player.roles.includes(r)))
}

/** Buckets a single role belongs to (a role may be in zero or many). */
export function bucketsForRole(
  buckets: RoleBucket[],
  role: MantraRole,
): RoleBucket[] {
  return buckets.filter((b) => b.roles.includes(role))
}

/**
 * Roles not covered by any bucket. Surfaced as an advisory notice in Settings —
 * it is allowed, not an error.
 */
export function rolesWithoutBucket(buckets: RoleBucket[]): MantraRole[] {
  return MANTRA_ROLES.filter((r) => !buckets.some((b) => b.roles.includes(r)))
}

/** Roles assigned to more than one bucket, for the same Settings notice. */
export function overlappingRoles(buckets: RoleBucket[]): MantraRole[] {
  return MANTRA_ROLES.filter(
    (r) => buckets.filter((b) => b.roles.includes(r)).length > 1,
  )
}

/**
 * How many of `players` fall into each bucket, keyed by bucket id. A multi-role
 * player counts once per bucket they qualify for, so the counts can sum to more
 * than `players.length`.
 */
export function bucketCounts(
  buckets: RoleBucket[],
  players: Player[],
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const b of buckets) counts[b.id] = 0
  for (const p of players) {
    for (const b of bucketsForPlayer(buckets, p)) counts[b.id] += 1
  }
  return counts
}

/** Players in a given bucket. */
export function playersInBucket(
  bucket: RoleBucket,
  players: Player[],
): Player[] {
  return players.filter((p) => p.roles.some((r) => bucket.roles.includes(r)))
}

/** Short display string for a bucket's roles, e.g. "Dc · B · Dd · Ds". */
export function bucketRolesLabel(bucket: RoleBucket): string {
  return bucket.roles.join(' · ')
}

// --- Roster helpers (derive strictly from sold_to / sold_price) -------------

export function rosterOf(players: Player[], teamId: string): Player[] {
  return players.filter((p) => p.status === 'sold' && p.sold_to === teamId)
}

export function spentBy(players: Player[], teamId: string): number {
  return rosterOf(players, teamId).reduce((sum, p) => sum + (p.sold_price ?? 0), 0)
}

/** Open roster slots for a team, against the configured total squad size. */
export function openSlots(settings: Settings, players: Player[], teamId: string) {
  const size = totalQuota(settings.buckets)
  const filled = rosterOf(players, teamId).length
  return Math.max(0, size - filled)
}

/**
 * Actual spend per bucket for a team, keyed by bucket id — the "actual" half of
 * the budget planner's planned-vs-actual comparison (spec §4.1). A multi-role
 * player's price is attributed to their first matching bucket only, so the
 * totals sum to the team's real spend rather than double-counting.
 */
export function spendByBucket(
  buckets: RoleBucket[],
  players: Player[],
  teamId: string,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const b of buckets) out[b.id] = 0
  for (const p of rosterOf(players, teamId)) {
    const first = buckets.find((b) => b.roles.some((r) => p.roles.includes(r)))
    if (first) out[first.id] += p.sold_price ?? 0
  }
  return out
}
