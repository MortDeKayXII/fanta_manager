/**
 * Core domain types. Final shape — steps 2+ add persistence and logic around
 * these without changing them.
 *
 * Spec references: §1 (Mantra roles), §2 (data model), §4.3 (strategies),
 * §4.4 (flags).
 */

// --- Mantra roles (spec §1) -------------------------------------------------

/** The 12 official Mantra role codes. Fixed by the rules — not user-editable. */
export const MANTRA_ROLES = [
  'Por',
  'Dc',
  'B',
  'Dd',
  'Ds',
  'E',
  'M',
  'C',
  'T',
  'W',
  'A',
  'Pc',
] as const

export type MantraRole = (typeof MANTRA_ROLES)[number]

export const ROLE_LABELS: Record<MantraRole, string> = {
  Por: 'Portiere',
  Dc: 'Difensore centrale',
  B: 'Braccetto (difesa a 3)',
  Dd: 'Terzino destro',
  Ds: 'Terzino sinistro',
  E: 'Esterno basso',
  M: 'Mediano',
  C: 'Centrocampista centrale',
  T: 'Trequartista',
  W: 'Ala',
  A: 'Attaccante di supporto',
  Pc: 'Punta centrale',
}

/**
 * Whether a role leans defensive or offensive. Every valid Mantra scheme is
 * 1 GK + 5 defensive-leaning + 5 offensive-leaning (spec §1). Informational
 * only — it does not constrain buckets.
 */
export const ROLE_LEANING: Record<MantraRole, 'gk' | 'def' | 'off'> = {
  Por: 'gk',
  Dc: 'def',
  B: 'def',
  Dd: 'def',
  Ds: 'def',
  E: 'def',
  M: 'def',
  C: 'off',
  T: 'off',
  W: 'off',
  A: 'off',
  Pc: 'off',
}

// --- Role buckets (user-defined) -------------------------------------------

export const BUCKET_COLORS = [
  'amber',
  'sky',
  'violet',
  'teal',
  'rose',
  'lime',
  'slate',
] as const

export type BucketColor = (typeof BUCKET_COLORS)[number]

/**
 * A user-defined grouping of Mantra roles with a squad quota.
 *
 * Buckets are configuration, not code: the user decides how many exist, what
 * each is called, which roles it contains and its quota. Nothing in the app may
 * assume a fixed number of buckets or specific ids. Roles may appear in several
 * buckets, or in none — never assume a total partition of the 12 roles.
 */
export interface RoleBucket {
  id: string
  label: string
  roles: MantraRole[]
  /** Required number of players for this bucket. */
  quota: number
  color: BucketColor
}

// --- Tiers / "fasce" (user-defined, like role buckets) ---------------------

/**
 * A user-defined tier ("fascia" — e.g. Titolare/Panchina/Scommessa by
 * default, but freely editable): an ordered, colored label a player is
 * assigned to. Order matters — it drives the ordinal sort in Prep, so tiers
 * are stored as a list rather than a set.
 */
export interface TierDef {
  id: string
  label: string
  color: BucketColor
}

export type PersonalTag = 'target' | 'avoid'

export interface Player {
  id: string
  name: string
  /** Real-life club, uppercase short code (e.g. "JUV"). */
  real_team: string
  roles: MantraRole[]
  /** "Prezzo Medio Aste" from the source sheet. */
  avg_price: number
  /** References TierDef.id. May dangle if the tier was later deleted. */
  tier: string
  personal_tag?: PersonalTag | null
  personal_note?: string
  personal_max_price?: number
  status: 'available' | 'sold'
  sold_to?: string
  sold_price?: number
}

// --- Teams -----------------------------------------------------------------

export interface Team {
  id: string
  name: string
  budget_total: number
  /** True for the user's own team — highlighted in fit-checks and rosters. */
  isMe?: boolean
}

// --- Strategies (spec §4.3) ------------------------------------------------

export interface StrategySlot {
  id: string
  /** References RoleBucket.id. May dangle if the bucket was later deleted. */
  bucket_id: string
  target_price: number
}

export interface Strategy {
  id: string
  name: string
  description?: string
  slots: StrategySlot[]
}

/**
 * Manual mapping of strategy slots to purchased players (spec §4.2).
 *
 * Deliberately stored apart from `Player`: dragging a player onto a slot must
 * never touch `sold_to` / `sold_price`, budgets or flag computation. Keyed by
 * strategy id, then slot id -> player id.
 */
export type SlotAssignments = Record<string, Record<string, string>>

// --- Settings --------------------------------------------------------------

export interface FlagThresholds {
  /** Flag when a team would reach this many players from one club. */
  club_stack: number
  /** Flag an overpay when price exceeds avg_price by more than this %. */
  overpay_pct: number
  /** Minimum credits assumed reserved per remaining open slot. */
  min_credits_per_slot: number
}

export interface Settings {
  buckets: RoleBucket[]
  /** User-defined tiers ("fasce"), in display/sort order. */
  tiers: TierDef[]
  num_teams: number
  budget_per_team: number
  flag_thresholds: FlagThresholds
  /** Soft planned share of budget per bucket id, as a percentage (spec §4.1). */
  budget_allocation: Record<string, number>
}

// --- Draft session ---------------------------------------------------------

export interface DraftLogEntry {
  timestamp: number
  player_id: string
  team_id: string
  price: number
}

export interface DraftSession {
  id: string
  name: string
  created_at: number
  settings: Settings
  teams: Team[]
  players: Player[]
  strategies: Strategy[]
  /** Currently selected strategy on the live-draft board. */
  active_strategy_id?: string
  slot_assignments: SlotAssignments
  log: DraftLogEntry[]
}

// --- Flags (spec §4.4) -----------------------------------------------------

export type FlagSeverity = 'info' | 'warn' | 'danger'

export type FlagKind =
  | 'club_stack'
  | 'role_saturation'
  | 'overpay'
  | 'avoid_tag'
  | 'above_max_price'
  | 'budget_strain'

export interface Flag {
  kind: FlagKind
  severity: FlagSeverity
  message: string
}
