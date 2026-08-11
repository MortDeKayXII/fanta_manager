/**
 * The single data seam for the whole app.
 *
 * Backed by IndexedDB (`store/db.ts`) with debounced writes: React state is the
 * source of truth for the current render, and the database trails it by at most
 * `WRITE_DEBOUNCE_MS`. Every mutation goes through a named action from
 * `store/actions.ts`, so the persistence and the domain logic stay separable and
 * the actions remain unit-testable without React.
 *
 * On first launch the database is empty and the demo fixtures are seeded, so the
 * app is never a blank screen; "Nuova sessione" in Settings replaces them with an
 * empty session.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { DEMO_SESSION } from '@/mocks/fixtures'
import { openSlots, rosterOf, spentBy, totalQuota } from '@/lib/buckets'
import * as actions from '@/store/actions'
import * as db from '@/store/db'
import type { MergeReport } from '@/store/actions'
import {
  BUCKET_COLORS,
  type DraftSession,
  type MantraRole,
  type Player,
  type RoleBucket,
  type Settings,
  type Strategy,
  type Team,
  type TierDef,
} from '@/types'

/** Long enough to coalesce a burst of keystrokes, short enough to survive a crash. */
const WRITE_DEBOUNCE_MS = 400

/** Readable id fragment, so a player id is recognizable while debugging. */
const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20)

interface TeamFinance {
  spent: number
  remaining: number
  rosterSize: number
  openSlots: number
}

interface SessionActions {
  sellPlayer: (args: { playerId: string; teamId: string; price: number }) => void
  undoLastSale: () => void
  upsertPlayer: (player: Player) => void
  /** Destructive: drops the existing database, purchases included. */
  replacePlayers: (players: Player[]) => void
  /**
   * Non-destructive import: refreshes matching players by name + club and keeps
   * sales and annotations. Returns what it did, so the UI can report it.
   */
  mergePlayers: (players: Player[]) => MergeReport
  editPlayer: (
    playerId: string,
    patch: Partial<Pick<Player, 'name' | 'real_team' | 'roles' | 'avg_price' | 'tier'>>,
  ) => void
  deletePlayer: (playerId: string) => void
  /**
   * Id generator for imported rows. Exposed because the importer needs ids while
   * parsing, and the provider is the only place allowed to read the clock.
   */
  newPlayerId: (index: number, name: string) => string
  annotatePlayer: (
    playerId: string,
    patch: Pick<Player, 'personal_tag' | 'personal_note' | 'personal_max_price'>,
  ) => void
  addPlayer: (args: {
    name: string
    realTeam: string
    roles: MantraRole[]
    avgPrice: number
    tier: string
  }) => void

  assignSlot: (args: { strategyId: string; slotId: string; playerId: string }) => void
  clearSlot: (args: { strategyId: string; slotId: string }) => void

  updateSettings: (patch: Partial<Settings>) => void
  setBuckets: (buckets: RoleBucket[]) => void
  /** Prefer these over setBuckets: they read the latest state, so two edits in
   *  quick succession cannot clobber each other. */
  patchBucket: (bucketId: string, patch: Partial<RoleBucket>) => void
  toggleBucketRole: (bucketId: string, role: MantraRole) => void
  removeBucket: (bucketId: string) => void
  addBucket: () => void

  setTiers: (tiers: TierDef[]) => void
  /** Prefer this over setTiers for the same reason as patchBucket. */
  patchTier: (tierId: string, patch: Partial<TierDef>) => void
  removeTier: (tierId: string) => void
  addTier: () => void
  /** Reorder a tier — order drives the ordinal sort on the Prep board. */
  moveTier: (tierId: string, direction: 'up' | 'down') => void

  updateTeam: (teamId: string, patch: Partial<Team>) => void
  /**
   * Resize the league to this many teams — growing appends generic teams,
   * shrinking removes from the end but stops before dropping a team with a
   * logged purchase or the user's own team, so the actual count may end up
   * higher than requested rather than corrupting a sale.
   */
  setNumTeams: (count: number) => void

  upsertStrategy: (strategy: Strategy) => void
  deleteStrategy: (strategyId: string) => void
  setActiveStrategy: (strategyId: string | undefined) => void
  /**
   * Copy a strategy from another session (found by id, e.g. from `sessions`)
   * into the current one under a fresh id, returned so the caller can select
   * it. Returns undefined if the source id doesn't resolve to a strategy in
   * any known session.
   */
  importStrategy: (fromSessionId: string, strategyId: string) => string | undefined
  renameSession: (name: string) => void
}

