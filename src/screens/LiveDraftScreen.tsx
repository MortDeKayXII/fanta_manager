import { useEffect, useRef, useState } from 'react'
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'

import { AuctionPanel, PlayerSearch } from '@/screens/live/AuctionPanel'
import { FitCheckList } from '@/screens/live/FitCheckList'
import { RostersColumn } from '@/screens/live/RostersColumn'
import { StrategyBoard } from '@/screens/live/StrategyBoard'
import { DEMO_AUCTION_PLAYER_ID } from '@/mocks/fixtures'
import { useSession } from '@/store/session'
import type { Player } from '@/types'

/**
 * The app's core screen (spec §4.2): three columns.
 *   left   — auction panel + assign sale + undo + per-team fit checks
 *   middle — compact read-only rosters: mine first, the other teams below
 *   right  — strategy board, whole plan visible without scrolling
 *
 * Sales are live (step 2): Assegna records the purchase and Annulla reverts the
 * last one, both persisted. Flags are real (step 7). Step 8 adds drag & drop
 * from the middle column's "mine" rows onto the right column's slots: the
 * `DndContext` lives here because it's the one ancestor of both columns.
 *
 * Step 10 shortcuts, global to this screen since it's the one used under time
 * pressure: `/` focuses the player search, `u` undoes the last sale, `1`-`9`
 * pick the Nth team in the sale-assignment dropdown.
 */
export function LiveDraftScreen() {
  const { session, myTeam, sellPlayer, undoLastSale, assignSlot } = useSession()
  const [draggedPlayerId, setDraggedPlayerId] = useState<string>()
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Seeded with the demo fixture's player when it is still available, so the
  // panel is populated on a demo session and empty on a real one.
  const [auctionPlayerId, setAuctionPlayerId] = useState<string | undefined>(
    () =>
      session.players.find(
        (p) => p.id === DEMO_AUCTION_PLAYER_ID && p.status === 'available',
      )?.id,
  )
  const [teamId, setTeamId] = useState(myTeam.id)
  const [price, setPrice] = useState(
    () =>
      String(
        session.players.find((p) => p.id === DEMO_AUCTION_PLAYER_ID)?.avg_price ??
          '',
      ),
  )

  // Read through the session so the panel reflects the sale the instant it lands.
  const auctionPlayer = session.players.find((p) => p.id === auctionPlayerId)

  function pick(player: Player) {
    setAuctionPlayerId(player.id)
    setPrice(String(player.avg_price))
  }

  function confirm() {
    if (!auctionPlayer || auctionPlayer.status === 'sold') return
    const value = Number(price)
    if (!Number.isFinite(value) || value < 0) return

    sellPlayer({ playerId: auctionPlayer.id, teamId, price: value })
    // Clear the panel: the auction has moved on to the next player.
    setAuctionPlayerId(undefined)
    setPrice('')
  }

  // Global shortcuts for this screen only — bound at the document level so
  // they fire from wherever focus happens to be, except while typing in a
  // text field (where `1`-`9` and `/` must type normally).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable

      if (e.key === '/' && !typing) {
        e.preventDefault()
        searchInputRef.current?.focus()
        return
      }
      if (typing) return

      if (e.key === 'u') {
        e.preventDefault()
        undoLastSale()
        return
      }
      if (e.key >= '1' && e.key <= '9') {
        const team = session.teams[Number(e.key) - 1]
        if (team) {
          e.preventDefault()
          setTeamId(team.id)
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [session.teams, undoLastSale])

  const strategy =
    session.strategies.find((s) => s.id === session.active_strategy_id) ??
    session.strategies[0]
  const draggedPlayer = draggedPlayerId
    ? session.players.find((p) => p.id === draggedPlayerId)
    : undefined

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id)
    if (id.startsWith('player:')) setDraggedPlayerId(id.slice('player:'.length))
  }

  function onDragEnd(e: DragEndEvent) {
    setDraggedPlayerId(undefined)
    const activeId = String(e.active.id)
    const overId = e.over ? String(e.over.id) : undefined
    if (!overId || !activeId.startsWith('player:') || !overId.startsWith('slot:')) return
    if (!strategy) return

    // Drop is always permitted (spec §4.2) — assignSlot itself decides nothing
    // about role fit; a mismatch is purely `PuzzlePiece`'s styling concern.
    assignSlot({
      strategyId: strategy.id,
      slotId: overId.slice('slot:'.length),
      playerId: activeId.slice('player:'.length),
    })
  }

  return (
    <DndContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
      {/* The strategy column is widest: it holds two sub-columns of slots so the
         whole ~27-slot plan is readable without scrolling. */}
      <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-auto p-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.72fr)_minmax(0,1.35fr)] xl:overflow-hidden">
        {/* Left column */}
        <div className="flex min-h-0 flex-col gap-3 xl:overflow-y-auto">
          <PlayerSearch onPick={pick} inputRef={searchInputRef} />
          <AuctionPanel
            player={auctionPlayer}
            price={price}
            onPriceChange={setPrice}
            teamId={teamId}
            onTeamChange={setTeamId}
            onConfirm={confirm}
            onUndo={undoLastSale}
            canUndo={session.log.length > 0}
          />
          <FitCheckList player={auctionPlayer} price={Number(price) || 0} />
        </div>

        {/* Middle column */}
        <div className="min-h-0 xl:h-full">
          <RostersColumn />
        </div>

        {/* Right column */}
        <div className="min-h-0 xl:h-full">
          <StrategyBoard />
        </div>
      </div>

      <DragOverlay>
        {draggedPlayer && (
          <div className="flex h-7 items-center gap-1.5 rounded-(--radius-piece) bg-(--color-surface-3) px-2.5 text-[13px] shadow-lg">
            {draggedPlayer.name}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
