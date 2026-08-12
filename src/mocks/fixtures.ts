/**
 * Hardcoded demo session for the visual layer (plan step 1).
 *
 * Represents a draft already in progress so every screen has something real to
 * render: ~20 players sold across 8 teams, a populated log, two strategies, and
 * slot assignments that include a deliberate role mismatch so the danger-colored
 * puzzle piece is visible on first load.
 *
 * Step 2 replaces this as the default source of `useSession()`; it survives
 * behind a "Load demo data" button.
 */

import { defaultBuckets, totalQuota } from '@/lib/buckets'
import {defaultPrepFilters} from '@/lib/prep'
import { defaultTiers } from '@/lib/tiers'
import type {
  DraftLogEntry,
  DraftSession,
  MantraRole,
  Player,
  SlotAssignments,
  Strategy,
  Team,
} from '@/types'

/**
 * Fixture rows spell tiers as the readable "TIT"/"PAN"/"SCO" shorthand; this
 * maps them onto the default preset's actual (lowercase) tier ids from
 * `lib/tiers.ts`, so the 70+ rows below don't need rewriting by hand.
 */
type FixtureTier = 'TIT' | 'PAN' | 'SCO'
const FIXTURE_TIER_ID: Record<FixtureTier, string> = { TIT: 'tit', PAN: 'pan', SCO: 'sco' }

const BUDGET = 500

export const DEMO_TEAMS: Team[] = [
  { id: 't1', name: 'Real Fantacalcio', budget_total: BUDGET, isMe: true },
  { id: 't2', name: 'Ajax Terni', budget_total: BUDGET },
  { id: 't3', name: 'Borussia Mochtaringhen', budget_total: BUDGET },
  { id: 't4', name: 'Bayer Leverkusiamo', budget_total: BUDGET },
  { id: 't5', name: 'Deportivo La Cotogna', budget_total: BUDGET },
  { id: 't6', name: 'Manchester Sitty', budget_total: BUDGET },
  { id: 't7', name: 'Atletico Mandrogne', budget_total: BUDGET },
  { id: 't8', name: 'Panatta Atene', budget_total: BUDGET },
]

/** Compact tuple form keeps the fixture readable: name, club, roles, avg, tier. */
type Row = [string, string, MantraRole[], number, FixtureTier]

