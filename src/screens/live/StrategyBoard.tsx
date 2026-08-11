import { useDroppable } from '@dnd-kit/core'
import { GripVertical, X } from 'lucide-react'
import clsx from 'clsx'

import { bucketsForPlayer, findBucket } from '@/lib/buckets'
import { bucketAccent } from '@/lib/colors'
import { useSession } from '@/store/session'
import type { Player, RoleBucket, StrategySlot } from '@/types'

/**
 * Right column (spec §4.2): the strategy board.
 *
 * A planning overlay on top of real purchase data — never the source of truth.
 * Slot→player mapping lives in `session.slot_assignments`; nothing here reads or
 * writes `sold_to`/`sold_price`, budgets, or flags.
 *
 * The whole plan must be visible without scrolling — a ~27-slot roster is the
 * thing you glance at mid-auction — so the groups are split across two balanced
 * sub-columns rather than stacked in one scrolling list.
 *
 * Every slot is a drop target (step 8, @dnd-kit): a drop is ALWAYS allowed —
 * `LiveDraftScreen`'s `onDragEnd` calls `assignSlot` unconditionally — and a
 * role mismatch only changes `PuzzlePiece`'s color, never blocks the drop.
 */

/**
 * Split groups into two sub-columns of near-equal height. Height is counted in
 * rows: one per slot plus one for the group header, so a 3-slot group costs less
 * than an 8-slot one and the two columns end up level.
 */