interface SessionContextValue extends SessionActions {
  session: DraftSession
  /** True until the first read from IndexedDB resolves. */
  loading: boolean
  /**
   * Generic escape hatch. Prefer a named action: anything reached through here
   * bypasses the documented invariants in `store/actions.ts`.
   */
  update: (fn: (draft: DraftSession) => DraftSession) => void

  // Derived read helpers — always computed from sold_to / sold_price.
  squadSize: number
  myTeam: Team
  rosterOf: (teamId: string) => Player[]
  financeOf: (teamId: string) => TeamFinance
  playerById: (id: string) => Player | undefined
  availablePlayers: Player[]

  // Session management
  sessions: DraftSession[]
  newSession: (args?: { name?: string; numTeams?: number; budgetPerTeam?: number }) => void
  switchSession: (id: string) => void
  deleteSession: (id: string) => void
  loadDemoData: () => void
  /**
   * Imports a full session parsed from an exported JSON file (spec §5).
   * Assigns a fresh id when one already exists in this browser's database, so
   * re-importing a backup never silently overwrites the session it came from.
   */
  importSession: (imported: DraftSession) => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<DraftSession>(DEMO_SESSION)
  const [sessions, setSessions] = useState<DraftSession[]>([])
  const [loading, setLoading] = useState(true)

  /** Pending debounced write, so a rapid burst of edits produces one save. */
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** Suppresses the write that a state change would otherwise trigger — used
   *  when the state came FROM the database and re-saving it is pointless. */
  const skipNextWrite = useRef(true)

  const refreshList = useCallback(async () => {
    setSessions(await db.listSessions())
  }, [])

  // Initial load. An empty database is seeded with the demo fixtures so the app
  // always has something to show.
  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const existing = await db.loadActiveSession()
        if (cancelled) return

