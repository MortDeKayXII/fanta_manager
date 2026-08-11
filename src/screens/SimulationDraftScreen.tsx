import { useMemo, useState } from 'react'
import { RoleBadges } from '@/components/badges'
import { useSession } from '@/store/session'

const FORMATIONS = [
  // 3-4-3
  {
    id: '3-4-3',
    label: '3-4-3',
    positions: [
      { id: 'por', label: 'POR', roles: ['Por'], row: 1 },
      { id: 'dc-1', label: 'DC', roles: ['B', 'Dc'], row: 2 },
      { id: 'dc-2', label: 'DC', roles: ['Dc'], row: 2 },
      { id: 'dc-3', label: 'DC', roles: ['Dc'], row: 2 },
      { id: 'e-1', label: 'E', roles: ['E'], row: 3 },
      { id: 'c-1', label: 'C', roles: ['C'], row: 3 },
      { id: 'm-2', label: 'M/C', roles: ['M', 'C'], row: 3 },
      { id: 'e-2', label: 'E', roles: ['E'], row: 3 },
      { id: 'a-1', label: 'W/A', roles: ['W','A'], row: 4 },
      { id: 'pc-1', label: 'A/PC', roles: ['A', 'Pc'], row: 4 },
      { id: 'a-2', label: 'W/A', roles: ['W', 'A'], row: 4 },
    ],
  },

  // 3-4-1-2
  {
    id: '3-4-1-2',
    label: '3-4-1-2',
    positions: [
      { id: 'por', label: 'POR', roles: ['Por'], row: 1 },
      { id: 'dc-1', label: 'DC', roles: ['B', 'Dc'], row: 2 },
      { id: 'dc-2', label: 'DC', roles: ['Dc'], row: 2 },
      { id: 'dc-3', label: 'DC', roles: ['Dc'], row: 2 },
      { id: 'e-1', label: 'E', roles: ['E'], row: 3 },
      { id: 'c-1', label: 'C', roles: ['C'], row: 3 },
      { id: 'm-2', label: 'M/C', roles: ['M', 'C'], row: 3 },
      { id: 'e-2', label: 'E', roles: ['E'], row: 3 },
      { id: 't-1', label: 'T', roles: ['T'], row: 4 },
      { id: 'pc-1', label: 'A/PC', roles: ['A', 'Pc'], row: 5 },
      { id: 'pc-2', label: 'A/PC', roles: ['A', 'Pc'], row: 5 },
    ],
  },

  // 3-4-2-1
  {
    id: '3-4-2-1',
    label: '3-4-2-1',
    positions: [
      { id: 'por', label: 'POR', roles: ['Por'], row: 1 },
      { id: 'dc-1', label: 'DC', roles: ['B', 'Dc'], row: 2 },
      { id: 'dc-2', label: 'DC', roles: ['Dc'], row: 2 },
      { id: 'dc-3', label: 'DC', roles: ['Dc'], row: 2 },
      { id: 'e-1', label: 'E', roles: ['E'], row: 3 },
      { id: 'm-1', label: 'M', roles: ['M'], row: 3 },
      { id: 'm-2', label: 'M/C', roles: ['M', 'C'], row: 3 },
      { id: 'w-1', label: 'W', roles: ['E','W'], row: 3 },
      { id: 't-1', label: 'T', roles: ['T',], row: 4 },
      { id: 't-2', label: 'T/A', roles: ['T', 'A'], row: 4 },
      { id: 'pc-1', label: 'PC', roles: ['A', 'Pc'], row: 4 },
    ],
  },

  // 3-5-2
  {
    id: '3-5-2',
    label: '3-5-2',
    positions: [
      { id: 'por', label: 'POR', roles: ['Por'], row: 1 },
      { id: 'dc-1', label: 'DC', roles: ['B','Dc'], row: 2 },
      { id: 'dc-2', label: 'DC', roles: ['Dc'], row: 2 },
      { id: 'dc-3', label: 'DC', roles: ['Dc'], row: 2 },
      { id: 'e-1', label: 'E', roles: ['E'], row: 3 },
      { id: 'm-1', label: 'M', roles: ['M'], row: 3 },
      { id: 'm-2', label: 'M/C', roles: ['M', 'C'], row: 3 },
      { id: 'c-1', label: 'C', roles: ['C'], row: 3 },
      { id: 'e-2', label: 'E/W', roles: ['E', 'W'], row: 3 },
      { id: 'a-1', label: 'A/PC', roles: ['A', 'Pc'], row: 4 },
      { id: 'a-2', label: 'A/PC', roles: ['A', 'Pc'], row: 4 },
    ],
  },

  // 3-5-1-1
  {
    id: '3-5-1-1',
    label: '3-5-1-1',
    positions: [
      { id: 'por', label: 'POR', roles: ['Por'], row: 1 },
      { id: 'dc-1', label: 'DC', roles: ['B','Dc'], row: 2 },
      { id: 'dc-2', label: 'DC', roles: ['Dc'], row: 2 },
      { id: 'dc-3', label: 'DC', roles: ['Dc'], row: 2 },
      { id: 'm-1', label: 'M', roles: ['M'], row: 3 },
      { id: 'm-2', label: 'M', roles: ['M'], row: 3 },
      { id: 'c-1', label: 'C', roles: ['C'], row: 3 },
      { id: 'e-1', label: 'E/W', roles: ['E', 'W'], row: 4 },
      { id: 'e-2', label: 'E/W', roles: ['E', 'W'], row: 4 },
      { id: 't-1', label: 'T/A', roles: ['T', 'A'], row: 4 },
      { id: 'a-1', label: 'A/PC', roles: ['A', 'Pc'], row: 5 },
    ],
  },

  // 4-3-3
  {
    id: '4-3-3',
    label: '4-3-3',
    positions: [
      { id: 'por', label: 'POR', roles: ['Por'], row: 1 },
      { id: 'dd', label: 'DD', roles: ['Dd'], row: 2 },
      { id: 'dc-1', label: 'DC', roles: ['Dc'], row: 2 },
      { id: 'dc-2', label: 'DC', roles: ['Dc'], row: 2 },
      { id: 'ds', label: 'DS', roles: ['Ds'], row: 2 },
      { id: 'm-1', label: 'M/C', roles: ['M', 'C'], row: 3 },
      { id: 'm-2', label: 'M', roles: ['M'], row: 3 },
      { id: 'c-1', label: 'C', roles: ['C'], row: 3 },
      { id: 'w-1', label: 'W/A', roles: ['W', 'A'], row: 4 },
      { id: 'a-1', label: 'A/PC', roles: ['A', 'Pc'], row: 4 },
      { id: 'w-2', label: 'W/A', roles: ['W', 'A'], row: 4 },
    ],
  },

  // 4-3-1-2
  {
    id: '4-3-1-2',
    label: '4-3-1-2',
    positions: [
      { id: 'por', label: 'POR', roles: ['Por'], row: 1 },
      { id: 'dd', label: 'DD', roles: ['Dd'], row: 2 },
      { id: 'dc-1', label: 'DC', roles: ['Dc'], row: 2 },
      { id: 'dc-2', label: 'DC', roles: ['Dc'], row: 2 },
      { id: 'ds', label: 'DS', roles: ['Ds'], row: 2 },
      { id: 'm-1', label: 'M/C', roles: ['M', 'C'], row: 3 },
      { id: 'm-2', label: 'M', roles: ['M'], row: 3 },
      { id: 'c-1', label: 'C', roles: ['C'], row: 3 },
      { id: 't-1', label: 'T', roles: ['T'], row: 4 },
      { id: 'a-1', label: 'T/A/PC', roles: ['T', 'A', 'Pc'], row: 5 },
      { id: 'a-2', label: 'A/PC', roles: ['A', 'Pc'], row: 5 },
    ],
  },

  // 4-4-2
  {
    id: '4-4-2',
    label: '4-4-2',
    positions: [
      { id: 'por', label: 'POR', roles: ['Por'], row: 1 },
      { id: 'dd', label: 'DD', roles: ['Dd'], row: 2 },
      { id: 'dc-1', label: 'DC', roles: ['Dc'], row: 2 },
      { id: 'dc-2', label: 'DC', roles: ['Dc'], row: 2 },
      { id: 'ds', label: 'DS', roles: ['Ds'], row: 2 },
      { id: 'e-1', label: 'E', roles: ['E'], row: 3 },
      { id: 'm-2', label: 'M/C', roles: ['M', 'C'], row: 3 },
      { id: 'c-1', label: 'C', roles: ['C'], row: 3 },
      { id: 'e-2', label: 'E/W', roles: ['E', 'W'], row: 3 },
      { id: 'a-1', label: 'A/PC', roles: ['A', 'Pc'], row: 4 },
      { id: 'a-2', label: 'A/PC', roles: ['A', 'Pc'], row: 4 },
    ],
  },

  // 4-1-4-1
  {
    id: '4-1-4-1',
    label: '4-1-4-1',
    positions: [
      { id: 'por', label: 'POR', roles: ['Por'], row: 1 },
      { id: 'dd', label: 'DD', roles: ['Dd'], row: 2 },
      { id: 'dc-1', label: 'DC', roles: ['Dc'], row: 2 },
      { id: 'dc-2', label: 'DC', roles: ['Dc'], row: 2 },
      { id: 'ds', label: 'DS', roles: ['Ds'], row: 2 },
      { id: 'm-1', label: 'M', roles: ['M'], row: 3 },
      { id: 'e-1', label: 'E/W', roles: ['E', 'W'], row: 4 },
      { id: 'c-1', label: 'C/T', roles: ['C', 'T'], row: 4 },
      { id: 't-1', label: 'T', roles: ['T'], row: 4 },
      { id: 'w-1', label: 'W', roles: ['W'], row: 4 },
      { id: 'a-1', label: 'A/PC', roles: ['A', 'Pc'], row: 5 },
    ],
  },

  // 4-4-1-1
  {
    id: '4-4-1-1',
    label: '4-4-1-1',
    positions: [
      { id: 'por', label: 'POR', roles: ['Por'], row: 1 },
      { id: 'dd', label: 'DD', roles: ['Dd'], row: 2 },
      { id: 'dc-1', label: 'DC', roles: ['Dc'], row: 2 },
      { id: 'dc-2', label: 'DC', roles: ['Dc'], row: 2 },
      { id: 'ds', label: 'DS', roles: ['Ds'], row: 2 },
      { id: 'm-1', label: 'M/C', roles: ['M', 'C'], row: 3 },
      { id: 'c-1', label: 'C', roles: ['C'], row: 3 },
      { id: 'e-1', label: 'E/W', roles: ['E', 'W'], row: 4 },
      { id: 't-1', label: 'T/A', roles: ['T', 'A'], row: 4 },
      { id: 'e-2', label: 'E/W', roles: ['E', 'W'], row: 4 },
      { id: 'a-1', label: 'A/PC', roles: ['A', 'Pc'], row: 5 },
    ],
  },

  // 4-2-3-1
  {
    id: '4-2-3-1',
    label: '4-2-3-1',
    positions: [
      { id: 'por', label: 'POR', roles: ['Por'], row: 1 },
      { id: 'dd', label: 'DD', roles: ['Dd'], row: 2 },
      { id: 'dc-1', label: 'DC', roles: ['Dc'], row: 2 },
      { id: 'dc-2', label: 'DC', roles: ['Dc'], row: 2 },
      { id: 'ds', label: 'DS', roles: ['Ds'], row: 2 },
      { id: 'm-1', label: 'M', roles: ['M'], row: 3 },
      { id: 'm-2', label: 'M/C', roles: ['M', 'C'], row: 3 },
      { id: 'w-1', label: 'W', roles: ['W', 'T'], row: 4 },
      { id: 't-1', label: 'T', roles: ['T'], row: 4 },
      { id: 'w-2', label: 'W/A', roles: ['W', 'A'], row: 4 },
      { id: 'a-1', label: 'A/PC', roles: ['A', 'Pc'], row: 5 },
    ],
  },
]

