import { useState } from 'react'
import { Copy, Download, Minus, Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'

import { EmptyState, StatTile } from '@/components/meters'
import { bucketAccent } from '@/lib/colors'
import { bucketRolesLabel, findBucket } from '@/lib/buckets'
import { useSession } from '@/store/session'
import type { RoleBucket, Strategy, StrategySlot } from '@/types'

/**
 * Strategy builder (spec §4.3 / §6.3): named plans made of role-group buckets,
 * a slot count per bucket, and a target price per slot.
 *
 * Strategies are pure planning data — they never reference real players. The
 * mapping of purchases onto slots happens on the live-draft board.
 */
export function StrategyBuilderScreen() {
  const { session, sessions, upsertStrategy, deleteStrategy, importStrategy } =
    useSession()
  const { buckets } = session.settings

  // Strategies from every other known session, reusable here as-is (spec §4.3:
  // "a strategy can be reused across multiple draft sessions"). Excludes this
  // session's own list, since importing a strategy into itself is meaningless.
  const importable = sessions
    .filter((s) => s.id !== session.id)
    .flatMap((s) => s.strategies.map((strat) => ({ session: s, strategy: strat })))

  const [selectedId, setSelectedId] = useState<string | undefined>(
    session.active_strategy_id ?? session.strategies[0]?.id,
  )
  const strategy = session.strategies.find((s) => s.id === selectedId)

  function patch(id: string, fn: (s: Strategy) => Strategy) {
    const current = session.strategies.find((s) => s.id === id)
    if (current) upsertStrategy(fn(current))
  }

  function addSlot(bucket: RoleBucket) {
    if (!strategy) return
    const existing = strategy.slots.filter((s) => s.bucket_id === bucket.id)
    // Seed a new slot from the cheapest existing one, or the bucket's share.
    const seed = existing.length
      ? Math.min(...existing.map((s) => s.target_price))
      : 10
    patch(strategy.id, (s) => ({
      ...s,
      slots: [
        ...s.slots,
        {
          // Must be unique for the strategy's lifetime, not just right now:
          // `slot_assignments` is keyed by slot id, so reusing one after a
          // delete would hand the new slot the old slot's player.
          id: newSlotId(s, bucket.id),
          bucket_id: bucket.id,
          target_price: seed,
        },
      ],
    }))
  }

  function removeSlot(slotId: string) {
    if (!strategy) return
    patch(strategy.id, (s) => ({
      ...s,
      slots: s.slots.filter((x) => x.id !== slotId),
    }))
  }

  function setSlotPrice(slotId: string, price: number) {
    if (!strategy) return
    patch(strategy.id, (s) => ({
      ...s,
      slots: s.slots.map((x) =>
        x.id === slotId ? { ...x, target_price: price } : x,
      ),
    }))
  }

  const plannedTotal = strategy?.slots.reduce((n, s) => n + s.target_price, 0) ?? 0
  const budget = session.settings.budget_per_team
  const slotCount = strategy?.slots.length ?? 0

  return (
    <div className="flex h-full min-h-0">
      {/* Strategy list — switching never alters the others (spec §4.3). */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-(--color-border) bg-(--color-surface)">
        <header className="flex items-center justify-between border-b border-(--color-border) px-3 py-2">
          <h2 className="text-[11px] tracking-wide text-(--color-fg-subtle) uppercase">
            Strategie
          </h2>
          <div className="flex items-center gap-1">
            {importable.length > 0 && (
              <label
                title="Importa da un'altra sessione"
                className="flex h-6 items-center gap-1 rounded px-1 text-(--color-fg-muted) hover:bg-(--color-surface-2)"
              >
                <Download size={13} />
                <select
                  value=""
                  onChange={(e) => {
                    const [fromSessionId, strategyId] = e.target.value.split('::')
                    if (!fromSessionId) return
                    const id = importStrategy(fromSessionId, strategyId)
                    if (id) setSelectedId(id)
                  }}
                  className="max-w-20 bg-transparent text-[11px]"
                >
                  <option value="">Importa…</option>
                  {importable.map(({ session: s, strategy: strat }) => (
                    <option key={`${s.id}::${strat.id}`} value={`${s.id}::${strat.id}`}>
                      {strat.name} — {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              title="Nuova strategia"
              onClick={() => {
                const id = newStrategyId(session.strategies)
                upsertStrategy({ id, name: 'Nuova strategia', slots: [] })
                setSelectedId(id)
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-(--color-fg-muted) hover:bg-(--color-surface-2)"
            >
              <Plus size={14} />
            </button>
          </div>
        </header>

        <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {session.strategies.map((s) => {
            const total = s.slots.reduce((n, x) => n + x.target_price, 0)
            return (
              <li key={s.id}>
                <button
                  onClick={() => setSelectedId(s.id)}
                  className={clsx(
                    'w-full rounded px-2 py-1.5 text-left',
                    s.id === selectedId
                      ? 'bg-(--color-surface-3)'
                      : 'hover:bg-(--color-surface-2)',
                  )}
                >
                  <div className="truncate text-sm">{s.name}</div>
                  <div className="text-[11px] tabular-nums text-(--color-fg-subtle)">
                    {s.slots.length} slot · {total} cr
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      {/* Editor */}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!strategy ? (
          <EmptyState
            title="Nessuna strategia selezionata"
            hint="Creane una per pianificare slot e prezzi obiettivo."
          />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-64 flex-1 space-y-2">
                <input
                  value={strategy.name}
                  onChange={(e) =>
                    patch(strategy.id, (s) => ({ ...s, name: e.target.value }))
                  }
                  className="h-9 w-full rounded-md border border-(--color-border) bg-(--color-surface-2) px-2.5 text-base font-semibold"
                />
                <textarea
                  rows={2}
                  value={strategy.description ?? ''}
                  onChange={(e) =>
                    patch(strategy.id, (s) => ({
                      ...s,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Descrizione (opzionale)"
                  className="w-full rounded-md border border-(--color-border) bg-(--color-surface-2) px-2.5 py-1.5 text-xs placeholder:text-(--color-fg-subtle)"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <StatTile label="Slot pianificati" value={slotCount} />
                <StatTile
                  label="Totale pianificato"
                  value={plannedTotal}
                  tone={plannedTotal > budget ? 'warn' : 'neutral'}
                  hint={`budget ${budget}`}
                />
                <StatTile
                  label="Margine"
                  value={budget - plannedTotal}
                  tone={plannedTotal > budget ? 'danger' : 'ok'}
                  hint="non deve quadrare esattamente"
                />
              </div>

              <div className="flex gap-1.5">
                <button
                  title="Duplica"
                  onClick={() => {
                    const id = newStrategyId(session.strategies)
                    upsertStrategy({
                      ...strategy,
                      id,
                      name: `${strategy.name} (copia)`,
                      // Fresh slot ids: assignments are keyed by them, and the
                      // copy must not inherit the original's board state.
                      slots: strategy.slots.map((x, i) => ({
                        ...x,
                        id: `${id}-${x.bucket_id}-${i + 1}`,
                      })),
                    })
                    setSelectedId(id)
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-(--color-border) text-(--color-fg-muted) hover:bg-(--color-surface-2)"
                >
                  <Copy size={14} />
                </button>
                <button
                  title="Elimina strategia"
                  onClick={() => {
                    deleteStrategy(strategy.id)
                    setSelectedId(
                      session.strategies.find((s) => s.id !== strategy.id)?.id,
                    )
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-(--color-border) text-(--color-fg-muted) hover:bg-(--color-surface-2) hover:text-(--color-danger)"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* One section per configured bucket. */}
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {buckets.map((bucket) => {
                const slots = strategy.slots.filter(
                  (s) => s.bucket_id === bucket.id,
                )
                const total = slots.reduce((n, s) => n + s.target_price, 0)

                return (
                  <section
                    key={bucket.id}
                    className="rounded-lg border border-(--color-border) bg-(--color-surface) p-3"
                  >
                    <header className="flex items-baseline gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: bucketAccent[bucket.color] }}
                      />
                      <h3 className="min-w-0 flex-1 truncate text-sm font-medium">
                        {bucket.label}
                      </h3>
                      <span className="text-[11px] tabular-nums text-(--color-fg-subtle)">
                        {slots.length}/{bucket.quota} slot · {total} cr
                      </span>
                    </header>
                    <p className="mt-0.5 text-[11px] text-(--color-fg-subtle)">
                      {bucketRolesLabel(bucket) || 'nessun ruolo assegnato'}
                    </p>

                    <ul className="mt-2.5 space-y-1.5">
                      {slots.map((slot, i) => (
                        <SlotEditor
                          key={slot.id}
                          index={i + 1}
                          slot={slot}
                          onPrice={(v) => setSlotPrice(slot.id, v)}
                          onRemove={() => removeSlot(slot.id)}
                        />
                      ))}
                    </ul>

                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        onClick={() => addSlot(bucket)}
                        className="flex h-7 items-center gap-1 rounded border border-(--color-border) px-2 text-xs text-(--color-fg-muted) hover:bg-(--color-surface-2)"
                      >
                        <Plus size={12} />
                        Slot
                      </button>
                      {slots.length !== bucket.quota && (
                        <span
                          className="text-[11px]"
                          style={{ color: 'var(--color-warn)' }}
                        >
                          {slots.length < bucket.quota
                            ? `${bucket.quota - slots.length} sotto la quota`
                            : `${slots.length - bucket.quota} oltre la quota`}
                        </span>
                      )}
                    </div>
                  </section>
                )
              })}
            </div>

            {/* Orphaned slots: a bucket was deleted after the strategy was built. */}
            {(() => {
              const orphans = strategy.slots.filter(
                (s) => !findBucket(buckets, s.bucket_id),
              )
              if (orphans.length === 0) return null
              return (
                <section className="rounded-lg border border-(--color-border) bg-(--color-surface) p-3">
                  <h3 className="text-sm font-medium">Slot senza reparto</h3>
                  <p className="mt-0.5 text-[11px] text-(--color-fg-subtle)">
                    Il reparto di questi slot è stato eliminato. Restano validi ma
                    non contano per nessuna quota.
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {orphans.map((slot, i) => (
                      <SlotEditor
                        key={slot.id}
                        index={i + 1}
                        slot={slot}
                        onPrice={(v) => setSlotPrice(slot.id, v)}
                        onRemove={() => removeSlot(slot.id)}
                      />
                    ))}
                  </ul>
                </section>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}

/** A slot id not already used by this strategy. Matches the fixtures' shape. */
function newSlotId(strategy: Strategy, bucketId: string): string {
  const taken = new Set(strategy.slots.map((s) => s.id))
  let n = strategy.slots.filter((s) => s.bucket_id === bucketId).length + 1
  while (taken.has(`${strategy.id}-${bucketId}-${n}`)) n++
  return `${strategy.id}-${bucketId}-${n}`
}

/**
 * A strategy id not already in use. Counting strategies is not enough: after a
 * delete the count can collide with a surviving id, and `slot_assignments` is
 * keyed by strategy id, so a collision would graft one plan's board onto another.
 */
function newStrategyId(existing: Strategy[]): string {
  const taken = new Set(existing.map((s) => s.id))
  let n = existing.length + 1
  while (taken.has(`s${n}`)) n++
  return `s${n}`
}

function SlotEditor({
  index,
  slot,
  onPrice,
  onRemove,
}: {
  index: number
  slot: StrategySlot
  onPrice: (v: number) => void
  onRemove: () => void
}) {
  return (
    <li className="flex items-center gap-2">
      <span className="w-4 shrink-0 text-xs tabular-nums text-(--color-fg-subtle)">
        {index}
      </span>
      <input
        type="number"
        min={0}
        value={slot.target_price}
        onChange={(e) => onPrice(Math.max(0, Number(e.target.value) || 0))}
        className="h-7 w-20 rounded border border-(--color-border) bg-(--color-surface-2) px-2 text-sm tabular-nums"
      />
      <span className="text-[11px] text-(--color-fg-subtle)">cr obiettivo</span>
      <button
        onClick={onRemove}
        title="Rimuovi slot"
        className="ml-auto flex h-6 w-6 items-center justify-center rounded text-(--color-fg-subtle) hover:bg-(--color-surface-2) hover:text-(--color-danger)"
      >
        <Minus size={13} />
      </button>
    </li>
  )
}
