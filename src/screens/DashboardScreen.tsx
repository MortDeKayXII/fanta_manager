import { useMemo, useState } from 'react'
import clsx from 'clsx'

import { ClubBadge, RoleBadges, TierBadge } from '@/components/badges'
import {
  BudgetMeter,
  EmptyState,
  HeroFigure,
  QuotaMeter,
  StatTile,
} from '@/components/meters'
import { bucketCounts, bucketRolesLabel, spendByBucket, totalQuota } from '@/lib/buckets'
import { useSession } from '@/store/session'

/**
 * Dashboard (spec §4.2 / §6.5): the secondary "zoom out and audit everything"
 * screen — per-team budgets, rosters grouped by bucket with counts vs quota, and
 * a filterable available-players table.
 *
 * Budgets and quotas are single ratios against a limit, so they are meters and
 * stat tiles rather than charts.
 */
export function DashboardScreen() {
  const { session, myTeam, rosterOf, financeOf, availablePlayers, updateSettings } =
    useSession()
  const { buckets, tiers } = session.settings
  const squadSize = totalQuota(buckets)

  const [query, setQuery] = useState('')
  const [bucketFilter, setBucketFilter] = useState('')

  const myFinance = financeOf(myTeam.id)

  const mySpendByBucket = useMemo(
    () => spendByBucket(buckets, session.players, myTeam.id),
    [buckets, session.players, myTeam.id],
  )

  const allocationTotal = Object.values(session.settings.budget_allocation).reduce(
    (n, v) => n + v,
    0,
  )

  const available = useMemo(() => {
    const q = query.trim().toLowerCase()
    return availablePlayers
      .filter((p) => {
        if (q && !p.name.toLowerCase().includes(q)) return false
        if (
          bucketFilter &&
          !buckets
            .find((b) => b.id === bucketFilter)
            ?.roles.some((r) => p.roles.includes(r))
        )
          return false
        return true
      })
      .sort((a, b) => b.avg_price - a.avg_price)
  }, [availablePlayers, query, bucketFilter, buckets])

  const totalSpent = session.teams.reduce(
    (sum, t) => sum + financeOf(t.id).spent,
    0,
  )

  return (
    <div className="h-full overflow-auto p-4">
      <div className="space-y-5">
        {/* Exactly one hero figure per view. */}
        <div className="flex flex-wrap items-end justify-between gap-6">
          <HeroFigure
            label="Crediti che ti restano"
            value={myFinance.remaining}
            unit="cr"
            hint={`${myFinance.rosterSize}/${squadSize} giocatori · ${myFinance.openSlots} slot da riempire`}
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile
              label="Giocatori assegnati"
              value={session.log.length}
              hint={`su ${session.players.length} in database`}
            />
            <StatTile label="Crediti spesi in lega" value={totalSpent} />
            <StatTile
              label="Speso da te"
              value={myFinance.spent}
              hint={`${Math.round((myFinance.spent / myTeam.budget_total) * 100)}% del budget`}
            />
            <StatTile
              label="Ancora disponibili"
              value={availablePlayers.length}
              tone={availablePlayers.length < squadSize ? 'warn' : 'neutral'}
            />
          </div>
        </div>

        {/* Budget planner: soft % allocation per bucket (editable), vs actual spend
            (spec §4.1 — "actual only populates once live phase starts"). */}
        <section>
          <header className="mb-2 flex flex-wrap items-baseline gap-2">
            <h2 className="text-sm font-semibold">
              Piano budget vs speso — {myTeam.name}
            </h2>
            <span
              className="text-xs tabular-nums"
              style={{
                color:
                  allocationTotal === 100
                    ? 'var(--color-fg-subtle)'
                    : 'var(--color-warn)',
              }}
            >
              {allocationTotal}% allocato
            </span>
          </header>
          <div className="grid gap-x-6 gap-y-3 rounded-lg border border-(--color-border) bg-(--color-surface) p-4 sm:grid-cols-2 lg:grid-cols-3">
            {buckets.map((b) => {
              const pct = session.settings.budget_allocation[b.id] ?? 0
              const planned = Math.round((myTeam.budget_total * pct) / 100)
              const actual = mySpendByBucket[b.id] ?? 0
              return (
                <div key={b.id}>
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1">
                      <QuotaMeter
                        label={b.label}
                        current={actual}
                        required={Math.max(planned, 1)}
                        color={b.color}
                      />
                    </span>
                    <label className="flex shrink-0 items-center gap-1 text-[11px] text-(--color-fg-subtle)">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={pct}
                        onChange={(e) =>
                          updateSettings({
                            budget_allocation: {
                              ...session.settings.budget_allocation,
                              [b.id]: Math.max(0, Number(e.target.value) || 0),
                            },
                          })
                        }
                        className="h-6 w-12 rounded border border-(--color-border) bg-(--color-surface-2) px-1 text-right text-xs tabular-nums"
                      />
                      %
                    </label>
                  </div>
                  <p className="mt-1 text-[11px] tabular-nums text-(--color-fg-subtle)">
                    {actual} spesi su {planned} pianificati
                  </p>
                </div>
              )
            })}
          </div>
        </section>

        {/* Per-team cards: budget + roster grouped by bucket with quota counts. */}
        <section>
          <h2 className="mb-2 text-sm font-semibold">Squadre</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {session.teams.map((team) => {
              const roster = rosterOf(team.id)
              const finance = financeOf(team.id)
              const counts = bucketCounts(buckets, roster)

              return (
                <div
                  key={team.id}
                  className={clsx(
                    'rounded-lg border bg-(--color-surface) p-3',
                    team.isMe
                      ? 'border-(--color-brand)'
                      : 'border-(--color-border)',
                  )}
                >
                  <div className="flex items-baseline gap-2">
                    <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {team.name}
                    </h3>
                    {team.isMe && (
                      <span className="text-[11px] text-(--color-brand)">io</span>
                    )}
                    <span className="text-[11px] tabular-nums text-(--color-fg-subtle)">
                      {finance.rosterSize}/{squadSize}
                    </span>
                  </div>

                  <div className="mt-2">
                    <BudgetMeter
                      spent={finance.spent}
                      total={team.budget_total}
                      compact
                    />
                  </div>

                  <div className="mt-3 space-y-2">
                    {buckets.map((b) => (
                      <QuotaMeter
                        key={b.id}
                        label={b.label}
                        current={counts[b.id] ?? 0}
                        required={b.quota}
                        color={b.color}
                      />
                    ))}
                  </div>

                  {roster.length > 0 && (
                    <ul className="mt-3 space-y-0.5 border-t border-(--color-border) pt-2 text-xs">
                      {roster.map((p) => (
                        <li key={p.id} className="flex gap-2">
                          <span className="min-w-0 flex-1 truncate">{p.name}</span>
                          <span className="tabular-nums text-(--color-fg-subtle)">
                            {p.sold_price}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Filterable available-players table. */}
        <section>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">Giocatori disponibili</h2>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca…"
              className="h-8 w-48 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-xs placeholder:text-(--color-fg-subtle)"
            />
            <select
              value={bucketFilter}
              onChange={(e) => setBucketFilter(e.target.value)}
              className="h-8 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-xs"
            >
              <option value="">Tutti i reparti</option>
              {buckets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
            <span className="ml-auto text-xs tabular-nums text-(--color-fg-subtle)">
              {available.length} giocatori
            </span>
          </div>

          <div className="max-h-96 overflow-auto rounded-lg border border-(--color-border) bg-(--color-surface)">
            {available.length === 0 ? (
              <EmptyState title="Nessun giocatore disponibile" className="m-3" />
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-(--color-surface-2) text-left text-[11px] tracking-wide text-(--color-fg-subtle) uppercase">
                  <tr>
                    <th className="px-3 py-2 font-medium">Giocatore</th>
                    <th className="px-3 py-2 font-medium">Squadra</th>
                    <th className="px-3 py-2 font-medium">Ruoli</th>
                    <th className="px-3 py-2 font-medium">Fascia</th>
                    <th className="px-3 py-2 text-right font-medium">Medio asta</th>
                  </tr>
                </thead>
                <tbody>
                  {available.map((p) => (
                    <tr
                      key={p.id}
                      className="border-t border-(--color-border) hover:bg-(--color-surface-2)"
                    >
                      <td className="px-3 py-1.5 whitespace-nowrap">{p.name}</td>
                      <td className="px-3 py-1.5">
                        <ClubBadge club={p.real_team} />
                      </td>
                      <td className="px-3 py-1.5">
                        <RoleBadges roles={p.roles} buckets={buckets} />
                      </td>
                      <td className="px-3 py-1.5">
                        <TierBadge tier={p.tier} tiers={tiers} />
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {p.avg_price}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-(--color-fg-subtle)">
            Reparti configurati:{' '}
            {buckets.map((b) => `${b.label} (${bucketRolesLabel(b)})`).join(' · ')}
          </p>
        </section>
      </div>
    </div>
  )
}