function formatPrice(p: number) {
  return `${p.toFixed(0)}¢`
}

function PitchOrList({
  module,
  formationAssignments,
  assignSimulationFormationPosition,
  clearSimulationFormationPosition,
  buckets,
}: any) {
  const [pitchView, setPitchView] = useState<boolean>(() => {
    try {
      if (typeof window === 'undefined') return true
      return window.localStorage.getItem('simulatePitch') !== 'false'
    } catch (e) {
      return true
    }
  })

  const savePitch = (v: boolean) => {
    try { window.localStorage.setItem('simulatePitch', v ? 'true' : 'false') } catch {}
    setPitchView(v)
  }

  if (!pitchView) {
    return (
      <div className="space-y-3">
        {module.positions.map((position: any) => {
          const item = formationAssignments.find((it: any) => it.position.id === position.id)!
          const { options, selected } = item
          return (
            <div key={position.id} className="rounded-lg border border-(--color-border) bg-(--color-surface-2) p-3 text-xs">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs text-(--color-fg-subtle)">
                <div className="flex items-center gap-3">
                  <div className="font-medium">{position.label}</div>
                  <div className="text-(--color-fg-subtle)">{position.roles.join(', ')}</div>
                </div>
                <div className="text-xs text-(--color-fg-subtle)">Available: {options.length}</div>
              </div>

              <select
                value={selected?.id ?? ''}
                onChange={(e) => {
                  const value = e.target.value
                  if (!value) {
                    clearSimulationFormationPosition({ moduleId: module.id, positionId: position.id })
                    return
                  }
                  assignSimulationFormationPosition({ moduleId: module.id, positionId: position.id, playerId: value })
                }}
                className="w-full rounded-md border border-(--color-border) bg-(--color-surface) px-2 py-1 text-sm"
              >
                <option value="">Seleziona un giocatore</option>
                {options.map((player: any) => (
                  <option key={player.id} value={player.id}>
                    {player.name} ({player.real_team})
                  </option>
                ))}
              </select>

              {selected ? (
                <div className="mt-2">
                  <RoleBadges roles={selected.roles} buckets={buckets} />
                </div>
              ) : null}
            </div>
          )
        })}

        <div className="flex items-center gap-3">
          <button className="rounded bg-(--color-surface-3) px-3 py-1 text-sm" onClick={() => savePitch(true)}>
            Usa vista pitch
          </button>
        </div>
      </div>
    )
  }

  // Pitch view: compute coords from row/order or use explicit coords on position
  const rows = new Map<number, any[]>()
  for (const position of module.positions) {
    const rowKey = position.row ?? 0
    const row = rows.get(rowKey) ?? []
    rows.set(rowKey, [...row, position])
  }
  const rowEntries = [...rows.entries()].sort(([a], [b]) => a - b).map(([, positions]) => positions)

  const positionsWithCoords: Array<{ position: any; x: number; y: number }> = []
  rowEntries.forEach((positions, rIdx) => {
    const totalRows = rowEntries.length
    const y = totalRows === 1 ? 50 : 10 + (rIdx / (totalRows - 1)) * 80
    const count = positions.length
    positions.forEach((position: any, idx: number) => {
      if (position.coords && typeof position.coords.x === 'number' && typeof position.coords.y === 'number') {
        positionsWithCoords.push({ position, x: position.coords.x, y: position.coords.y })
      } else {
        const x = count === 1 ? 50 : 10 + (idx / (count - 1)) * 80
        positionsWithCoords.push({ position, x, y })
      }
    })
  })

  return (
    <div className="relative h-96 rounded-lg border border-(--color-border) bg-(--color-surface-2) p-4">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#0f7a1f,transparent)] opacity-8" />
      {positionsWithCoords.map(({ position, x, y }) => {
        const item = formationAssignments.find((it: any) => it.position.id === position.id)!
        const { options, selected } = item
        return (
          <div
            key={position.id}
            style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
            className="absolute w-40 max-w-[40%] rounded-lg border border-(--color-border) bg-(--color-surface) p-2 text-xs shadow-sm"
          >
            <div className="mb-1 flex items-center justify-between gap-2 text-xs text-(--color-fg-subtle)">
              <span>{position.label}</span>
              <span>{position.roles.join(', ')}</span>
            </div>
            <select
              value={selected?.id ?? ''}
              onChange={(e) => {
                const value = e.target.value
                if (!value) {
                  clearSimulationFormationPosition({ moduleId: module.id, positionId: position.id })
                  return
                }
                assignSimulationFormationPosition({ moduleId: module.id, positionId: position.id, playerId: value })
              }}
              className="w-full rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 py-1 text-sm"
            >
              <option value="">Seleziona un giocatore</option>
              {options.map((player: any) => (
                <option key={player.id} value={player.id}>
                  {player.name} ({player.real_team})
                </option>
              ))}
            </select>
            {selected ? (
              <div className="mt-2">
                <RoleBadges roles={selected.roles} buckets={buckets} />
              </div>
            ) : null}
          </div>
        )
      })}

      <div className="absolute bottom-3 left-3 flex items-center gap-2">
        <button className="rounded bg-(--color-surface-3) px-3 py-1 text-sm" onClick={() => savePitch(false)}>
          Usa vista elenco
        </button>
      </div>
    </div>
  )
}

