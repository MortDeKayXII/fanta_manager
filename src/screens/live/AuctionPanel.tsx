import { useMemo, useState } from 'react'
import { Gavel, StickyNote, Undo2 } from 'lucide-react'
import clsx from 'clsx'

import { ClubBadge, FlagBadge, RoleBadges, TagBadge, TierBadge } from '@/components/badges'
import { computeFlags } from '@/lib/flags'
import { useSession } from '@/store/session'
import type { Player } from '@/types'

/**
 * "Player up for auction" panel (spec §4.2, left column). Deliberately NOT
 * compact — this is the primary focus area during bidding.
 */
export function AuctionPanel({
  player,
  price,
  onPriceChange,
  teamId,
  onTeamChange,
  onConfirm,
  onUndo,
  canUndo,
}: {
  player: Player | undefined
  price: string
  onPriceChange: (v: string) => void
  teamId: string
  onTeamChange: (v: string) => void
  onConfirm: () => void
  onUndo: () => void
  canUndo: boolean
}) {
  const { session } = useSession()
  const { buckets, tiers } = session.settings

  if (!player) {
    return (
      <div className="rounded-lg border border-dashed border-(--color-border) p-6 text-center text-sm text-(--color-fg-muted)">
        <p>Nessun giocatore all’asta. Cercane uno per iniziare.</p>
        {/* Undo must stay one click away even between picks — the panel clears
            itself right after a confirm, which is exactly when a misclick needs
            reverting fastest (spec §4.2: "needs to be one click, auctions move
            fast"). */}
        {canUndo && (
          <button
            onClick={onUndo}
            title="Annulla ultima assegnazione"
            className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-(--color-border) px-3 text-sm text-(--color-fg-muted) hover:bg-(--color-surface-2)"
          >
            <Undo2 size={14} />
            Annulla ultima assegnazione
          </button>
        )}
      </div>
    )
  }

  const overMax =
    player.personal_max_price !== undefined &&
    Number(price) > player.personal_max_price

  // Flags for the currently-selected winning team, at the currently-entered
  // price — the fit-check list below covers every team; this is the one the
  // sale is actually about to go to.
  const selectedTeam = session.teams.find((t) => t.id === teamId)
  const flags = useMemo(() => {
    if (!selectedTeam) return []
    const value = Number(price)
    return computeFlags(player, selectedTeam, session, Number.isFinite(value) ? value : 0)
  }, [player, selectedTeam, price, session])

  return (
    <section className="rounded-lg border border-(--color-border) bg-(--color-surface) p-4">
      <div className="flex items-center gap-2 text-[11px] tracking-wide text-(--color-fg-subtle) uppercase">
        <Gavel size={13} strokeWidth={2.5} />
        All’asta
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-2xl leading-tight font-semibold">{player.name}</h2>
        <ClubBadge club={player.real_team} />
        <RoleBadges roles={player.roles} buckets={buckets} />
        <TierBadge tier={player.tier} tiers={tiers} />
        {player.personal_tag && <TagBadge tag={player.personal_tag} />}
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div className="flex gap-1.5">
          <dt className="text-(--color-fg-subtle)">Medio asta</dt>
          <dd className="font-semibold tabular-nums">{player.avg_price}</dd>
        </div>
        {player.personal_max_price !== undefined && (
          <div className="flex gap-1.5">
            <dt className="text-(--color-fg-subtle)">Tuo max</dt>
            <dd
              className="font-semibold tabular-nums"
              style={{ color: overMax ? 'var(--color-danger)' : undefined }}
            >
              {player.personal_max_price}
            </dd>
          </div>
        )}
      </dl>

      {player.personal_note && (
        <p className="mt-3 flex gap-2 rounded bg-(--color-surface-2) px-2.5 py-2 text-xs text-(--color-fg-muted)">
          <StickyNote size={13} className="mt-px shrink-0" />
          {player.personal_note}
        </p>
      )}

      {/* Flags for the team currently selected below, at the price currently
          entered — advisory only, never blocking the sale (spec §4.4). */}
      {flags.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {flags.map((f, i) => (
            <FlagBadge key={i} flag={f} />
          ))}
        </div>
      )}

      {/* Assign sale inline (spec §4.2): winning team + final price. */}
      <div className="mt-4 flex items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[11px] text-(--color-fg-subtle)">
            Squadra vincente
          </span>
          <select
            value={teamId}
            onChange={(e) => onTeamChange(e.target.value)}
            className="h-9 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-sm"
          >
            {session.teams.map((t, i) => (
              <option key={t.id} value={t.id}>
                {i < 9 ? `${i + 1} · ` : ''}
                {t.name}
                {t.isMe ? ' (io)' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="flex w-24 flex-col gap-1">
          <span className="text-[11px] text-(--color-fg-subtle)">Prezzo</span>
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => onPriceChange(e.target.value)}
            className="h-9 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-sm tabular-nums"
          />
        </label>

        <button
          onClick={onConfirm}
          className="h-9 shrink-0 rounded-md bg-(--color-brand) px-4 text-sm font-semibold text-(--color-brand-fg) hover:bg-(--color-brand-strong)"
        >
          Assegna
        </button>

        {/* One click — auctions move fast (spec §4.2). */}
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Annulla ultima assegnazione (u)"
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-(--color-border) px-3 text-sm text-(--color-fg-muted) hover:bg-(--color-surface-2) disabled:opacity-40"
        >
          <Undo2 size={14} />
          Annulla
        </button>
      </div>

      <p className="mt-2 text-[11px] text-(--color-fg-subtle)">
        <kbd className="rounded border border-(--color-border) px-1">/</kbd> cerca ·{' '}
        <kbd className="rounded border border-(--color-border) px-1">1</kbd>-
        <kbd className="rounded border border-(--color-border) px-1">9</kbd> squadra ·{' '}
        <kbd className="rounded border border-(--color-border) px-1">u</kbd> annulla
      </p>
    </section>
  )
}

/**
 * Keyboard-first search over available players — the speed-critical path
 * during a live auction (spec §7.10): type to filter, ↑↓ to move the
 * highlight, Enter to load the highlighted match into the auction card
 * without ever reaching for the mouse.
 *
 * `inputRef` is accepted so the screen-level `/` shortcut (step 10) can focus
 * this field from anywhere on the page without this component knowing about
 * global shortcuts itself.
 */
export function PlayerSearch({
  onPick,
  inputRef,
}: {
  onPick: (player: Player) => void
  inputRef?: React.Ref<HTMLInputElement>
}) {
  const { availablePlayers, session } = useSession()
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)

  const matches =
    query.trim().length > 0
      ? availablePlayers
          .filter((p) =>
            p.name.toLowerCase().includes(query.trim().toLowerCase()),
          )
          .slice(0, 6)
      : []

  function choose(p: Player) {
    onPick(p)
    setQuery('')
    setHighlighted(0)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (matches.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((i) => (i + 1) % matches.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((i) => (i - 1 + matches.length) % matches.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(matches[highlighted] ?? matches[0])
    } else if (e.key === 'Escape') {
      setQuery('')
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setHighlighted(0)
        }}
        onKeyDown={onKeyDown}
        placeholder="Cerca giocatore da mettere all’asta… (/ per il focus)"
        className="h-9 w-full rounded-md border border-(--color-border) bg-(--color-surface-2) px-3 text-sm placeholder:text-(--color-fg-subtle)"
      />
      {matches.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-(--color-border) bg-(--color-surface-2) shadow-lg">
          {matches.map((p, i) => (
            <li key={p.id}>
              <button
                onClick={() => choose(p)}
                onMouseEnter={() => setHighlighted(i)}
                className={clsx(
                  'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm',
                  i === highlighted
                    ? 'bg-(--color-surface-3)'
                    : 'hover:bg-(--color-surface-3)',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <ClubBadge club={p.real_team} />
                <RoleBadges roles={p.roles} buckets={session.settings.buckets} />
                <span className="tabular-nums text-(--color-fg-muted)">
                  {p.avg_price}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
