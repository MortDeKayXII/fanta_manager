import { useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  FileUp,
  Info,
  Merge,
  Pencil,
  Plus,
  Replace,
  Table2,
  Trash2,
  X,
} from 'lucide-react'
import clsx from 'clsx'

import { RoleBadges } from '@/components/badges'
import { totalQuota } from '@/lib/buckets'
import { tierLabel } from '@/lib/tiers'
import {
  buildPlayers,
  guessMapping,
  missingFields,
  parseTable,
  type ColumnMapping,
  type ImportField,
  type ParsedTable,
} from '@/lib/import'
import { useSession } from '@/store/session'
import { MANTRA_ROLES, type MantraRole, type Player, type TierDef } from '@/types'

/**
 * Setup / Import (spec §3, §6.1): CSV/TSV import with a column-mapping step and
 * preview, plus manual add/edit and team setup.
 *
 * The mapping is derived once when a file lands and then owned by the user: any
 * hand-correction must survive, so re-guessing only happens on a new paste. All
 * parsing lives in `lib/import.ts` — this screen is presentation plus the commit
 * decision (merge vs. replace).
 */

/** The documented sheet columns, shown as a hint before a file is chosen (spec §3). */
const SHEET_COLUMNS = [
  'RUOLO',
  'NOME',
  'SQUADRA',
  'PREZZO MEDIO ASTE',
  'FASCIA',
  'FANTARUOLO',
] as const

const TARGET_FIELDS: { key: ImportField; label: string }[] = [
  { key: 'name', label: 'name' },
  { key: 'roles', label: 'roles[] (split su “,”)' },
  { key: 'real_team', label: 'real_team (club)' },
  { key: 'avg_price', label: 'avg_price' },
  { key: 'tier', label: 'tier (fascia)' },
  { key: 'fanta_role', label: 'fantaruolo (solo verifica)' },
  { key: '', label: '— ignora —' },
]

const PREVIEW_ROWS = 8

