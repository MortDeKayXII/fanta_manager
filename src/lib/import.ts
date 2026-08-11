/**
 * CSV/TSV player import (spec §3, plan step 3).
 *
 * Pure functions over text and rows: PapaParse is used only to tokenize, and
 * everything that decides what a row *means* lives here so it can be unit-tested
 * without a browser or a file.
 *
 * The importer is deliberately forgiving, because the source is a hand-maintained
 * Google Sheet that will be tweaked between drafts:
 *  - the delimiter is sniffed (tab, comma or semicolon),
 *  - headers are matched case- and accent-insensitively, with aliases,
 *  - `FANTARUOLO` is optional (it is derived from role + tier),
 *  - prices accept `1.234,50` and `€ 46`,
 *  - a bad row is reported and skipped, never allowed to abort the import.
 */

import Papa from 'papaparse'

import { tierLabel } from '@/lib/tiers'
import { MANTRA_ROLES, type MantraRole, type Player, type TierDef } from '@/types'

/** The fields a sheet column can be mapped onto. `''` means "ignore". */
export type ImportField =
  | 'roles'
  | 'name'
  | 'real_team'
  | 'avg_price'
  | 'tier'
  | 'fanta_role'
  | ''

/** Column -> field. Keys are the header strings exactly as they appear in the file. */
export type ColumnMapping = Record<string, ImportField>

/** Only these two are truly required: a nameless or roleless player is unusable. */
export const REQUIRED_FIELDS: ImportField[] = ['name', 'roles']

export interface ParsedTable {
  headers: string[]
  rows: string[][]
  /** Delimiter actually used, for display ('\t' shown as TAB). */
  delimiter: string
  /** Papa-level problems (ragged rows and the like). Non-fatal. */
  warnings: string[]
}

export interface RowIssue {
  /**
   * 1-based row number as the user sees it in a spreadsheet (header is row 1).
   * `0` marks an issue about the file as a whole — a missing column rather than a
   * bad cell — so the UI can show it above the per-row list.
   */
  row: number
  field: ImportField | 'row'
  message: string
  severity: 'error' | 'warn'
}

export interface ImportResult {
  players: Player[]
  issues: RowIssue[]
  /** Rows dropped because of an error. */
  skipped: number
  /** Rows that produced a player but with something worth mentioning. */
  repaired: number
}

// --- Tokenizing -------------------------------------------------------------

/**
 * Sniff the delimiter rather than trusting the extension: the sheet is usually
 * pasted (tab-separated) but downloaded as CSV, and Italian locales export with
 * semicolons.
 */
function sniffDelimiter(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? ''
  const counts: [string, number][] = [
    ['\t', (line.match(/\t/g) ?? []).length],
    [';', (line.match(/;/g) ?? []).length],
    [',', (line.match(/,/g) ?? []).length],
  ]
  const [best, n] = counts.reduce((a, b) => (b[1] > a[1] ? b : a))
  // A comma-only line may just be a multi-role cell ("Dc,B"), so require > 1.
  return n > 0 ? best : ','
}

/** Tokenize the pasted text or file contents into a header row plus data rows. */
export function parseTable(text: string): ParsedTable {
  const delimiter = sniffDelimiter(text)
  const out = Papa.parse<string[]>(text.trim(), {
    delimiter,
    skipEmptyLines: 'greedy',
  })

  const all = (out.data ?? []).map((r) => r.map((c) => (c ?? '').trim()))
  const [headers = [], ...rows] = all

  return {
    headers,
    rows,
    delimiter,
    warnings: (out.errors ?? []).map((e) => `riga ${(e.row ?? 0) + 1}: ${e.message}`),
  }
}

// --- Header matching --------------------------------------------------------

