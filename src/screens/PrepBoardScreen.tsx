import { useMemo } from 'react'
import { ArrowDown, ArrowUp, Ban, Search, Target } from 'lucide-react'
import clsx from 'clsx'

import { ClubBadge, RoleBadges } from '@/components/badges'
import {MANTRA_ROLES} from '@/types'
import type {MantraRole} from '@/types'
import { EmptyState } from '@/components/meters'
import { bucketsForPlayer } from '@/lib/buckets'
import { tierRank } from '@/lib/tiers'
import { useSession } from '@/store/session'
import type { Player, PrepFilters, PrepSortKey } from '@/types'

/**
 * Prep board (spec §4.1 / §6.2): sortable, filterable player table with tagging,
 * notes, max price, and tier badges/editing.
 *
 * Filtering and sorting are real here even in step 1 — they run as local UI state
 * over the fixtures, since the table can't be judged without them. Tags, notes
 * and tiers are editable (step 4); tiers are user-defined (like role buckets —
 * see Settings), so "fascia" sort/filter/display always reads `settings.tiers`
 * rather than assuming TIT/PAN/SCO.
 */
export function PrepBoardScreen() {
  const { session, updatePrepFilters } = useSession()
  const { buckets, tiers } = session.settings

  const {
  query,
  bucketId,
  club,
  role,
  tier,
  tag,
  onlyAvailable,
  sort,
  } = session.prep_filters

  const clubs = useMemo(
    () => [...new Set(session.players.map((p) => p.real_team))].sort(),
    [session.players],
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()

    const filtered = session.players.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false
      if (club && p.real_team !== club) return false
      if (tier && p.tier !== tier) return false
      if (tag && p.personal_tag !== tag) return false
      if (onlyAvailable && p.status !== 'available') return false
      if (bucketId && !bucketsForPlayer(buckets, p).some((b) => b.id === bucketId)) return false
      if (role && MANTRA_ROLES.includes(role as MantraRole) && !p.roles.includes(role as MantraRole)) return false
      return true
    })

    const dir = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case 'avg_price':
          return (a.avg_price - b.avg_price) * dir
        case 'tier':
          return (tierRank(tiers, a.tier) - tierRank(tiers, b.tier)) * dir
        case 'real_team':
          return a.real_team.localeCompare(b.real_team) * dir
        default:
          return a.name.localeCompare(b.name) * dir
      }
    })
  }, [session.players, query, club, tier, tag, onlyAvailable, bucketId, buckets, tiers, sort, role])

  function toggleSort(key: PrepSortKey) {
  const dir: PrepFilters['sort']['dir'] =
    sort.key === key
      ? sort.dir === 'asc'
        ? 'desc'
        : 'asc'
      : key === 'name' || key === 'real_team'
        ? 'asc'
        : 'desc'

  updatePrepFilters({
    sort: {
      key,
      dir,
    },
  })
}

  const selectCls =
    'h-8 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-xs'

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      {/* One filter row above everything it scopes. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            size={14}
            className="absolute top-1/2 left-2.5 -translate-y-1/2 text-(--color-fg-subtle)"
          />
          <input
            value={query}
            onChange={(e) => updatePrepFilters({ query: e.target.value })}
            placeholder="Cerca…"
            className="h-8 w-56 rounded-md border border-(--color-border) bg-(--color-surface-2) pl-8 text-xs placeholder:text-(--color-fg-subtle)"
          />
        </div>

        <select
          value={bucketId}
          onChange={(e) => updatePrepFilters({bucketId: e.target.value})}
          className={selectCls}
        >
          <option value="">Tutti i reparti</option>
          {buckets.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>

        <select
        value = {role}
        onChange={(e) => updatePrepFilters({role: e.target.value as PrepFilters['role']})}
        className={selectCls}
        >
          <option value=""> Tutti i ruoli</option>
          {MANTRA_ROLES.map((b) => (
            <option key={b} value={b}> {b} </option>
          ))}
        </select>

        <select
          value={club}
          onChange={(e) => updatePrepFilters({club: e.target.value})}
          className={selectCls}
        >
          <option value="">Tutte le squadre</option>
          {clubs.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={tier}
          onChange={(e) => updatePrepFilters({tier: e.target.value})}
          className={selectCls}
        >
          <option value="">Tutte le fasce</option>
          {tiers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>

        <select
          value={tag}
          onChange={(e) => updatePrepFilters({tag: e.target.value as PrepFilters['tag']})}
          className={selectCls}
        >
          <option value="">Tutti i tag</option>
          <option value="target">Solo target</option>
          <option value="avoid">Solo da evitare</option>
        </select>

        <label className="flex items-center gap-1.5 text-xs text-(--color-fg-muted)">
          <input
            type="checkbox"
            checked={onlyAvailable}
            onChange={(e) => updatePrepFilters({onlyAvailable: e.target.checked})}
            className="accent-(--color-brand)"
          />
          Solo disponibili
        </label>

        <span className="ml-auto text-xs tabular-nums text-(--color-fg-subtle)">
          {rows.length} di {session.players.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-(--color-border) bg-(--color-surface)">
        {rows.length === 0 ? (
          <EmptyState
            title="Nessun giocatore corrisponde ai filtri"
            hint="Allarga la ricerca o azzera i filtri."
            className="m-3"
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-(--color-surface-2) text-left">
              <tr className="text-[11px] tracking-wide text-(--color-fg-subtle) uppercase">
                <Th onClick={() => toggleSort('name')} sort={sort} k="name">
                  Giocatore
                </Th>
                <Th onClick={() => toggleSort('real_team')} sort={sort} k="real_team">
                  Squadra
                </Th>
                <th className="px-3 py-2 font-medium">Ruoli</th>
                <Th onClick={() => toggleSort('tier')} sort={sort} k="tier">
                  Fascia
                </Th>
                <Th
                  onClick={() => toggleSort('avg_price')}
                  sort={sort}
                  k="avg_price"
                  align="right"
                >
                  Medio
                </Th>
                <th className="px-3 py-2 text-right font-medium">Tuo max</th>
                <th className="px-3 py-2 font-medium">Tag</th>
                <th className="px-3 py-2 font-medium">Nota</th>
                <th className="px-3 py-2 text-right font-medium">Stato</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <Row key={p.id} player={p} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Th({
  children,
  onClick,
  sort,
  k,
  align = 'left',
}: {
  children: React.ReactNode
  onClick: () => void
  sort: { key: PrepSortKey; dir: 'asc' | 'desc' }
  k: PrepSortKey
  align?: 'left' | 'right'
}) {
  const active = sort.key === k
  const Icon = sort.dir === 'asc' ? ArrowUp : ArrowDown

  return (
    <th className={clsx('px-3 py-2 font-medium', align === 'right' && 'text-right')}>
      <button
        onClick={onClick}
        className={clsx(
          'inline-flex items-center gap-1 hover:text-(--color-fg)',
          active && 'text-(--color-fg)',
        )}
      >
        {children}
        {active && <Icon size={11} />}
      </button>
    </th>
  )
}

function Row({ player: p }: { player: Player }) {
  const { session, annotatePlayer, editPlayer } = useSession()
  const { tiers } = session.settings
  const soldTo = p.sold_to
    ? session.teams.find((t) => t.id === p.sold_to)
    : undefined

  function toggleTag(tag: 'target' | 'avoid') {
    annotatePlayer(p.id, {
      personal_tag: p.personal_tag === tag ? null : tag,
      personal_note: p.personal_note,
      personal_max_price: p.personal_max_price,
    })
  }

  return (
    <tr
      className={clsx(
        'border-t border-(--color-border) hover:bg-(--color-surface-2)',
        p.status === 'sold' && 'text-(--color-fg-subtle)',
      )}
    >
      <td className="px-3 py-1.5 whitespace-nowrap">{p.name}</td>
      <td className="px-3 py-1.5">
        <ClubBadge club={p.real_team} />
      </td>
      <td className="px-3 py-1.5">
        <RoleBadges roles={p.roles} buckets={session.settings.buckets} />
      </td>
      <td className="px-3 py-1.5">
        {/* Manually set the fascia per player (Setup defines the list,
            available under Impostazioni). A tier that no longer exists (the
            player kept an orphaned id) is shown as an extra option so the
            select never silently discards it until reassigned. */}
        <select
          value={p.tier}
          onChange={(e) => editPlayer(p.id, { tier: e.target.value })}
          className="h-7 rounded border border-(--color-border) bg-(--color-surface-2) px-1.5 text-xs"
        >
          {tiers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
          {!tiers.some((t) => t.id === p.tier) && (
            <option value={p.tier}>{p.tier} (non configurata)</option>
          )}
        </select>
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums">{p.avg_price}</td>
      <td className="px-3 py-1.5 text-right">
        <input
          type="number"
          min={0}
          value={p.personal_max_price ?? ''}
          placeholder="—"
          onChange={(e) =>
            annotatePlayer(p.id, {
              personal_tag: p.personal_tag,
              personal_note: p.personal_note,
              personal_max_price: e.target.value
                ? Math.max(0, Number(e.target.value))
                : undefined,
            })
          }
          className="h-7 w-16 rounded border border-(--color-border) bg-(--color-surface-2) px-1.5 text-right text-xs tabular-nums placeholder:text-(--color-fg-subtle)"
        />
      </td>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => toggleTag('target')}
            title="Target"
            className={clsx(
              'flex h-6 w-6 items-center justify-center rounded',
              p.personal_tag === 'target'
                ? 'bg-(--color-ok-bg)'
                : 'text-(--color-fg-subtle) hover:bg-(--color-surface-3)',
            )}
            style={
              p.personal_tag === 'target' ? { color: 'var(--color-ok)' } : undefined
            }
          >
            <Target size={13} strokeWidth={2.5} />
          </button>
          <button
            onClick={() => toggleTag('avoid')}
            title="Evita"
            className={clsx(
              'flex h-6 w-6 items-center justify-center rounded',
              p.personal_tag === 'avoid'
                ? 'bg-(--color-danger-bg)'
                : 'text-(--color-fg-subtle) hover:bg-(--color-surface-3)',
            )}
            style={
              p.personal_tag === 'avoid' ? { color: 'var(--color-danger)' } : undefined
            }
          >
            <Ban size={13} strokeWidth={2.5} />
          </button>
        </div>
      </td>
      <td className="px-3 py-1.5">
        <input
          value={p.personal_note ?? ''}
          placeholder="Nota…"
          onChange={(e) =>
            annotatePlayer(p.id, {
              personal_tag: p.personal_tag,
              personal_max_price: p.personal_max_price,
              personal_note: e.target.value,
            })
          }
          className="h-7 w-full min-w-[10rem] rounded border border-(--color-border) bg-(--color-surface-2) px-1.5 text-xs placeholder:text-(--color-fg-subtle)"
        />
      </td>
      <td className="px-3 py-1.5 text-right text-xs whitespace-nowrap">
        {soldTo ? (
          <span title={`${soldTo.name} — ${p.sold_price} cr`}>
            {soldTo.name.split(' ')[0]}{' '}
            <span className="tabular-nums text-(--color-fg-subtle)">
              {p.sold_price}
            </span>
          </span>
        ) : (
          <span style={{ color: 'var(--color-ok)' }}>libero</span>
        )}
      </td>
    </tr>
  )
}