        if (existing) {
          skipNextWrite.current = true
          setSession(existing)
        } else {
          await db.saveSession(DEMO_SESSION)
          await db.setActiveSessionId(DEMO_SESSION.id)
          if (cancelled) return
          skipNextWrite.current = true
          setSession(DEMO_SESSION)
        }
        await refreshList()
      } catch (err) {
        // A blocked or unavailable IndexedDB (private mode, quota) must not take
        // the app down: fall back to in-memory state and say so once.
        console.error('fantadraft: persistence unavailable, running in memory', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [refreshList])

  // Debounced persistence of whatever the current session is.
  useEffect(() => {
    if (loading) return
    if (skipNextWrite.current) {
      skipNextWrite.current = false
      return
    }

    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void db.saveSession(session).catch((err) => {
        console.error('fantadraft: save failed', err)
      })
    }, WRITE_DEBOUNCE_MS)

    return () => clearTimeout(timer.current)
  }, [session, loading])

  // Flush a pending write when the tab is hidden or closed — closing the browser
  // mid-auction must not lose the last few seconds of edits.
  useEffect(() => {
    const flush = () => {
      if (timer.current === undefined) return
      clearTimeout(timer.current)
      timer.current = undefined
      void db.saveSession(session)
    }
    window.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [session])

  const update = useCallback(
    (fn: (draft: DraftSession) => DraftSession) => setSession(fn),
    [],
  )

  const value = useMemo<SessionContextValue>(() => {
    const { players, teams, settings } = session
    const squadSize = totalQuota(settings.buckets)

    /** Run a pure action against the current session. */
    const act =
      <A extends unknown[]>(fn: (s: DraftSession, ...args: A) => DraftSession) =>
      (...args: A) =>
        setSession((s) => fn(s, ...args))

    /**
     * Ids and timestamps are generated here — the only place in the app allowed
     * to read the clock, so the actions stay pure and deterministic.
     */
    const now = () => Date.now()
    const uid = (prefix: string) =>
      `${prefix}-${now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

    const switchTo = (next: DraftSession) => {
      skipNextWrite.current = true
      setSession(next)
      void db.setActiveSessionId(next.id)
    }

    return {
      session,
      loading,
      update,

      // --- Actions ---
      sellPlayer: ({ playerId, teamId, price }) =>
        setSession((s) =>
          actions.sellPlayer(s, { playerId, teamId, price, at: now() }),
        ),
      undoLastSale: act(actions.undoLastSale),
      upsertPlayer: act(actions.upsertPlayer),
      replacePlayers: act(actions.replacePlayers),
      // Computed once against the current session so the report and the applied
      // state describe the same merge. Import is a single deliberate click, so
      // there is no burst of concurrent merges to race with.
      mergePlayers: (incoming) => {
        const { session: next, report } = actions.mergePlayers(session, incoming)
        setSession(next)
        return report
      },
      editPlayer: act(actions.editPlayer),
      deletePlayer: act(actions.deletePlayer),
      newPlayerId: (index, name) =>
        `p-${now().toString(36)}-${index}-${slug(name)}`,
      annotatePlayer: act(actions.annotatePlayer),
      addPlayer: (args) =>
        setSession((s) =>
          actions.upsertPlayer(s, actions.makePlayer({ id: uid('p'), ...args })),
        ),

      assignSlot: act(actions.assignSlot),
      clearSlot: act(actions.clearSlot),

      updateSettings: act(actions.updateSettings),
      setBuckets: act(actions.setBuckets),
      patchBucket: act(actions.patchBucket),
      toggleBucketRole: act(actions.toggleBucketRole),
      removeBucket: act(actions.removeBucket),
      addBucket: () => setSession((s) => actions.addBucket(s, BUCKET_COLORS)),

      setTiers: act(actions.setTiers),
      patchTier: act(actions.patchTier),
      removeTier: act(actions.removeTier),
      addTier: () => setSession((s) => actions.addTier(s, BUCKET_COLORS)),
      moveTier: act(actions.moveTier),

      updateTeam: act(actions.updateTeam),
      setNumTeams: (count) =>
        setSession((s) => actions.setNumTeams(s, count, (i) => uid(`t${i}`))),

      upsertStrategy: act(actions.upsertStrategy),
      deleteStrategy: act(actions.deleteStrategy),
      setActiveStrategy: act(actions.setActiveStrategy),
      importStrategy: (fromSessionId, strategyId) => {
        const source = (
          fromSessionId === session.id ? session : sessions.find((s) => s.id === fromSessionId)
        )?.strategies.find((s) => s.id === strategyId)
        if (!source) return undefined
        const id = uid('s')
        setSession((s) => actions.importStrategy(s, source, id))
        return id
      },
      renameSession: act(actions.renameSession),

      // --- Derived reads ---
      squadSize,
      myTeam: teams.find((t) => t.isMe) ?? teams[0],
      rosterOf: (teamId) => rosterOf(players, teamId),
      financeOf: (teamId) => {
        const team = teams.find((t) => t.id === teamId)
        const spent = spentBy(players, teamId)
        return {
          spent,
          remaining: (team?.budget_total ?? settings.budget_per_team) - spent,
          rosterSize: rosterOf(players, teamId).length,
          openSlots: openSlots(settings, players, teamId),
        }
      },
      playerById: (id) => players.find((p) => p.id === id),
      availablePlayers: players.filter((p) => p.status === 'available'),

      // --- Session management ---
      sessions,
      newSession: (args) => {
        const created = actions.createSession({
          id: uid('s'),
          name: args?.name?.trim() || 'Nuova sessione',
          createdAt: now(),
          numTeams: args?.numTeams,
          budgetPerTeam: args?.budgetPerTeam,
        })
        void (async () => {
          await db.saveSession(created)
          switchTo(created)
          await refreshList()
        })()
      },
      switchSession: (id) => {
        void (async () => {
          const found = await db.loadSession(id)
          if (found) switchTo(found)
        })()
      },
      deleteSession: (id) => {
        void (async () => {
          await db.deleteSession(id)
          if (id === session.id) {
            const next = await db.loadActiveSession()
            if (next) switchTo(next)
            else {
              const fresh = actions.createSession({
                id: uid('s'),
                name: 'Nuova sessione',
                createdAt: now(),
              })
              await db.saveSession(fresh)
              switchTo(fresh)
            }
          }
          await refreshList()
        })()
      },
      loadDemoData: () => {
        void (async () => {
          await db.saveSession(DEMO_SESSION)
          switchTo(DEMO_SESSION)
          await refreshList()
        })()
      },
      importSession: (imported) => {
        void (async () => {
          const collides = await db.loadSession(imported.id)
          const toSave = collides ? { ...imported, id: uid('s') } : imported
          await db.saveSession(toSave)
          switchTo(toSave)
          await refreshList()
        })()
      },
    }
  }, [session, sessions, loading, update, refreshList])

  return <SessionContext value={value}>{children}</SessionContext>
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>')
  return ctx
}