/** Lowercase, strip accents and non-letters, so "Prezzo  Medio-Aste" matches. */
function normalizeHeader(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Header aliases per target field. The first exact normalized hit wins; failing
 * that a substring match is tried, which is what catches "PREZZO MEDIO ASTE 24/25".
 */
const HEADER_ALIASES: Record<Exclude<ImportField, ''>, string[]> = {
  roles: ['ruolo', 'ruoli', 'roles', 'r'],
  name: ['nome', 'giocatore', 'name', 'player', 'calciatore'],
  real_team: ['squadra', 'club', 'team', 'realteam', 'sq'],
  avg_price: [
    'prezzomedioaste',
    'prezzomedio',
    'prezzoasta',
    'quotazione',
    'qta',
    'qa',
    'avgprice',
    'prezzo',
    'media',
  ],
  tier: ['fascia', 'tier', 'f'],
  fanta_role: ['fantaruolo', 'fantarole'],
}

/**
 * Guess a mapping from the file's headers.
 *
 * A field is claimed by at most one column: with both "PREZZO MEDIO ASTE" and
 * "PREZZO" present, the more specific alias must not be overwritten by the
 * looser one, so exact matches are resolved before substring matches.
 */
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  const claimed = new Set<ImportField>()
  const norm = headers.map(normalizeHeader)

  const claim = (i: number, field: Exclude<ImportField, ''>) => {
    mapping[headers[i]] = field
    claimed.add(field)
  }

  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [
    Exclude<ImportField, ''>,
    string[],
  ][]) {
    const i = norm.findIndex((h, idx) => aliases.includes(h) && !mapping[headers[idx]])
    if (i >= 0) claim(i, field)
  }

  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [
    Exclude<ImportField, ''>,
    string[],
  ][]) {
    if (claimed.has(field)) continue
    const i = norm.findIndex(
      (h, idx) =>
        !mapping[headers[idx]] && aliases.some((a) => h.includes(a) || a.includes(h)),
    )
    if (i >= 0) claim(i, field)
  }

  for (const h of headers) mapping[h] ??= ''
  return mapping
}

/** Which required fields the mapping still leaves unassigned. */
export function missingFields(mapping: ColumnMapping): ImportField[] {
  const assigned = new Set(Object.values(mapping))
  return REQUIRED_FIELDS.filter((f) => !assigned.has(f))
}

// --- Cell coercion ----------------------------------------------------------

/** Role lookup that tolerates any casing: the sheet writes "PC", we store "Pc". */
const ROLE_BY_KEY = new Map(MANTRA_ROLES.map((r) => [r.toLowerCase(), r]))

/**
 * Split a role cell into Mantra roles. Accepts `,` `/` `;` `|` and whitespace as
 * separators, since the sheet has been inconsistent about it.
 */
export function parseRoles(cell: string): { roles: MantraRole[]; unknown: string[] } {
  const roles: MantraRole[] = []
  const unknown: string[] = []

  for (const raw of cell.split(/[,/;|]+|\s+/)) {
    const token = raw.trim()
    if (!token) continue
    const role = ROLE_BY_KEY.get(token.toLowerCase())
    if (!role) unknown.push(token)
    else if (!roles.includes(role)) roles.push(role)
  }
  return { roles, unknown }
}

/**
 * Parse a price, handling both decimal conventions.
 *
 * Ambiguity is real: `1.234` is a thousands separator in Italian but a decimal
 * point elsewhere. A dot with exactly three digits after it and no comma present
 * is read as thousands, which is the only reading that makes sense for auction
 * prices (nobody bids 1.234 credits).
 */
export function parsePrice(cell: string): number | undefined {
  const cleaned = cell.replace(/[^\d.,-]/g, '').trim()
  if (!cleaned) return undefined

  let normalized: string
  if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, '')
  } else {
    normalized = cleaned
  }

  const n = Number(normalized)
  return Number.isFinite(n) ? n : undefined
}

/** Lowercase, strip accents, for tolerant tier matching (mirrors normalizeHeader). */
const TIER_DIACRITICS = new RegExp(
  '[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']',
  'g',
)
function normalizeTierKey(s: string): string {
  return s.normalize('NFD').replace(TIER_DIACRITICS, '').toLowerCase().trim()
}

/**
 * Match a FASCIA cell against the user's configured tiers (Settings), not a
 * hardcoded TIT/PAN/SCO set — tiers are free-form (like role buckets), so the
 * importer has to resolve against whatever the user actually defined.
 *
 * Tried in order: exact id, exact label, then — only when it resolves to
 * exactly one tier, to avoid guessing wrong — the label's leading letter
 * (keeps single-letter sheets like "T"/"P"/"S" working against the default
 * preset without hardcoding those three specifically).
 */
