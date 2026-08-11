import { useDraggable } from '@dnd-kit/core'
import { GripVertical } from 'lucide-react'
import clsx from 'clsx'

import { RoleBadges } from '@/components/badges'
import { EmptyState } from '@/components/meters'
import { useSession } from '@/store/session'
import type { MantraRole, Team } from '@/types'

/**
 * Middle column (spec §4.2): compact, READ-ONLY rosters — `name · role · price
 * paid`.
 *
 * My own roster comes first and is what the spec asks to keep always visible;
 * the other teams follow in the same format, reachable by scrolling, so "who
 * already has three Juve defenders?" is answerable without leaving the screen.
 *
 * This is a plain factual log. It is never reordered or edited here, and it is
 * not the strategy board: it derives strictly from `sold_to`/`sold_price`, so
 * dragging pieces on the right column cannot change it — only MY team's rows
 * are drag SOURCES (step 8), onto the strategy board's slots; the list itself
 * never reacts to where a piece lands.
 */
export function RostersColumn() {
  const { session, myTeam } = useSession()

  // Mine first, then the rest in league order.
  const teams = [myTeam, ...session.teams.filter((t) => t.id !== myTeam.id)]

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border border-(--color-border) bg-(--color-surface)">
      <header className="flex shrink-0 items-baseline justify-between gap-2 border-b border-(--color-border) px-3 py-2">
        <h3 className="text-[11px] tracking-wide text-(--color-fg-subtle) uppercase">
          Rose
        </h3>
        <span className="text-[11px] text-(--color-fg-subtle)">
          la mia, poi le altre {teams.length - 1}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {teams.map((team) => (
          <TeamRoster key={team.id} team={team} />
        ))}
      </div>
    </section>
  )
}

/**
 * One team's purchases. The header sticks while scrolling so it stays clear
 * whose roster is on screen.
 */
function TeamRoster({ team }: { team: Team }) {
  const { session, rosterOf, financeOf, squadSize } = useSession()
  const roster = rosterOf(team.id)
  const finance = financeOf(team.id)

  return (
    <div className="border-b border-(--color-border) last:border-b-0">
      <header
        className={clsx(
          'sticky top-0 z-10 flex items-baseline gap-2 border-b border-(--color-border) px-3 py-1.5 backdrop-blur-sm',
          team.isMe ? 'bg-(--color-surface-3)' : 'bg-(--color-surface-2)',
        )}
      >
        <h4
          className={clsx(
            'min-w-0 flex-1 truncate text-xs',
            team.isMe ? 'font-semibold' : 'font-medium',
          )}
        >
          {team.name}
        </h4>
        {team.isMe && (
          <span className="shrink-0 text-[10px] tracking-wide text-(--color-brand) uppercase">
            io
          </span>
        )}
        <span className="shrink-0 text-[11px] tabular-nums text-(--color-fg-muted)">
          <span className="font-semibold text-(--color-fg)">
            {finance.rosterSize}/{squadSize}
          </span>
          {' · '}
          {finance.remaining} cr
        </span>
      </header>

      <div className="p-1.5">
        {roster.length === 0 ? (
          <EmptyState
            title="Nessun acquisto"
            hint={
              team.isMe
                ? 'I giocatori assegnati alla tua squadra compaiono qui.'
                : undefined
            }
            className="m-1"
          />
        ) : (
          <ul>
            {roster.map((p) =>
              team.isMe ? (
                <DraggableRosterRow key={p.id} playerId={p.id} name={p.name} price={p.sold_price} roles={p.roles} />
              ) : (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded px-1.5 py-0.5 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <RoleBadges roles={p.roles} buckets={session.settings.buckets} />
                  <span className="w-8 shrink-0 text-right tabular-nums text-(--color-fg-muted)">
                    {p.sold_price}
                  </span>
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      {roster.length > 0 && (
        <p className="px-3 pb-1.5 text-[11px] tabular-nums text-(--color-fg-subtle)">
          {finance.spent} crediti spesi · {finance.openSlots} slot liberi
        </p>
      )}
    </div>
  )
}

/**
 * A drag source for the strategy board (step 8): only rendered for `team.isMe`
 * rows. The draggable id is namespaced (`player:<id>`) so the drop handler in
 * `LiveDraftScreen` can tell a player drag apart from anything else that might
 * ever become draggable, without relying on id shape.
 */
function DraggableRosterRow({
  playerId,
  name,
  price,
  roles,
}: {
  playerId: string
  name: string
  price: number | undefined
  roles: MantraRole[]
}) {
  const { session } = useSession()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `player:${playerId}`,
  })

  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={clsx(
        'flex items-center gap-2 rounded px-1.5 py-0.5 text-sm',
        'cursor-grab touch-none active:cursor-grabbing',
        isDragging && 'opacity-40',
      )}
    >
      <GripVertical size={12} className="shrink-0 text-(--color-fg-subtle) opacity-50" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <RoleBadges roles={roles} buckets={session.settings.buckets} />
      <span className="w-8 shrink-0 text-right tabular-nums text-(--color-fg-muted)">
        {price}
      </span>
    </li>
  )
}