function balance<T extends { slots: unknown[] }>(groups: T[]): [T[], T[]] {
  const cost = (g: T) => g.slots.length + 1
  const total = groups.reduce((n, g) => n + cost(g), 0)
  const left: T[] = []
  let used = 0
  for (const g of groups) {
    // Keep filling the left column while doing so stays closer to half than
    // stopping would — this splits 5 groups as 2/3 or 3/2, whichever is level.
    if (left.length > 0 && Math.abs(used + cost(g) - total / 2) > Math.abs(used - total / 2))
      break
    left.push(g)
    used += cost(g)
  }
  return [left, groups.slice(left.length)]
}
export function StrategyBoard() {
  const { session, setActiveStrategy, playerById } = useSession()
  const { buckets } = session.settings

  const strategy =
    session.strategies.find((s) => s.id === session.active_strategy_id) ??
    session.strategies[0]

  const assignments = strategy ? (session.slot_assignments[strategy.id] ?? {}) : {}

  if (!strategy) {
    return (
      <section className="rounded-lg border border-dashed border-(--color-border) p-6 text-center text-sm text-(--color-fg-muted)">
        Nessuna strategia creata.
      </section>
    )
  }

  /** Slots grouped by bucket, in the order the buckets are configured. */
  const groups: { bucket: RoleBucket | undefined; slots: StrategySlot[] }[] = [
    ...buckets.map((bucket) => ({
      bucket,
      slots: strategy.slots.filter((s) => s.bucket_id === bucket.id),
    })),
    // Slots whose bucket was deleted degrade to a neutral section, never a crash.
    {
      bucket: undefined,
      slots: strategy.slots.filter((s) => !findBucket(buckets, s.bucket_id)),
    },
  ].filter((g) => g.slots.length > 0)

  const columns = balance(groups)
  const plannedTotal = strategy.slots.reduce((sum, s) => sum + s.target_price, 0)

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border border-(--color-border) bg-(--color-surface)">
      <header className="shrink-0 space-y-2 border-b border-(--color-border) px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[11px] tracking-wide text-(--color-fg-subtle) uppercase">
            Strategia
          </h3>
          <span className="text-[11px] tabular-nums text-(--color-fg-subtle)">
            pianificati {plannedTotal} cr
          </span>
        </div>
        <select
          value={strategy.id}
          onChange={(e) =>
            setActiveStrategy(e.target.value)
          }
          className="h-8 w-full rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-sm"
        >
          {session.strategies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </header>

      {/* Two balanced sub-columns so the full plan fits without scrolling.
          `overflow-y-auto` is only a safety net for very tall rosters. */}
      <div
        data-strategy-board
        className="grid min-h-0 flex-1 grid-cols-2 gap-x-3 overflow-y-auto p-2"
      >
        {columns.map((column, i) => (
          <div key={i} className="min-w-0">
            {/* Column key: the numbers beside each piece are otherwise unlabelled. */}
            <div className="flex items-baseline gap-1.5 border-b border-(--color-border) pb-1 text-[10px] tracking-wide text-(--color-fg-subtle) uppercase">
              <span className="min-w-0 flex-1 truncate">slot · pagato</span>
              <span className="w-7 text-right">piano</span>
              <span className="w-7 text-right">Δ</span>
              <span className="w-3" aria-hidden />
            </div>

            <div className="space-y-2.5 pt-2">
              {column.map(({ bucket, slots }) => (
                <div key={bucket?.id ?? '__orphan'}>
                  <div className="mb-1 flex items-baseline gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        background: bucket
                          ? bucketAccent[bucket.color]
                          : 'var(--color-fg-subtle)',
                      }}
                    />
                    <h4 className="min-w-0 truncate text-xs font-medium">
                      {bucket?.label ?? 'Reparto non assegnato'}
                    </h4>
                    <span className="ml-auto shrink-0 text-[11px] tabular-nums text-(--color-fg-subtle)">
                      {slots.filter((s) => assignments[s.id]).length}/
                      {slots.length}
                    </span>
                  </div>

                  <ul className="space-y-1">
                    {slots.map((slot) => (
                      <SlotRow
                        key={slot.id}
                        slot={slot}
                        strategyId={strategy.id}
                        bucket={bucket}
                        player={
                          assignments[slot.id]
                            ? playerById(assignments[slot.id])
                            : undefined
                        }
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * One slot. The target price is rendered as a label OUTSIDE the piece, so the
 * planned price and the price actually paid (on the piece) are always both
 * visible and directly comparable (spec §4.2).
 */
function SlotRow({
  slot,
  strategyId,
  bucket,
  player,
}: {
  slot: StrategySlot
  strategyId: string
  bucket: RoleBucket | undefined
  player: Player | undefined
}) {
  const { clearSlot } = useSession()
  // Namespaced id (`slot:<id>`) so LiveDraftScreen's onDragEnd can recognize a
  // strategy-slot drop target without relying on id shape.
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${slot.id}` })

  return (
    <li ref={setNodeRef} className="flex items-center gap-1.5">
      <div
        className={clsx(
          'min-w-0 flex-1 rounded-(--radius-piece)',
          // Drag-over feedback: a drop is always permitted, so this is purely
          // "release here", never a validity signal.
          isOver && 'ring-2 ring-(--color-brand) ring-offset-1 ring-offset-(--color-surface)',
        )}
      >
        {player ? (
          <PuzzlePiece
            player={player}
            bucket={bucket}
            onClear={() => clearSlot({ strategyId, slotId: slot.id })}
          />
        ) : (
          /* Empty slot: dashed placeholder showing only the target price. */
          <div className="flex h-7 items-center rounded-(--radius-piece) border border-dashed border-(--color-border-strong) px-2 text-[11px] text-(--color-fg-subtle)">
            slot libero
          </div>
        )}
      </div>

      {/* Target price label — outside the piece, by design. */}
      <span
        className="w-7 shrink-0 text-right text-xs tabular-nums text-(--color-fg-subtle)"
        title={`Prezzo pianificato per questo slot${
          player?.sold_price !== undefined
            ? ` — pagato ${player.sold_price}`
            : ''
        }`}
      >
        {slot.target_price}
      </span>

      {/* Delta vs plan, when the slot is filled. */}
      <span className="w-7 shrink-0 text-right text-[11px] tabular-nums">
        {player?.sold_price !== undefined ? (
          <Delta actual={player.sold_price} target={slot.target_price} />
        ) : (
          <span className="text-(--color-fg-subtle)">—</span>
        )}
      </span>

      <GripVertical
        size={12}
        className="shrink-0 text-(--color-fg-subtle) opacity-40"
        aria-hidden
      />
      <span className="sr-only">
        {player
          ? `${player.name} assegnato a uno slot ${bucket?.label ?? 'non assegnato'}`
          : 'slot vuoto'}
      </span>
    </li>
  )
}

/**
 * A filled slot: a rounded block with a small tab/nub, evoking a puzzle-piece
 * connector. Colored by the bucket when the player's role matches, and in the
 * danger color when it does not — the "I bought a player who doesn't fit the
 * plan" signal. This is advisory styling, never a blocking error.
 */
function PuzzlePiece({
  player,
  bucket,
  onClear,
}: {
  player: Player
  bucket: RoleBucket | undefined
  onClear: () => void
}) {
  const { session } = useSession()

  const matches = bucket
    ? bucketsForPlayer(session.settings.buckets, player).some(
        (b) => b.id === bucket.id,
      )
    : false

  const accent =
    bucket && matches ? bucketAccent[bucket.color] : 'var(--color-danger)'

  return (
    <div
      /* Extra right padding leaves room for the nub, which sits on the edge. */
      className="relative flex h-7 items-center gap-1.5 rounded-(--radius-piece) pr-3.5 pl-2"
      style={{
        background: `color-mix(in oklab, ${accent} 22%, var(--color-surface))`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${accent} 55%, transparent)`,
      }}
      title={
        matches
          ? undefined
          : `${player.name} (${player.roles.join(', ')}) non appartiene al reparto ${bucket?.label ?? ''}`
      }
    >
      {/* The nub — the puzzle-piece connector. */}
      <span className="puzzle-nub" style={{ background: accent }} aria-hidden />

      <span className="min-w-0 flex-1 truncate text-[13px]">{player.name}</span>
      <span
        className={clsx('shrink-0 text-xs font-semibold tabular-nums')}
        style={{ color: accent }}
      >
        {player.sold_price}
      </span>
      <button
        onClick={onClear}
        title="Svuota slot"
        className="shrink-0 rounded-full p-0.5 opacity-60 hover:bg-(--color-surface-3) hover:opacity-100"
      >
        <X size={11} strokeWidth={2.5} />
      </button>
    </div>
  )
}

function Delta({ actual, target }: { actual: number; target: number }) {
  const diff = actual - target
  if (diff === 0) return <span className="text-(--color-fg-subtle)">=</span>

  return (
    <span
      style={{ color: diff > 0 ? 'var(--color-danger)' : 'var(--color-ok)' }}
      title={diff > 0 ? 'Sopra il piano' : 'Sotto il piano'}
    >
      {diff > 0 ? '+' : ''}
      {diff}
    </span>
  )
}
