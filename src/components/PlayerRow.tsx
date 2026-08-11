import clsx from 'clsx'

import { ClubBadge, RoleBadges, TagBadge, TierBadge } from '@/components/badges'
import type { Player, RoleBucket, TierDef } from '@/types'

/**
 * One player as a compact row. Used by the middle column's raw roster list and
 * the available-players lists. Read-only by design — the raw roster is a plain
 * factual log (spec §4.2, middle column).
 */
export function PlayerRow({
  player,
  buckets,
  tiers,
  price,
  onClick,
  selected,
  showTag = false,
}: {
  player: Player
  buckets: RoleBucket[]
  tiers: TierDef[]
  /** Price to display; defaults to sold_price, falling back to avg_price. */
  price?: number
  onClick?: () => void
  selected?: boolean
  showTag?: boolean
}) {
  const shown = price ?? player.sold_price ?? player.avg_price
  const interactive = Boolean(onClick)

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
      className={clsx(
        'flex items-center gap-2 rounded px-2 py-1.5 text-sm',
        interactive &&
          'cursor-pointer hover:bg-(--color-surface-2) focus:bg-(--color-surface-2) focus:outline-none',
        selected && 'bg-(--color-surface-3)',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{player.name}</span>
      <ClubBadge club={player.real_team} />
      <RoleBadges roles={player.roles} buckets={buckets} />
      {showTag && player.personal_tag && <TagBadge tag={player.personal_tag} />}
      <TierBadge tier={player.tier} tiers={tiers} />
      <span className="w-10 shrink-0 text-right tabular-nums text-(--color-fg-muted)">
        {shown}
      </span>
    </div>
  )
}