const ROWS: Row[] = [
  // --- Portieri -----------------------------------------------------------
  ['Maignan', 'MIL', ['Por'], 24, 'TIT'],
  ['Di Gregorio', 'JUV', ['Por'], 19, 'TIT'],
  ['Meret', 'NAP', ['Por'], 17, 'TIT'],
  ['Svilar', 'ROM', ['Por'], 21, 'TIT'],
  ['Sommer', 'INT', ['Por'], 20, 'TIT'],
  ['Provedel', 'LAZ', ['Por'], 15, 'TIT'],
  ['Falcone', 'LEC', ['Por'], 9, 'PAN'],
  ['Okoye', 'UDI', ['Por'], 8, 'PAN'],
  ['Sportiello', 'MIL', ['Por'], 3, 'SCO'],
  ['Perin', 'JUV', ['Por'], 3, 'SCO'],

  // --- Difensori (Dc / B / Dd / Ds) --------------------------------------
  ['Bastoni', 'INT', ['Dc', 'B'], 42, 'TIT'],
  ['Bremer', 'JUV', ['Dc'], 34, 'TIT'],
  ['Buongiorno', 'NAP', ['Dc'], 28, 'TIT'],
  ['Tomori', 'MIL', ['Dc'], 22, 'TIT'],
  ['Dimarco', 'INT', ['Ds', 'E'], 48, 'TIT'],
  ['Theo Hernandez', 'MIL', ['Ds', 'E'], 44, 'TIT'],
  ['Cambiaso', 'JUV', ['Dd', 'Ds', 'E'], 31, 'TIT'],
  ['Di Lorenzo', 'NAP', ['Dd', 'B'], 33, 'TIT'],
  ['Bisseck', 'INT', ['Dc', 'Dd'], 14, 'PAN'],
  ['Gatti', 'JUV', ['Dc'], 13, 'PAN'],
  ['Romagnoli', 'LAZ', ['Dc'], 12, 'PAN'],
  ['Kristensen', 'ROM', ['Dd', 'B'], 9, 'PAN'],
  ['Dorgu', 'LEC', ['Ds', 'E'], 11, 'SCO'],
  ['Kayode', 'FIO', ['Dd', 'B'], 8, 'SCO'],
  ['Bijol', 'UDI', ['Dc'], 10, 'PAN'],
  ['Baschirotto', 'LEC', ['Dc'], 7, 'PAN'],

  // --- Esterni / Mediani (E / M) -----------------------------------------
  ['Barella', 'INT', ['M', 'C'], 52, 'TIT'],
  ['Lobotka', 'NAP', ['M'], 26, 'TIT'],
  ['Locatelli', 'JUV', ['M', 'C'], 23, 'TIT'],
  ['Rovella', 'LAZ', ['M'], 18, 'TIT'],
  ['Fofana', 'MIL', ['M', 'C'], 25, 'TIT'],
  ['Anguissa', 'NAP', ['M', 'C'], 30, 'TIT'],
  ['Mkhitaryan', 'INT', ['M', 'C'], 22, 'TIT'],
  ['Thuram-Ulien', 'JUV', ['M'], 11, 'PAN'],
  ['Payero', 'UDI', ['M', 'C'], 6, 'SCO'],
  ['Gendrey', 'LEC', ['E', 'Dd'], 7, 'SCO'],

  // --- Centrocampisti offensivi (C / T) ----------------------------------
  ['Koopmeiners', 'JUV', ['C', 'T'], 58, 'TIT'],
  ['Pellegrini', 'ROM', ['T', 'C'], 27, 'TIT'],
  ['Zaccagni', 'LAZ', ['T', 'W'], 32, 'TIT'],
  ['McTominay', 'NAP', ['C', 'T'], 41, 'TIT'],
  ['Loftus-Cheek', 'MIL', ['C', 'T'], 19, 'PAN'],
  ['Frattesi', 'INT', ['C', 'T'], 21, 'PAN'],
  ['Bonaventura', 'FIO', ['T', 'C'], 14, 'PAN'],
  ['Sucic', 'INT', ['C'], 9, 'SCO'],
  ['Fazzini', 'FIO', ['T', 'C'], 12, 'SCO'],
  ['Colpani', 'FIO', ['T', 'W'], 20, 'PAN'],

  // --- Attaccanti (W / A / Pc) -------------------------------------------
  ['Lautaro Martinez', 'INT', ['A', 'Pc'], 96, 'TIT'],
  ['Vlahovic', 'JUV', ['Pc'], 78, 'TIT'],
  ['Lukaku', 'NAP', ['Pc'], 74, 'TIT'],
  ['Leao', 'MIL', ['W', 'A'], 82, 'TIT'],
  ['Dybala', 'ROM', ['T', 'A'], 61, 'TIT'],
  ['Thuram', 'INT', ['A', 'Pc'], 71, 'TIT'],
  ['Kean', 'FIO', ['Pc'], 46, 'TIT'],
  ['Castellanos', 'LAZ', ['Pc', 'A'], 29, 'PAN'],
  ['Kvaratskhelia', 'NAP', ['W'], 79, 'TIT'],
  ['Pulisic', 'MIL', ['W', 'T'], 68, 'TIT'],
  ['Krstovic', 'LEC', ['Pc'], 24, 'PAN'],
  ['Lucca', 'UDI', ['Pc'], 22, 'PAN'],
  ['Soule', 'ROM', ['W', 'T'], 26, 'PAN'],
  ['Adli', 'FIO', ['C', 'T'], 8, 'SCO'],
]

/** Sales already logged: player name -> [team id, price paid]. */
const SOLD: Record<string, [string, number]> = {
  // My team (t1) — mid-draft, deliberately club-stacked on JUV and
  // over-invested up front so the flags and the strategy board have signal.
  Vlahovic: ['t1', 91],
  Bremer: ['t1', 38],
  Cambiaso: ['t1', 35],
  'Di Gregorio': ['t1', 20],
  Locatelli: ['t1', 24],
  Frattesi: ['t1', 26],
  Gatti: ['t1', 12],

  // Opponents
  'Lautaro Martinez': ['t2', 112],
  Dimarco: ['t2', 51],
  Sommer: ['t2', 22],
  Leao: ['t3', 88],
  Bastoni: ['t3', 45],
  Barella: ['t3', 60],
  Lukaku: ['t4', 80],
  Buongiorno: ['t4', 30],
  Koopmeiners: ['t5', 63],
  Kvaratskhelia: ['t6', 84],
  'Di Lorenzo': ['t6', 36],
  Maignan: ['t7', 27],
  'Theo Hernandez': ['t7', 47],
  Dybala: ['t8', 58],
  Zaccagni: ['t8', 30],
}

/** Personal annotations: name -> [tag, note, max price]. */
const PERSONAL: Record<
  string,
  ['target' | 'avoid', string | undefined, number | undefined]
> = {
  Kean: ['target', 'Rigorista, calendario buono a settembre.', 55],
  McTominay: ['target', 'Bonus da centrocampo, prezzo sale ogni anno.', 48],
  Dorgu: ['target', 'Scommessa su ballottaggio vinto.', 15],
  Lukaku: ['avoid', 'Troppo dipendente da Conte, prezzo gonfiato.', undefined],
  'Loftus-Cheek': ['avoid', 'Infortuni ricorrenti.', 12],
  Svilar: ['target', undefined, 25],
}