export function parseTier(cell: string, tiers: TierDef[]): string | undefined {
  const key = normalizeTierKey(cell)
  if (!key) return undefined

  const byId = tiers.find((t) => normalizeTierKey(t.id) === key)
  if (byId) return byId.id

  const byLabel = tiers.find((t) => normalizeTierKey(t.label) === key)
  if (byLabel) return byLabel.id

  if (key.length === 1) {
    const byInitial = tiers.filter((t) => normalizeTierKey(t.label).startsWith(key))
    if (byInitial.length === 1) return byInitial[0].id
  }

  return undefined
}

/** Club codes are stored uppercase, spaces collapsed (spec §3). */
export function normalizeClub(cell: string): string {
  return cell.trim().replace(/\s+/g, ' ').toUpperCase()
}

// --- Row -> Player ----------------------------------------------------------

/**
 * Turn tokenized rows into players.
 *
 * `makeId` is injected so the caller owns id generation and this stays pure and
 * testable. Row numbers in issues are spreadsheet-style (header is row 1).
 */
export function buildPlayers(
  table: ParsedTable,
  mapping: ColumnMapping,
  makeId: (index: number, name: string) => string,
  tiers: TierDef[],
): ImportResult {
  const issues: RowIssue[] = []
  const players: Player[] = []
  let skipped = 0
  let repaired = 0

  const missing = missingFields(mapping)
  if (missing.length > 0) {
    return {
      players: [],
      issues: missing.map((field) => ({
        row: 0,
        field,
        severity: 'error',
        message: `Nessuna colonna associata a “${field}”.`,
      })),
      skipped: table.rows.length,
      repaired: 0,
    }
  }

  /** field -> column index, from the mapping. */
  const index: Partial<Record<Exclude<ImportField, ''>, number>> = {}
  table.headers.forEach((h, i) => {
    const field = mapping[h]
    if (field) index[field] ??= i
  })

  const has = (field: Exclude<ImportField, ''>) => index[field] !== undefined
  const cell = (row: string[], field: Exclude<ImportField, ''>) => {
    const i = index[field]
    return i === undefined ? '' : (row[i] ?? '').trim()
  }

  /**
   * An absent optional column is one fact about the file, not one fact per row:
   * warning per row would bury the real per-row problems under hundreds of
   * identical lines. Reported once, against the header.
   */
  if (!has('avg_price'))
    issues.push({
      row: 0,
      field: 'avg_price',
      severity: 'warn',
      message: 'Nessuna colonna prezzo: tutti i prezzi medi valgono 0.',
    })
  // Falls back to the first configured tier when a cell can't be read at all —
  // there is no hardcoded "PAN" anymore, since fasce are user-defined.
  const defaultTierId = tiers[0]?.id ?? ''
  const defaultTierLabel = tiers[0]?.label ?? defaultTierId
  if (!has('tier') && !has('fanta_role'))
    issues.push({
      row: 0,
      field: 'tier',
      severity: 'warn',
      message: `Nessuna colonna fascia: tutti i giocatori risultano ${defaultTierLabel}.`,
    })
  if (!has('real_team'))
    issues.push({
      row: 0,
      field: 'real_team',
      severity: 'warn',
      message: 'Nessuna colonna squadra: il controllo di accumulo per club non scatterà.',
    })

  /** Names already taken, so a duplicated sheet row is reported once. */
  const seen = new Map<string, number>()

  table.rows.forEach((row, i) => {
    const rowNo = i + 2
    let dirty = false

    const name = cell(row, 'name')
    if (!name) {
      // A trailing blank line is not worth a complaint; a row with other data is.
      if (row.some((c) => c)) {
        issues.push({ row: rowNo, field: 'name', severity: 'error', message: 'Nome mancante.' })
        skipped++
      }
      return
    }

    const { roles, unknown } = parseRoles(cell(row, 'roles'))
    if (unknown.length > 0) {
      issues.push({
        row: rowNo,
        field: 'roles',
        severity: roles.length > 0 ? 'warn' : 'error',
        message: `Ruolo non riconosciuto: ${unknown.join(', ')}.`,
      })
      dirty = true
    }
    if (roles.length === 0) {
      if (unknown.length === 0)
        issues.push({
          row: rowNo,
          field: 'roles',
          severity: 'error',
          message: 'Ruolo mancante.',
        })
      skipped++
      return
    }

    const priceCell = cell(row, 'avg_price')
    let avg_price = parsePrice(priceCell)
    if (avg_price === undefined) {
      // Not fatal: a missing price only weakens the overpay flag.
      if (has('avg_price')) {
        issues.push({
          row: rowNo,
          field: 'avg_price',
          severity: 'warn',
          message: priceCell
            ? `Prezzo non numerico (“${priceCell}”), impostato a 0.`
            : 'Prezzo mancante, impostato a 0.',
        })
        dirty = true
      }
      avg_price = 0
    } else if (avg_price < 0) {
      issues.push({
        row: rowNo,
        field: 'avg_price',
        severity: 'warn',
        message: `Prezzo negativo (${avg_price}), impostato a 0.`,
      })
      avg_price = 0
      dirty = true
    }

    const tierCell = cell(row, 'tier')
    let tier = parseTier(tierCell, tiers)
    if (!tier) {
      // FANTARUOLO is role+tier concatenated, so it can rescue a missing FASCIA.
      tier = tierFromFantaRole(cell(row, 'fanta_role'), tiers)
      if (tier) {
        issues.push({
          row: rowNo,
          field: 'tier',
          severity: 'warn',
          message: `Fascia dedotta da FANTARUOLO: ${tierLabel(tiers, tier)}.`,
        })
        dirty = true
      } else {
        if (has('tier') || has('fanta_role')) {
          issues.push({
            row: rowNo,
            field: 'tier',
            severity: 'warn',
            message: tierCell
              ? `Fascia non riconosciuta (“${tierCell}”), impostata a ${defaultTierLabel}.`
              : `Fascia mancante, impostata a ${defaultTierLabel}.`,
          })
          dirty = true
        }
        tier = defaultTierId
      }
    }

    const real_team = normalizeClub(cell(row, 'real_team'))
    if (!real_team && has('real_team')) {
      issues.push({
        row: rowNo,
        field: 'real_team',
        severity: 'warn',
        message: 'Squadra mancante: il controllo di accumulo per club non scatterà.',
      })
      dirty = true
    }

    const key = `${name.toLowerCase()}|${real_team}`
    const firstSeen = seen.get(key)
    if (firstSeen !== undefined) {
      issues.push({
        row: rowNo,
        field: 'name',
        severity: 'warn',
        message: `Duplicato di “${name}” (riga ${firstSeen}): la riga successiva vince.`,
      })
      dirty = true
      // Later row wins, mirroring how a spreadsheet edit is meant to override.
      const at = players.findIndex(
        (p) => p.name.toLowerCase() === name.toLowerCase() && p.real_team === real_team,
      )
      if (at >= 0) players.splice(at, 1)
    }
    seen.set(key, rowNo)

    players.push({
      id: makeId(i, name),
      name,
      real_team,
      roles,
      avg_price,
      tier,
      status: 'available',
    })
    if (dirty) repaired++
  })

  return { players, issues, skipped, repaired }
}