export function SimulationDraftScreen() {
  const {
    session,
    availablePlayers,
    assignSimulationSlot,
    clearSimulationSlot,
    setSimulationStrategy,
    assignSimulationFormationPosition,
    clearSimulationFormationPosition,
    setSimulationModule,
  } = useSession()

  const strategies = session.strategies
  const strategyId =
    session.simulation_strategy_id ?? session.active_strategy_id ?? strategies[0]?.id
  const strategy = strategies.find((s) => s.id === strategyId) || strategies[0]

  const moduleId = session.simulation_module_id ?? FORMATIONS[0].id
  const module = FORMATIONS.find((f) => f.id === moduleId) || FORMATIONS[0]

  const bucketOrder = session.settings.buckets.map((b) => b.id)

  const simulationPlayerIds = useMemo(() => {
    if (!strategy) return []
    const simulationBySlot = session.simulation_state[strategy.id] ?? {}
    return Object.values(simulationBySlot).filter(Boolean)
  }, [session.simulation_state, strategy])

  const mockPlayers = useMemo(
    () => availablePlayers.filter((p) => simulationPlayerIds.includes(p.id)),
    [availablePlayers, simulationPlayerIds],
  )

  const orderedSlots = useMemo(() => {
    if (!strategy) return []

    const slotIndex = strategy.slots.reduce<Record<string, number>>((acc, slot, index) => {
      acc[slot.id] = index
      return acc
    }, {})

    return [...strategy.slots].sort((a, b) => {
      const aBucket = bucketOrder.indexOf(a.bucket_id)
      const bBucket = bucketOrder.indexOf(b.bucket_id)
      if (aBucket !== bBucket) return aBucket - bBucket
      return slotIndex[a.id] - slotIndex[b.id]
    })
  }, [strategy, bucketOrder])

  const assignments = useMemo(() => {
    if (!strategy) return []

    const simulationBySlot = session.simulation_state[strategy.id] ?? {}

    return orderedSlots.map((slot) => {
      const bucket = session.settings.buckets.find((b) => b.id === slot.bucket_id)
      const allowedRoles = bucket ? bucket.roles : []
      const candidates = availablePlayers.filter((p) =>
        p.roles.some((r) => allowedRoles.includes(r)),
      )
      const selectedId = simulationBySlot[slot.id]
      const selected = candidates.find((p) => p.id === selectedId)

      const takenIds = Object.entries(simulationBySlot)
        .filter(([slotId]) => slotId !== slot.id)
        .map(([, playerId]) => playerId)

      const availableOptions = candidates
        .filter((p) => !takenIds.includes(p.id) || p.id === selectedId)
        .sort((a, b) =>
          a.avg_price !== b.avg_price
            ? b.avg_price - a.avg_price
            : a.name.localeCompare(b.name),
        )

      return {
        slot,
        bucket,
        options: availableOptions,
        selected,
      }
    })
  }, [strategy, orderedSlots, availablePlayers, session.settings.buckets, session.simulation_state])

  const result = useMemo(() => {
    const totals = assignments.reduce(
      (acc, item) => {
        if (!item.selected) {
          acc.unfilled += 1
          return acc
        }
        const diff = item.slot.target_price - item.selected.avg_price
        acc.total += item.selected.avg_price
        acc.totalDifferential += diff
        return acc
      },
      { total: 0, unfilled: 0, totalDifferential: 0 },
    )

    return {
      assignments,
      total: totals.total,
      unfilled: totals.unfilled,
      totalDifferential: totals.totalDifferential,
    }
  }, [assignments])

  const myTeam = session.teams.find((t) => t.isMe) ?? session.teams[0]
  const formationState = session.simulation_formation_state[module.id] ?? {}

  

  const formationAssignments = module.positions.map((position) => {
    const selectedId = formationState[position.id]
    const selected = mockPlayers.find((p) => p.id === selectedId)

    const takenIds = Object.entries(formationState)
      .filter(([positionId]) => positionId !== position.id)
      .map(([, playerId]) => playerId)

    const options = mockPlayers
      .filter((p) =>
        p.roles.some((r) => position.roles.includes(r)) &&
        (!takenIds.includes(p.id) || p.id === selectedId),
      )
      .sort((a, b) =>
        a.avg_price !== b.avg_price
          ? b.avg_price - a.avg_price
          : a.name.localeCompare(b.name),
      )

    return { position, options, selected }
  })

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex items-baseline gap-4">
          <h2 className="text-lg font-semibold">Simulazione asta</h2>
          <p className="text-sm text-(--color-fg-subtle)">Testa una strategia su giocatori disponibili, pagando il avg_price.</p>
        </header>

        <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-4">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-3">
              <span className="text-sm">Strategia</span>
              <select
                value={strategy?.id}
                onChange={(e) => setSimulationStrategy(e.target.value)}
                className="ml-2 h-9 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2"
              >
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-3">
              <span className="text-sm">Modulo</span>
              <select
                value={module.id}
                onChange={(e) => setSimulationModule(e.target.value)}
                className="ml-2 h-9 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2"
              >
                {FORMATIONS.map((formation) => (
                  <option key={formation.id} value={formation.id}>
                    {formation.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-3">
              <span className="text-sm">Pitch view</span>
              <input
                type="checkbox"
                className="ml-2 h-4 w-4"
                checked={typeof window !== 'undefined' ? (window.localStorage.getItem('simulatePitch') === 'true' ? true : false) : true}
                onChange={(e) => {
                  const v = e.target.checked
                  try { window.localStorage.setItem('simulatePitch', v ? 'true' : 'false') } catch {}
                  // update local state handled below by setPitchView
                }}
              />
            </label>
          </div>

          {!strategy && <p className="mt-4 text-sm">Nessuna strategia definita.</p>}

          {strategy && (
            <div className="mt-4 grid gap-6 xl:grid-cols-[1.05fr_1fr]">
                <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold">Formazione mock</h3>
                    <p className="text-xs text-(--color-fg-subtle)">Puoi scegliere solo i giocatori già assegnati nella simulazione.</p>
                  </div>
                  <div className="rounded-lg bg-(--color-surface-2) px-3 py-2 text-xs text-(--color-fg-subtle)">
                    Giocatori selezionati: {mockPlayers.length}
                  </div>
                </div>

                {/* Pitch vs list view toggle */}
                <PitchOrList
                  module={module}
                  formationAssignments={formationAssignments}
                  assignSimulationFormationPosition={assignSimulationFormationPosition}
                  clearSimulationFormationPosition={clearSimulationFormationPosition}
                  buckets={session.settings.buckets}
                />
              </div>

              <div className="space-y-6">
                <h3 className="text-sm font-semibold">Simulazione asta</h3>
                <table className="w-full table-auto text-sm">
                  <thead>
                    <tr className="text-left text-xs text-(--color-fg-subtle)">
                      <th className="pb-2">Slot</th>
                      <th className="pb-2">Bucket</th>
                      <th className="pb-2">Max credit</th>
                      <th className="pb-2">Giocatore</th>
                      <th className="pb-2">Prezzo</th>
                      <th className="pb-2">Differenziale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.assignments.map((assignment) => (
                      <tr key={assignment.slot.id} className="align-top border-t border-(--color-border)">
                        <td className="py-2">{assignment.slot.id}</td>
                        <td className="py-2">{assignment.bucket?.label ?? '—'}</td>
                        <td className="py-2">{assignment.slot.target_price}</td>
                        <td className="py-2">
                          <select
                            value={assignment.selected?.id ?? ''}
                            onChange={(e) => {
                              const value = e.target.value
                              if (!value) {
                                clearSimulationSlot({
                                  strategyId: strategy?.id ?? '',
                                  slotId: assignment.slot.id,
                                })
                                return
                              }

                              assignSimulationSlot({
                                strategyId: strategy?.id ?? '',
                                slotId: assignment.slot.id,
                                playerId: value,
                              })
                            }}
                            className="w-full rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 py-1 text-sm"
                          >
                            <option value="">Seleziona un giocatore</option>
                            {assignment.options.map((player) => (
                              <option key={player.id} value={player.id}>
                                {player.name} ({player.real_team}) • {player.roles.join(', ')} — {formatPrice(player.avg_price)}
                              </option>
                            ))}
                          </select>
                          {assignment.selected ? (
                            <div className="mt-2">
                              <RoleBadges
                                roles={assignment.selected.roles}
                                buckets={session.settings.buckets}
                              />
                            </div>
                          ) : null}
                        </td>
                        <td className="py-2">
                          {assignment.selected ? formatPrice(assignment.selected.avg_price) : '—'}
                        </td>
                        <td
                          className={
                            'py-2 ' +
                            (assignment.selected
                              ? assignment.slot.target_price - assignment.selected.avg_price >= 0
                                ? 'text-(--color-success)'
                                : 'text-(--color-danger)'
                              : 'text-(--color-fg-subtle)')
                          }
                        >
                          {assignment.selected
                            ? `${assignment.slot.target_price - assignment.selected.avg_price >= 0 ? '+' : ''}${formatPrice(
                                assignment.slot.target_price - assignment.selected.avg_price,
                              )}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-(--color-surface-2) px-3 py-2 text-sm">
                    <div className="text-(--color-fg-subtle)">Totale stimato</div>
                    <div className="mt-1 text-lg font-semibold">{formatPrice(result.total)}</div>
                  </div>
                  <div className="rounded-lg bg-(--color-surface-2) px-3 py-2 text-sm">
                    <div className="text-(--color-fg-subtle)">Budget squadra ({myTeam.name})</div>
                    <div className="mt-1 text-lg font-semibold">{formatPrice(myTeam.budget_total)}</div>
                  </div>
                  <div className="rounded-lg bg-(--color-surface-2) px-3 py-2 text-sm">
                    <div className="text-(--color-fg-subtle)">Differenziale totale</div>
                    <div
                      className={
                        'mt-1 text-lg font-semibold ' +
                        (result.totalDifferential >= 0
                          ? 'text-(--color-success)'
                          : 'text-(--color-danger)')
                      }
                    >
                      {result.totalDifferential >= 0 ? '+' : ''}
                      {formatPrice(result.totalDifferential)}
                    </div>
                  </div>
                </div>

                <div className="mt-2">
                  {result.unfilled > 0 && (
                    <p className="text-sm text-(--color-danger)">Slot non compilati: {result.unfilled}</p>
                  )}
                  {result.total > myTeam.budget_total && (
                    <p className="text-sm text-(--color-danger)">Attenzione: costo totale superiore al budget della squadra.</p>
                  )}
                  {result.total <= myTeam.budget_total && result.unfilled === 0 && (
                    <p className="text-sm text-(--color-brand)">La strategia è realizzabile con il budget e i vincoli attuali.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SimulationDraftScreen
