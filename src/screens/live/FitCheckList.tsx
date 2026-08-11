import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import clsx from 'clsx'

import { FlagBadge, FlagCountBadge } from '@/components/badges'
import { computeFlags } from '@/lib/flags'
import { useSession } from '@/store/session'
import type { Player } from '@/types'

/**
 * Fit-check list (spec §4.2, left column): one row per team, including my own,
 * showing what would happen if *that* team bought the player currently up for
 * auction at the price currently entered. Collapsed it is a glanceable badge;
 * expanded it lists the flag messages. This is what lets every team's
 * situation be read during bidding.
 *
 * `player`/`price` are undefined when nothing is up for auction — every team
 * then reads OK, since there is nothing to evaluate.
 */
export function FitCheckList({
  player,
  price,
}: {
  player: Player | undefined
  price: number
}) {
  const { session, financeOf } = useSession()
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['t1']))

  // Memoized per (player, team, price, session) so the 8-team list stays
  // cheap to recompute on every keystroke in the price field.
  const flagsByTeam = useMemo(() => {
    const out: Record<string, ReturnType<typeof computeFlags>> = {}
    if (!player) {
      for (const t of session.teams) out[t.id] = []
      return out
    }
    for (const t of session.teams) out[t.id] = computeFlags(player, t, session, price)
    return out
  }, [player, price, session])

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section className="rounded-lg border border-(--color-border) bg-(--color-surface)">
      <header className="flex items-baseline justify-between border-b border-(--color-border) px-3 py-2">
        <h3 className="text-[11px] tracking-wide text-(--color-fg-subtle) uppercase">
          Verifica per squadra
        </h3>
        <span className="text-[11px] text-(--color-fg-subtle)">
          se lo comprasse…
        </span>
      </header>

      <ul className="divide-y divide-(--color-border)">
        {session.teams.map((team) => {
          const flags = flagsByTeam[team.id] ?? []
          const isOpen = expanded.has(team.id)
          const finance = financeOf(team.id)

          return (
            <li key={team.id}>
              <button
                onClick={() => toggle(team.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-(--color-surface-2)"
              >
                <ChevronRight
                  size={14}
                  className={clsx(
                    'shrink-0 text-(--color-fg-subtle) transition-transform',
                    isOpen && 'rotate-90',
                  )}
                />
                <span
                  className={clsx(
                    'min-w-0 flex-1 truncate',
                    team.isMe && 'font-semibold',
                  )}
                >
                  {team.name}
                  {team.isMe && (
                    <span className="ml-1.5 text-[11px] font-normal text-(--color-brand)">
                      io
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-(--color-fg-subtle)">
                  {finance.remaining} cr
                </span>
                <FlagCountBadge flags={flags} />
              </button>

              {isOpen && (
                <div className="space-y-1.5 px-3 pb-2.5 pl-9">
                  {flags.length === 0 ? (
                    <p className="text-xs text-(--color-fg-subtle)">
                      Nessun avviso: acquisto coerente con rosa e budget.
                    </p>
                  ) : (
                    flags.map((f, i) => <FlagBadge key={i} flag={f} />)
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