function buildPlayers(): Player[] {
  return ROWS.map((row, i) => {
    const [name, real_team, roles, avg_price, tier] = row
    const sale = SOLD[name]
    const personal = PERSONAL[name]

    const player: Player = {
      id: `p${i + 1}`,
      name,
      real_team,
      roles,
      avg_price,
      tier: FIXTURE_TIER_ID[tier],
      status: sale ? 'sold' : 'available',
    }

    if (sale) {
      player.sold_to = sale[0]
      player.sold_price = sale[1]
    }
    if (personal) {
      player.personal_tag = personal[0]
      if (personal[1]) player.personal_note = personal[1]
      if (personal[2] !== undefined) player.personal_max_price = personal[2]
    }
    return player
  })
}

export const DEMO_PLAYERS: Player[] = buildPlayers()

/** Log ordered oldest-first; Undo pops the tail. Timestamps are fixed, not now(). */
function buildLog(players: Player[]): DraftLogEntry[] {
  const start = Date.parse('2026-08-30T20:00:00Z')
  const order = Object.keys(SOLD)
  return order.map((name, i) => {
    const p = players.find((x) => x.name === name)!
    return {
      timestamp: start + i * 3 * 60_000,
      player_id: p.id,
      team_id: p.sold_to!,
      price: p.sold_price!,
    }
  })
}

// --- Strategies (spec §4.3) -------------------------------------------------

const buckets = defaultBuckets()
const tiers = defaultTiers()

/** Builds slots for a strategy from a bucket id -> target prices mapping. */
function slotsFrom(plan: Record<string, number[]>, prefix: string) {
  return Object.entries(plan).flatMap(([bucket_id, prices]) =>
    prices.map((target_price, i) => ({
      id: `${prefix}-${bucket_id}-${i + 1}`,
      bucket_id,
      target_price,
    })),
  )
}

export const DEMO_STRATEGIES: Strategy[] = [
  {
    id: 's1',
    name: 'Attacco stellare',
    description:
      'Due big in attacco, risparmio massimo su portieri e difesa. Alto rischio, alto tetto.',
    slots: slotsFrom(
      {
        por: [20, 3, 1],
        dif: [38, 30, 13, 10, 8, 6, 4, 3],
        est: [24, 20, 11, 6, 4],
        coff: [26, 20, 12, 8, 5],
        att: [95, 80, 25, 12],
      },
      's1',
    ),
  },
  {
    id: 's2',
    name: 'Rosa bilanciata',
    description:
      'Nessun buco, nessuna stella. Copertura su tutti i reparti e panchina lunga.',
    slots: slotsFrom(
      {
        por: [22, 8, 3],
        dif: [40, 32, 20, 14, 12, 9, 7, 5],
        est: [30, 24, 18, 10, 6],
        coff: [34, 26, 18, 10, 6],
        att: [60, 46, 30, 18],
      },
      's2',
    ),
  },
]

/**
 * Manual slot -> player mapping for the active strategy.
 *
 * Includes a deliberate mismatch: Frattesi (C/T -> `coff`) is dropped into a
 * `dif` slot, which must render as a danger-colored piece. Some slots are left
 * empty so the dashed placeholder is visible too.
 */
export const DEMO_SLOT_ASSIGNMENTS: SlotAssignments = {
  s1: {
    's1-att-1': byName('Vlahovic'),
    's1-dif-1': byName('Bremer'),
    's1-dif-2': byName('Cambiaso'),
    's1-dif-4': byName('Frattesi'), // mismatch on purpose: C/T in a Difensori slot
    's1-dif-6': byName('Gatti'),
    's1-por-1': byName('Di Gregorio'),
    's1-est-2': byName('Locatelli'),
  },
}

function byName(name: string): string {
  const p = DEMO_PLAYERS.find((x) => x.name === name)
  if (!p) throw new Error(`fixture: unknown player "${name}"`)
  return p.id
}

/** Player currently up for auction on the live-draft screen. */
export const DEMO_AUCTION_PLAYER_ID = byName('Kean')

export const DEMO_SESSION: DraftSession = {
  id: 'demo',
  name: 'Lega Mantra 2026/27 — Asta',
  created_at: Date.parse('2026-08-30T19:30:00Z'),
  settings: {
    buckets,
    tiers,
    num_teams: DEMO_TEAMS.length,
    budget_per_team: BUDGET,
    flag_thresholds: {
      club_stack: 3,
      overpay_pct: 25,
      min_credits_per_slot: 1,
    },
    budget_allocation: {
      por: 6,
      dif: 22,
      est: 16,
      coff: 16,
      att: 40,
    },
  },
  teams: DEMO_TEAMS,
  players: DEMO_PLAYERS,
  strategies: DEMO_STRATEGIES,
  active_strategy_id: 's1',
  simulation_state: {},
  simulation_module_id: '4-4-2',
  simulation_formation_state: {},
  simulation_strategy_id: 's1',
  slot_assignments: DEMO_SLOT_ASSIGNMENTS,
  log: buildLog(DEMO_PLAYERS),
  prep_filters: defaultPrepFilters(),
}

/** Sanity check that the fixture squad size matches the configured quotas. */
export const DEMO_SQUAD_SIZE = totalQuota(buckets)