export function SetupScreen() {
  const {
    session,
    updateSettings,
    setNumTeams,
    mergePlayers,
    replacePlayers,
    newPlayerId,
    addPlayer,
    editPlayer,
    deletePlayer,
  } = useSession()

  const [table, setTable] = useState<ParsedTable>()
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [dragOver, setDragOver] = useState(false)
  const [paste, setPaste] = useState('')
  const [outcome, setOutcome] = useState<string>()
  const [readError, setReadError] = useState<string>()
  const fileInput = useRef<HTMLInputElement>(null)

  const squadSize = totalQuota(session.settings.buckets)

  /**
   * The full parse of the loaded file. Recomputed on every mapping change, which
   * is what makes the preview and the issue list respond to a hand-correction.
   * Ids are stable per (index, name), so re-running is harmless.
   */
  const result = useMemo(
    () =>
      table
        ? buildPlayers(table, mapping, newPlayerId, session.settings.tiers)
        : undefined,
    // newPlayerId reads the clock, so it is intentionally not a dependency: the
    // ids only need to be unique, and re-deriving them on a mapping change is fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table, mapping, session.settings.tiers],
  )

  const missing = missingFields(mapping)
  const errors = result?.issues.filter((i) => i.severity === 'error') ?? []
  const warnings = result?.issues.filter((i) => i.severity === 'warn') ?? []
  const canCommit = !!result && result.players.length > 0 && missing.length === 0

  function load(text: string) {
    setOutcome(undefined)
    setReadError(undefined)
    const parsed = parseTable(text)
    if (parsed.headers.length === 0) {
      setReadError('Il file sembra vuoto.')
      setTable(undefined)
      return
    }
    setTable(parsed)
    // Guess only here: once loaded, the mapping belongs to the user.
    setMapping(guessMapping(parsed.headers))
  }

  async function loadFile(file: File) {
    try {
      load(await file.text())
    } catch {
      setReadError(`Impossibile leggere “${file.name}”.`)
    }
  }

  function commit(mode: 'merge' | 'replace') {
    if (!result) return
    if (mode === 'replace') {
      replacePlayers(result.players)
      setOutcome(
        `Database sostituito: ${result.players.length} giocatori. ` +
          'Le assegnazioni precedenti non valgono più.',
      )
    } else {
      const r = mergePlayers(result.players)
      setOutcome(
        `Aggiornati ${r.updated}, aggiunti ${r.added}, invariati ${r.untouched}` +
          (r.soldPreserved > 0
            ? ` · ${r.soldPreserved} già assegnati: acquisto conservato`
            : ''),
      )
    }
    setTable(undefined)
    setPaste('')
    if (fileInput.current) fileInput.current.value = ''
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* --- 1. Source file --------------------------------------------- */}
        <section>
          <h2 className="mb-2 text-sm font-semibold">
            1 · Importa il database giocatori
          </h2>

          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const file = e.dataTransfer.files[0]
              if (file) void loadFile(file)
            }}
            className={clsx(
              'flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center transition-colors',
              dragOver
                ? 'border-(--color-brand) bg-(--color-surface-2)'
                : 'border-(--color-border-strong) bg-(--color-surface)',
            )}
          >
            <FileUp size={22} className="text-(--color-fg-subtle)" />
            <p className="text-sm">
              Trascina qui il CSV/TSV, oppure{' '}
              <button
                onClick={() => fileInput.current?.click()}
                className="text-(--color-brand) underline underline-offset-2"
              >
                scegli un file
              </button>
            </p>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void loadFile(file)
              }}
              className="hidden"
            />
            <p className="text-xs text-(--color-fg-subtle)">
              Colonne attese: {SHEET_COLUMNS.join(' · ')}
            </p>
          </div>

          <details className="mt-2" open={!table && paste.length > 0}>
            <summary className="cursor-pointer text-xs text-(--color-fg-muted)">
              …oppure incolla direttamente i dati
            </summary>
            <textarea
              rows={4}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={'RUOLO\tNOME\tSQUADRA\tPREZZO MEDIO ASTE\tFASCIA\nPc\tKean\tFIO\t46\tTIT'}
              className="mt-2 w-full rounded-md border border-(--color-border) bg-(--color-surface-2) p-2 font-mono text-xs placeholder:text-(--color-fg-subtle)"
            />
            <button
              onClick={() => load(paste)}
              disabled={paste.trim().length === 0}
              className="mt-1 h-8 rounded-md border border-(--color-border) px-2.5 text-xs text-(--color-fg-muted) hover:bg-(--color-surface-2) disabled:opacity-50"
            >
              Analizza il testo incollato
            </button>
          </details>

          {readError && <Notice severity="warn">{readError}</Notice>}
          {outcome && <Notice severity="info">{outcome}</Notice>}
        </section>

        {table ? (
          <>
            {/* --- 2. Column mapping --------------------------------------- */}
            <section>
              <div className="mb-2 flex flex-wrap items-baseline gap-2">
                <h2 className="text-sm font-semibold">2 · Associa le colonne</h2>
                <span className="text-xs text-(--color-fg-subtle)">
                  {table.rows.length} righe · separatore{' '}
                  <code className="font-mono">
                    {table.delimiter === '\t' ? 'TAB' : table.delimiter}
                  </code>
                </span>
                <button
                  onClick={() => setMapping(guessMapping(table.headers))}
                  className="ml-auto h-8 rounded-md border border-(--color-border) px-2.5 text-xs text-(--color-fg-muted) hover:bg-(--color-surface-2)"
                >
                  Rileva di nuovo
                </button>
              </div>

              <div className="grid gap-3 rounded-lg border border-(--color-border) bg-(--color-surface) p-4 sm:grid-cols-2 lg:grid-cols-3">
                {table.headers.map((col, i) => (
                  <label key={`${col}-${i}`} className="flex flex-col gap-1">
                    <span
                      title={col}
                      className="truncate font-mono text-[11px] text-(--color-fg-subtle)"
                    >
                      {col || `(colonna ${i + 1})`}
                    </span>
                    <select
                      value={mapping[col] ?? ''}
                      onChange={(e) =>
                        setMapping((m) => ({
                          ...m,
                          [col]: e.target.value as ImportField,
                        }))
                      }
                      className="h-8 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-xs"
                    >
                      {TARGET_FIELDS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <span className="truncate text-[11px] text-(--color-fg-subtle)">
                      es. {table.rows[0]?.[i] || '—'}
                    </span>
                  </label>
                ))}
              </div>

              {missing.length > 0 && (
                <Notice severity="warn">
                  Manca l’associazione per:{' '}
                  <strong>{missing.join(', ')}</strong>. Sono gli unici campi
                  obbligatori.
                </Notice>
              )}
              <p
                className="mt-2 flex items-start gap-2 rounded px-2.5 py-2 text-xs"
                style={{ color: 'var(--color-info)', background: 'var(--color-info-bg)' }}
              >
                <Info size={13} strokeWidth={2.5} className="mt-px shrink-0" />
                <span>
                  L’import è tollerante: spazi rimossi, codici club in maiuscolo,
                  <code className="mx-1 font-mono">FANTARUOLO</code>
                  opzionale (è derivato da ruolo + fascia). Prezzo mancante diventa
                  0, fascia mancante diventa la prima configurata in Impostazioni.
                </span>
              </p>
            </section>

            {/* --- 3. Preview + issues ------------------------------------ */}
            <section>
              <div className="mb-2 flex flex-wrap items-baseline gap-2">
                <h2 className="text-sm font-semibold">3 · Anteprima</h2>
                <span className="text-xs text-(--color-fg-subtle)">
                  {result?.players.length ?? 0} giocatori pronti
                  {result && result.skipped > 0 &&
                    (result.skipped === 1
                      ? ' · 1 riga scartata'
                      : ` · ${result.skipped} righe scartate`)}
                  {result && result.repaired > 0 &&
                    (result.repaired === 1
                      ? ' · 1 corretta'
                      : ` · ${result.repaired} corrette`)}
                </span>
              </div>

              <div className="overflow-auto rounded-lg border border-(--color-border) bg-(--color-surface)">
                <table className="w-full text-sm">
                  <thead className="bg-(--color-surface-2) text-left text-[11px] tracking-wide text-(--color-fg-subtle) uppercase">
                    <tr>
                      <th className="px-3 py-2 font-medium">name</th>
                      <th className="px-3 py-2 font-medium">real_team</th>
                      <th className="px-3 py-2 font-medium">roles[]</th>
                      <th className="px-3 py-2 font-medium">tier</th>
                      <th className="px-3 py-2 text-right font-medium">avg_price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result?.players.slice(0, PREVIEW_ROWS).map((p) => (
                      <tr key={p.id} className="border-t border-(--color-border)">
                        <td className="px-3 py-1.5">{p.name}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">
                          {p.real_team || '—'}
                        </td>
                        <td className="px-3 py-1.5">
                          <RoleBadges
                            roles={p.roles}
                            buckets={session.settings.buckets}
                          />
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs">
                          {tierLabel(session.settings.tiers, p.tier)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {p.avg_price}
                        </td>
                      </tr>
                    ))}
                    {result?.players.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-4 text-center text-xs text-(--color-fg-subtle)"
                        >
                          Nessuna riga importabile con questa associazione.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {result && result.players.length > PREVIEW_ROWS && (
                <p className="mt-1 text-[11px] text-(--color-fg-subtle)">
                  Mostrate le prime {PREVIEW_ROWS} di {result.players.length}.
                </p>
              )}

              {/* Per-row problems: the file is never rejected wholesale. */}
              {(errors.length > 0 || warnings.length > 0) && (
                <IssueList errors={errors} warnings={warnings} />
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => commit('merge')}
                  disabled={!canCommit}
                  className="flex h-9 items-center gap-2 rounded-md bg-(--color-brand) px-3 text-sm font-semibold text-(--color-brand-fg) hover:bg-(--color-brand-strong) disabled:opacity-50"
                >
                  <Merge size={14} />
                  Aggiorna il database ({result?.players.length ?? 0})
                </button>
                <button
                  onClick={() => {
                    if (
                      session.log.length === 0 ||
                      window.confirm(
                        `Ci sono ${session.log.length} giocatori già assegnati. ` +
                          'Sostituire il database li cancella. Procedere?',
                      )
                    )
                      commit('replace')
                  }}
                  disabled={!canCommit}
                  className="flex h-9 items-center gap-2 rounded-md border border-(--color-border) px-3 text-sm text-(--color-fg-muted) hover:bg-(--color-surface-2) disabled:opacity-50"
                >
                  <Replace size={14} />
                  Sostituisci tutto
                </button>
                <button
                  onClick={() => {
                    setTable(undefined)
                    setOutcome(undefined)
                  }}
                  className="flex h-9 items-center gap-2 rounded-md border border-(--color-border) px-3 text-sm text-(--color-fg-subtle) hover:bg-(--color-surface-2)"
                >
                  <X size={14} />
                  Annulla
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-(--color-fg-subtle)">
                <strong className="text-(--color-fg-muted)">Aggiorna</strong>{' '}
                riconosce i giocatori per nome + squadra: prezzi e fasce si
                aggiornano, acquisti e note restano.{' '}
                <strong className="text-(--color-fg-muted)">Sostituisci</strong>{' '}
                azzera tutto.
              </p>
            </section>
          </>
        ) : (
          <PlayerDatabase
            players={session.players}
            onAdd={addPlayer}
            onEdit={editPlayer}
            onDelete={deletePlayer}
            buckets={session.settings.buckets}
            tiers={session.settings.tiers}
          />
        )}

        {/* --- 4. League setup -------------------------------------------- */}
        <section>
          <h2 className="mb-2 text-sm font-semibold">4 · Lega e rosa</h2>
          <div className="grid gap-4 rounded-lg border border-(--color-border) bg-(--color-surface) p-4 sm:grid-cols-2">
            <div className="space-y-3">
              <label className="flex items-center justify-between gap-2 text-sm">
                <span>Numero di squadre</span>
                <input
                  type="number"
                  min={1}
                  value={session.teams.length}
                  onChange={(e) => setNumTeams(Number(e.target.value) || 1)}
                  className="h-8 w-20 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-sm tabular-nums"
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-sm">
                <span>Budget per squadra</span>
                <input
                  type="number"
                  min={0}
                  value={session.settings.budget_per_team}
                  onChange={(e) =>
                    updateSettings({ budget_per_team: Number(e.target.value) || 0 })
                  }
                  className="h-8 w-20 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-sm tabular-nums"
                />
              </label>
              <p className="flex items-start gap-2 text-xs text-(--color-fg-subtle)">
                <Table2 size={13} className="mt-px shrink-0" />
                Rosa da <strong className="text-(--color-fg)">
                  {squadSize}
                </strong>{' '}
                giocatori secondo i reparti configurati. Reparti e{' '}
                <strong className="text-(--color-fg)">fasce</strong> si modificano
                in Impostazioni.
              </p>
            </div>

            <div>
              <h3 className="mb-1.5 text-xs font-medium text-(--color-fg-muted)">
                Squadre ({session.teams.length})
              </h3>
              <ul className="space-y-1 text-sm">
                {session.teams.map((t) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{t.name}</span>
                    {t.isMe && (
                      <span className="text-[11px] text-(--color-brand)">io</span>
                    )}
                    <span className="tabular-nums text-(--color-fg-subtle)">
                      {t.budget_total}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

/** Grouped issue list: errors first, and never more than a screenful. */
function IssueList({
  errors,
  warnings,
}: {
  errors: { row: number; message: string }[]
  warnings: { row: number; message: string }[]
}) {
  const CAP = 12
  const shown = [
    ...errors.map((i) => ({ ...i, severity: 'warn' as const, kind: 'error' as const })),
    ...warnings.map((i) => ({ ...i, severity: 'info' as const, kind: 'warn' as const })),
  ].slice(0, CAP)
  const hidden = errors.length + warnings.length - shown.length

  return (
    <div className="mt-2 rounded-lg border border-(--color-border) bg-(--color-surface) p-3">
      <p className="mb-1.5 text-xs font-medium">
        {errors.length > 0 && (
          <span style={{ color: 'var(--color-warn)' }}>
            {errors.length === 1 ? '1 riga scartata' : `${errors.length} righe scartate`}
          </span>
        )}
        {errors.length > 0 && warnings.length > 0 && ' · '}
        {warnings.length > 0 && (
          <span className="text-(--color-fg-muted)">
            {warnings.length === 1
              ? '1 correzione automatica'
              : `${warnings.length} correzioni automatiche`}
          </span>
        )}
      </p>
      <ul className="space-y-0.5 text-[11px]">
        {shown.map((i, n) => (
          <li key={n} className="flex items-start gap-1.5">
            <AlertTriangle
              size={11}
              strokeWidth={2.5}
              className="mt-0.5 shrink-0"
              style={{
                color:
                  i.kind === 'error' ? 'var(--color-warn)' : 'var(--color-fg-subtle)',
              }}
            />
            <span className="text-(--color-fg-muted)">
              <span className="font-mono tabular-nums">
                {i.row === 0 ? 'file' : `riga ${i.row}`}
              </span>{' '}
              — {i.message}
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="mt-1 text-[11px] text-(--color-fg-subtle)">
          …e altre {hidden}.
        </p>
      )}
    </div>
  )
}

/**
 * The current database, with manual add / edit / delete (spec §3).
 *
 * Shown in place of the mapping steps when no file is loaded, so the screen has
 * one job at a time.
 */
function PlayerDatabase({
  players,
  buckets,
  tiers,
  onAdd,
  onEdit,
  onDelete,
}: {
  players: Player[]
  buckets: Parameters<typeof RoleBadges>[0]['buckets']
  tiers: TierDef[]
  onAdd: (args: {
    name: string
    realTeam: string
    roles: MantraRole[]
    avgPrice: number
    tier: string
  }) => void
  onEdit: (
    id: string,
    patch: Partial<Pick<Player, 'name' | 'real_team' | 'roles' | 'avg_price' | 'tier'>>,
  ) => void
  onDelete: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<string>()
  const [adding, setAdding] = useState(false)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q
      ? players.filter(
          (p) =>
            p.name.toLowerCase().includes(q) || p.real_team.toLowerCase().includes(q),
        )
      : players
    return base.slice(0, 50)
  }, [players, query])

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-semibold">
          2 · Database attuale
          <span className="ml-1.5 font-normal text-(--color-fg-subtle)">
            {players.length} giocatori
          </span>
        </h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca nome o squadra"
          className="ml-auto h-8 w-52 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-xs"
        />
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex h-8 items-center gap-1.5 rounded-md border border-(--color-border) px-2.5 text-xs text-(--color-fg-muted) hover:bg-(--color-surface-2)"
        >
          <Plus size={13} />
          Aggiungi giocatore
        </button>
      </div>

      {adding && (
        <PlayerForm
          tiers={tiers}
          onCancel={() => setAdding(false)}
          onSave={(v) => {
            onAdd({
              name: v.name,
              realTeam: v.real_team,
              roles: v.roles,
              avgPrice: v.avg_price,
              tier: v.tier,
            })
            setAdding(false)
          }}
        />
      )}

      <div className="divide-y divide-(--color-border) overflow-hidden rounded-lg border border-(--color-border) bg-(--color-surface)">
        {shown.map((p) =>
          editing === p.id ? (
            <PlayerForm
              key={p.id}
              initial={p}
              tiers={tiers}
              onCancel={() => setEditing(undefined)}
              onSave={(v) => {
                onEdit(p.id, {
                  name: v.name,
                  real_team: v.real_team,
                  roles: v.roles,
                  avg_price: v.avg_price,
                  tier: v.tier,
                })
                setEditing(undefined)
              }}
            />
          ) : (
            <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="w-12 shrink-0 font-mono text-xs text-(--color-fg-muted)">
                {p.real_team}
              </span>
              <div className="shrink-0">
                <RoleBadges roles={p.roles} buckets={buckets} />
              </div>
              <span className="w-9 shrink-0 text-right font-mono text-[11px] text-(--color-fg-subtle)">
                {tierLabel(tiers, p.tier)}
              </span>
              <span className="w-10 shrink-0 text-right tabular-nums">
                {p.avg_price}
              </span>
              {p.status === 'sold' ? (
                <span
                  title="Già assegnato: annulla la vendita per eliminarlo"
                  className="w-14 shrink-0 text-right text-[11px] text-(--color-fg-subtle)"
                >
                  assegnato
                </span>
              ) : (
                <span className="w-14 shrink-0" />
              )}
              <button
                onClick={() => setEditing(p.id)}
                title="Modifica"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-(--color-border) text-(--color-fg-subtle) hover:bg-(--color-surface-2)"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={() => onDelete(p.id)}
                disabled={p.status === 'sold'}
                title={
                  p.status === 'sold'
                    ? 'Non eliminabile: annulla prima la vendita'
                    : 'Elimina'
                }
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-(--color-border) text-(--color-fg-subtle) hover:bg-(--color-surface-2) hover:text-(--color-danger) disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-(--color-fg-subtle)"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ),
        )}
        {shown.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-(--color-fg-subtle)">
            {players.length === 0
              ? 'Nessun giocatore: importa un CSV/TSV qui sopra.'
              : 'Nessun risultato.'}
          </p>
        )}
      </div>
      {players.length > shown.length && (
        <p className="mt-1 text-[11px] text-(--color-fg-subtle)">
          Mostrati {shown.length} di {players.length} — restringi con la ricerca.
        </p>
      )}
    </section>
  )
}

/** Add/edit form. Roles are toggles, so an invalid role cannot be typed. */
function PlayerForm({
  initial,
  tiers,
  onSave,
  onCancel,
}: {
  initial?: Player
  tiers: TierDef[]
  onSave: (v: {
    name: string
    real_team: string
    roles: MantraRole[]
    avg_price: number
    tier: string
  }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [club, setClub] = useState(initial?.real_team ?? '')
  const [roles, setRoles] = useState<MantraRole[]>(initial?.roles ?? [])
  const [price, setPrice] = useState(String(initial?.avg_price ?? ''))
  const [tier, setTier] = useState<string>(initial?.tier ?? tiers[0]?.id ?? '')

  const valid = name.trim().length > 0 && roles.length > 0

  return (
    <div className="mb-2 rounded-lg border border-(--color-brand) bg-(--color-surface) p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome"
          className="h-8 min-w-40 flex-1 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-sm"
        />
        <input
          value={club}
          onChange={(e) => setClub(e.target.value)}
          placeholder="Club"
          className="h-8 w-20 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-sm uppercase"
        />
        <input
          type="number"
          min={0}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="prezzo"
          className="h-8 w-20 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-sm tabular-nums"
        />
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          className="h-8 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-xs"
        >
          {tiers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {MANTRA_ROLES.map((role) => {
          const on = roles.includes(role)
          return (
            <button
              key={role}
              onClick={() =>
                setRoles((r) =>
                  r.includes(role) ? r.filter((x) => x !== role) : [...r, role],
                )
              }
              className={clsx(
                'rounded border px-1.5 py-0.5 text-[11px] font-medium',
                on
                  ? 'border-(--color-brand) bg-(--color-surface-3) text-(--color-brand)'
                  : 'border-(--color-border) text-(--color-fg-subtle) hover:bg-(--color-surface-2)',
              )}
            >
              {role}
            </button>
          )
        })}

        <div className="ml-auto flex gap-1.5">
          <button
            onClick={onCancel}
            className="h-8 rounded-md border border-(--color-border) px-2.5 text-xs text-(--color-fg-subtle) hover:bg-(--color-surface-2)"
          >
            Annulla
          </button>
          <button
            onClick={() =>
              onSave({
                name: name.trim(),
                real_team: club.trim().toUpperCase(),
                roles,
                avg_price: Number(price) || 0,
                tier,
              })
            }
            disabled={!valid}
            className="flex h-8 items-center gap-1.5 rounded-md bg-(--color-brand) px-2.5 text-xs font-semibold text-(--color-brand-fg) hover:bg-(--color-brand-strong) disabled:opacity-50"
          >
            <Check size={13} />
            Salva
          </button>
        </div>
      </div>
    </div>
  )
}

function Notice({
  severity,
  children,
}: {
  severity: 'info' | 'warn'
  children: React.ReactNode
}) {
  const Icon = severity === 'warn' ? AlertTriangle : Info
  return (
    <p
      className="mt-2 flex items-start gap-2 rounded px-2.5 py-2 text-xs leading-snug"
      style={{
        color: `var(--color-${severity})`,
        background: `var(--color-${severity}-bg)`,
      }}
    >
      <Icon size={13} strokeWidth={2.5} className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  )
}
