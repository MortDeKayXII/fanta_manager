/**
 * Tier ("fascia") helpers. Tiers are user-defined (see types.ts / TierDef),
 * mirroring how role buckets work: every screen resolves a player's tier
 * through this module rather than assuming a fixed TIT/PAN/SCO set.
 */

import type { BucketColor, TierDef } from '@/types'

/** The default preset shipped with the app. Editable, resettable. */
export function defaultTiers(): TierDef[] {
  return [
    { id: 'tit', label: 'Titolare', color: 'amber' },
    { id: 'pan', label: 'Panchina', color: 'sky' },
    { id: 'sco', label: 'Scommessa', color: 'violet' },
  ]
}

export function findTier(
  tiers: TierDef[] | null | undefined,
  tierId: string,
): TierDef | undefined {
  return tiers?.find((t) => t.id === tierId)
}

/** Display label for a tier id, falling back to the raw id if it dangles. */
export function tierLabel(
  tiers: TierDef[] | null | undefined,
  tierId: string,
): string {
  return findTier(tiers, tierId)?.label ?? tierId
}

/**
 * A tier's position in the configured order, for ordinal sorting in Prep. An
 * unknown (orphaned) tier id sorts last, after every configured tier.
 */
export function tierRank(
  tiers: TierDef[] | null | undefined,
  tierId: string,
): number {
  const safeTiers = tiers ?? []
  const i = safeTiers.findIndex((t) => t.id === tierId)
  return i === -1 ? safeTiers.length : i
}

/** Append a tier, choosing an unused id and the next color in the ramp. */
export function addTier(
  tiers: TierDef[] | null | undefined,
  colors: readonly BucketColor[],
): TierDef[] {
  const safeTiers = tiers ?? []
  const taken = new Set(safeTiers.map((t) => t.id))
  let n = safeTiers.length + 1
  while (taken.has(`tier-${n}`)) n++

  return [
    ...safeTiers,
    {
      id: `tier-${n}`,
      label: `Nuova fascia ${n}`,
      color: colors[safeTiers.length % colors.length],
    },
  ]
}