/**
 * Read the tier out of a FANTARUOLO cell like "PcTIT" or "Dc-PAN".
 *
 * The spec calls FANTARUOLO derived and ignorable, but when FASCIA is absent it
 * is the only place the tier survives, so it is worth mining as a fallback.
 * Only matches tier ids that look like a short uppercase code (2-4 letters,
 * the shape of the default TIT/PAN/SCO preset) concatenated onto the role —
 * a longer or lowercase custom tier id can't be told apart from the role
 * code reliably, so it is left for FASCIA or a manual fix in Prep instead.
 */
function tierFromFantaRole(cell: string, tiers: TierDef[]): string | undefined {
  const upper = cell.toUpperCase().trim()
  const shortCodeTiers = tiers.filter((t) => /^[A-Za-z]{2,4}$/.test(t.id))
  return shortCodeTiers.find((t) => upper.endsWith(t.id.toUpperCase()))?.id
}

/** One-shot convenience: text in, players out. */
export function importFromText(
  text: string,
  makeId: (index: number, name: string) => string,
  tiers: TierDef[],
  mapping?: ColumnMapping,
): ImportResult & { table: ParsedTable; mapping: ColumnMapping } {
  const table = parseTable(text)
  const resolved = mapping ?? guessMapping(table.headers)
  return { ...buildPlayers(table, resolved, makeId, tiers), table, mapping: resolved }
}
