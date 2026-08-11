/**
 * The "bad pick" flag engine (spec §4.4): given a candidate player and a
 * candidate team, compute the advisory warnings for buying that player at a
 * given price. Pure and React-free so it is unit-testable in isolation and
 * safe to call once per (player, team) pair for the whole fit-check list.
 *
 * Flags are advisory, never blocking — the sale can always go through anyway.
 * Every threshold here is read from `session.settings.flag_thresholds`, never
 * hardcoded, so editing a threshold in Settings recomputes flags immediately.
 */

import { bucketsForPlayer, openSlots, rosterOf } from '@/lib/buckets'
import type { DraftSession, Flag, Player, Team } from '@/types'

/**
 * @param price The price to evaluate the sale at — the value currently typed
 *   into the auction panel, defaulting to `avg_price` before a bid is entered.
 */
export function computeFlags(
  player: Player,
  team: Team,
  session: DraftSession,
  price: number,
): Flag[] {
  const flags: Flag[] = []
  const { buckets, flag_thresholds } = session.settings
  const roster = rosterOf(session.players, team.id)

  // --- 1. Club stacking risk -------------------------------------------------
  const clubCount = roster.filter((p) => p.real_team === player.real_team).length
  if (clubCount + 1 >= flag_thresholds.club_stack) {
    flags.push({
      kind: 'club_stack',
      severity: 'warn',
      message: `Sarebbe il ${clubCount + 1}° giocatore della ${player.real_team} — rischio di correlazione su turnover e calendario.`,
    })
  }

  // --- 2. Role saturation -----------------------------------------------------
  const playerBuckets = bucketsForPlayer(buckets, player)
  const saturated = playerBuckets.filter((b) => {
    const current = rosterOf(session.players, team.id).filter((p) =>
      p.roles.some((r) => b.roles.includes(r)),
    ).length
    return current >= b.quota
  })
  if (saturated.length > 0) {
    // Multi-role players with at least one non-saturated bucket keep their
    // flexibility value — downgrade to an info note rather than a warning.
    const severity = saturated.length < playerBuckets.length ? 'info' : 'warn'
    for (const b of saturated) {
      const current = rosterOf(session.players, team.id).filter((p) =>
        p.roles.some((r) => b.roles.includes(r)),
      ).length
      flags.push({
        kind: 'role_saturation',
        severity,
        message: `${b.label} già ${severity === 'info' ? 'quasi ' : ''}completo per questa squadra (${current}/${b.quota}) — valore marginale probabilmente basso a meno di un upgrade su un titolare.`,
      })
    }
  }

  // --- 3. Price risk -----------------------------------------------------------
  if (player.personal_tag === 'avoid') {
    flags.push({
      kind: 'avoid_tag',
      severity: 'danger',
      message: 'Giocatore segnato come "da evitare".',
    })
  }

  const overpayPct = player.avg_price > 0 ? ((price - player.avg_price) / player.avg_price) * 100 : 0
  if (overpayPct > flag_thresholds.overpay_pct) {
    flags.push({
      kind: 'overpay',
      severity: 'warn',
      message: `Prezzo attuale ${price} supera del ${Math.round(overpayPct)}% il prezzo medio d’asta (${player.avg_price}).`,
    })
  }

  if (player.personal_max_price !== undefined && price > player.personal_max_price) {
    flags.push({
      kind: 'above_max_price',
      severity: 'danger',
      message: `Oltre il tuo prezzo massimo impostato (${player.personal_max_price}).`,
    })
  }

  // --- 4. Budget feasibility ----------------------------------------------------
  const remaining = team.budget_total - roster.reduce((sum, p) => sum + (p.sold_price ?? 0), 0)
  const remainingSlots = openSlots(session.settings, session.players, team.id)
  if (remainingSlots > 0 && remaining - price < remainingSlots * flag_thresholds.min_credits_per_slot) {
    flags.push({
      kind: 'budget_strain',
      severity: 'danger',
      message: `A questo prezzo resterebbero ${remaining - price} crediti per ${remainingSlots} slot ancora da riempire.`,
    })
  }

  return flags
}
