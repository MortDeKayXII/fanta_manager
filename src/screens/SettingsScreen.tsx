import { useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Download,
  Info,
  Plus,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react'
import clsx from 'clsx'

const DEFAULT_LIVE_GIST_URL = 'https://gist.github.com/MortDeKayXII/8d79c0cfddd97fd01a2449d131883d62'
// All GitHub Gist API calls go through this Cloudflare Worker, which holds the
// Personal Access Token server-side. No token ever ships in this bundle.
const GIST_PROXY_URL = 'https://gist-proxy.fantamanager.workers.dev'

import { bucketAccent } from '@/lib/colors'
import {
  defaultBuckets,
  overlappingRoles,
  rolesWithoutBucket,
  totalQuota,
} from '@/lib/buckets'
import { parseSessionFile, serializeSession, sessionFileName } from '@/lib/sessionFile'
import { defaultTiers } from '@/lib/tiers'
import { useSession } from '@/store/session'
import {
  BUCKET_COLORS,
  MANTRA_ROLES,
  ROLE_LABELS,
  type BucketColor,
} from '@/types'

/**
 * Settings (spec §6.6): role buckets, flag thresholds, teams, export/import.
 *
 * The bucket editor is the heart of this screen: buckets are user-defined, and
 * everything else in the app (quotas, strategy sections, dashboard groupings, the
 * role-saturation flag) iterates whatever is configured here.
 */
export function SettingsScreen() {
  const {
    session,
    setBuckets,
    patchBucket,
    toggleBucketRole,
    removeBucket,
    addBucket,
    setTiers,
    patchTier,
    removeTier,
    addTier,
    moveTier,
    updateSettings,
    updateTeam,
    setNumTeams,
    importSession,
    saveState,
  } = useSession()
  const { buckets, tiers, flag_thresholds } = session.settings
  const [importError, setImportError] = useState<string>()
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  // Manual Gist synchronization state.
  // There is intentionally NO polling and NO automatic import.
  const [gistId, setGistId] = useState<string | null>(null)
  const [gistFileName, setGistFileName] = useState<string | null>(null)
  const [gistUrlInput, setGistUrlInput] = useState<string>(DEFAULT_LIVE_GIST_URL)
  const [gistSyncLoading, setGistSyncLoading] = useState(false)
  const [gistStatus, setGistStatus] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const getGistId = (input: string) => {
    const value = input.trim()
    const match = value.match(/([0-9a-f]{20,})$/i)
    return match ? match[1] : value
  }

  /** Read Gist metadata without changing the local session. */
  const getGistInfo = async (input: string) => {
    const id = getGistId(input)
    if (!id) throw new Error('Inserisci un URL o un ID Gist.')

    const res = await fetch(`${GIST_PROXY_URL}/gists/${id}`)
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Gist fetch failed: ${res.status} ${body}`)
    }

    const data = await res.json()
    const fileName = Object.keys(data.files ?? {})[0]
    if (!fileName) throw new Error('Il Gist non contiene alcun file.')

    return { gistId: id, fileName, data }
  }

  /** Explicit Gist -> local operation. */
  const importFromGist = async () => {
    setGistSyncLoading(true)
    setGistStatus('Importazione dal Gist...')

    try {
      const { gistId: remoteGistId, fileName, data } = await getGistInfo(gistUrlInput)
      const content = data.files?.[fileName]?.content

      if (!content) throw new Error('Il file del Gist è vuoto.')

      const { session: parsed, error } = parseSessionFile(content)
      if (!parsed || error) {
        throw new Error(error ?? 'Il contenuto del Gist non è una sessione valida.')
      }

      // The ONLY automatic-looking overwrite: this function is called only
      // after the user explicitly clicks "Importa da Gist".
      importSession(parsed)

      setGistId(remoteGistId)
      setGistFileName(fileName)
      setGistUrlInput(`https://gist.github.com/${remoteGistId}`)
      setGistStatus(`Importato dal Gist ${remoteGistId}`)
    } catch (err: any) {
      console.error('import from gist failed', err)
      setGistStatus(`Errore importazione: ${err?.message ?? 'impossibile importare dal Gist'}`)
    } finally {
      setGistSyncLoading(false)
      setTimeout(() => setGistStatus(null), 5000)
    }
  }

  /** Explicit local -> Gist operation. */
  const saveCurrentStateToGist = async () => {
    setGistSyncLoading(true)
    setSavedMsg('Salvataggio in corso...')

    try {
      await saveState()

      let targetGistId = gistId
      let targetFileName = gistFileName

      // If no Gist has been selected yet, discover the configured Gist.
      // This does NOT import its contents.
      if (!targetGistId || !targetFileName) {
        const info = await getGistInfo(gistUrlInput)
        targetGistId = info.gistId
        targetFileName = info.fileName
        setGistId(targetGistId)
        setGistFileName(targetFileName)
      }

      const patchPayload = {
        files: {
          [targetFileName]: {
            content: serializeSession(session),
          },
        },
      }

      const res = await fetch(`${GIST_PROXY_URL}/gists/${targetGistId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchPayload),
      })

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Gist update failed: ${res.status} ${body}`)
      }

      setSavedMsg('Stato salvato localmente e aggiornato nel Gist')
    } catch (err: any) {
      console.error('save state / gist failed', err)
      setSavedMsg(`Errore: ${err?.message ?? 'impossibile aggiornare il Gist'}`)
    } finally {
      setGistSyncLoading(false)
      setTimeout(() => setSavedMsg(null), 5000)
    }
  }

  function exportSession() {
    const blob = new Blob([serializeSession(session)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = sessionFileName(session, Date.now())
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importSessionFile(file: File) {
    const raw = await file.text()
    const { session: parsed, error } = parseSessionFile(raw)
    if (error || !parsed) {
      setImportError(error ?? 'File non valido.')
      return
    }
    setImportError(undefined)
    importSession(parsed)
  }

  const unassigned = rolesWithoutBucket(buckets)
  const overlapping = overlappingRoles(buckets)


  return (
    <div className="h-full overflow-auto p-4">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* --- Role buckets ------------------------------------------------- */}
        <section>
          <header className="mb-2 flex flex-wrap items-baseline gap-2">
            <h2 className="text-sm font-semibold">Reparti e quote rosa</h2>
            <p className="text-xs text-(--color-fg-subtle)">
              Le regole ufficiali Mantra non fissano la composizione della rosa:
              definiscila come la tua lega.
            </p>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs tabular-nums text-(--color-fg-muted)">
                rosa totale{' '}
                <span className="font-semibold text-(--color-fg)">
                  {totalQuota(buckets)}
                </span>
              </span>
              <button
                onClick={() => setBuckets(defaultBuckets())}
                className="flex h-8 items-center gap-1.5 rounded-md border border-(--color-border) px-2.5 text-xs text-(--color-fg-muted) hover:bg-(--color-surface-2)"
              >
                <RotateCcw size={13} />
                Ripristina default
              </button>
              <button
                onClick={addBucket}
                className="flex h-8 items-center gap-1.5 rounded-md bg-(--color-brand) px-2.5 text-xs font-semibold text-(--color-brand-fg) hover:bg-(--color-brand-strong)"
              >
                <Plus size={13} />
                Aggiungi reparto
              </button>
            </div>
          </header>

          <div className="space-y-2">
            {buckets.map((bucket) => (
              <div
                key={bucket.id}
                className="rounded-lg border border-(--color-border) bg-(--color-surface) p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: bucketAccent[bucket.color] }}
                  />
                  <input
                    value={bucket.label}
                    onChange={(e) =>
                      patchBucket(bucket.id, { label: e.target.value })
                    }
                    className="h-8 min-w-40 flex-1 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-sm"
                  />

                  <label className="flex items-center gap-1.5 text-xs text-(--color-fg-subtle)">
                    quota
                    <input
                      type="number"
                      min={0}
                      value={bucket.quota}
                      onChange={(e) =>
                        patchBucket(bucket.id, {
                          quota: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="h-8 w-16 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-sm tabular-nums"
                    />
                  </label>

                  <select
                    value={bucket.color}
                    onChange={(e) =>
                      patchBucket(bucket.id, {
                        color: e.target.value as BucketColor,
                      })
                    }
                    className="h-8 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-xs"
                  >
                    {BUCKET_COLORS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => removeBucket(bucket.id)}
                    title="Elimina reparto"
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-(--color-border) text-(--color-fg-subtle) hover:bg-(--color-surface-2) hover:text-(--color-danger)"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Role toggles — a role may sit in several buckets, or none. */}
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {MANTRA_ROLES.map((role) => {
                    const on = bucket.roles.includes(role)
                    return (
                      <button
                        key={role}
                        onClick={() => toggleBucketRole(bucket.id, role)}
                        title={ROLE_LABELS[role]}
                        className={clsx(
                          'rounded border px-1.5 py-0.5 text-[11px] font-medium transition-colors',
                          !on &&
                            'border-(--color-border) text-(--color-fg-subtle) hover:bg-(--color-surface-2)',
                        )}
                        style={
                          on
                            ? {
                                borderColor: bucketAccent[bucket.color],
                                color: bucketAccent[bucket.color],
                                background: `color-mix(in oklab, ${bucketAccent[bucket.color]} 18%, transparent)`,
                              }
                            : undefined
                        }
                      >
                        {role}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Advisory notices — allowed states, never blocking. */}
          {(unassigned.length > 0 || overlapping.length > 0) && (
            <div className="mt-2 space-y-1.5">
              {unassigned.length > 0 && (
                <Notice severity="warn">
                  Ruoli non assegnati a nessun reparto:{' '}
                  <strong>{unassigned.join(', ')}</strong>. È consentito, ma questi
                  giocatori non rientreranno in nessuna quota né nel controllo di
                  saturazione.
                </Notice>
              )}
              {overlapping.length > 0 && (
                <Notice severity="info">
                  Ruoli presenti in più reparti:{' '}
                  <strong>{overlapping.join(', ')}</strong>. Un giocatore conta in
                  ogni reparto compatibile — utile per i multi-ruolo.
                </Notice>
              )}
            </div>
          )}
        </section>

        {/* --- Tiers / "fasce" ----------------------------------------------- */}
        <section>
          <header className="mb-2 flex flex-wrap items-baseline gap-2">
            <h2 className="text-sm font-semibold">Fasce</h2>
            <p className="text-xs text-(--color-fg-subtle)">
              L’ordine qui sotto è l’ordine usato per ordinare la Prep board.
            </p>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setTiers(defaultTiers())}
                className="flex h-8 items-center gap-1.5 rounded-md border border-(--color-border) px-2.5 text-xs text-(--color-fg-muted) hover:bg-(--color-surface-2)"
              >
                <RotateCcw size={13} />
                Ripristina default
              </button>
              <button
                onClick={addTier}
                className="flex h-8 items-center gap-1.5 rounded-md bg-(--color-brand) px-2.5 text-xs font-semibold text-(--color-brand-fg) hover:bg-(--color-brand-strong)"
              >
                <Plus size={13} />
                Aggiungi fascia
              </button>
            </div>
          </header>

          <div className="space-y-2">
            {tiers.map((tier, i) => (
              <div
                key={tier.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-(--color-border) bg-(--color-surface) p-3"
              >
                <div className="flex shrink-0 flex-col">
                  <button
                    onClick={() => moveTier(tier.id, 'up')}
                    disabled={i === 0}
                    title="Sposta su"
                    className="flex h-4 w-6 items-center justify-center text-(--color-fg-subtle) hover:text-(--color-fg) disabled:opacity-30"
                  >
                    <ArrowUp size={11} />
                  </button>
                  <button
                    onClick={() => moveTier(tier.id, 'down')}
                    disabled={i === tiers.length - 1}
                    title="Sposta giù"
                    className="flex h-4 w-6 items-center justify-center text-(--color-fg-subtle) hover:text-(--color-fg) disabled:opacity-30"
                  >
                    <ArrowDown size={11} />
                  </button>
                </div>

                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: bucketAccent[tier.color] }}
                />
                <input
                  value={tier.label}
                  onChange={(e) => patchTier(tier.id, { label: e.target.value })}
                  className="h-8 min-w-40 flex-1 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-sm"
                />

                <select
                  value={tier.color}
                  onChange={(e) =>
                    patchTier(tier.id, { color: e.target.value as BucketColor })
                  }
                  className="h-8 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-xs"
                >
                  {BUCKET_COLORS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => removeTier(tier.id)}
                  title="Elimina fascia"
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-(--color-border) text-(--color-fg-subtle) hover:bg-(--color-surface-2) hover:text-(--color-danger)"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          {tiers.length === 0 && (
            <Notice severity="warn">
              Nessuna fascia configurata: i giocatori con una fascia già assegnata la
              mantengono, ma la Prep board non può proporne di nuove finché non ne
              aggiungi almeno una.
            </Notice>
          )}
        </section>

        {/* --- Flag thresholds --------------------------------------------- */}
        <section>
          <h2 className="mb-2 text-sm font-semibold">Soglie degli avvisi</h2>
          <div className="grid gap-3 rounded-lg border border-(--color-border) bg-(--color-surface) p-4 sm:grid-cols-3">
            <Field
              label="Accumulo squadra"
              hint="Avvisa quando la squadra raggiunge questo numero di giocatori dello stesso club."
              value={flag_thresholds.club_stack}
              onChange={(v) =>
                updateSettings({
                  flag_thresholds: { ...flag_thresholds, club_stack: v },
                })
              }
            />
            <Field
              label="Soglia sovrapprezzo (%)"
              hint="Avvisa se il prezzo supera il medio d’asta di questa percentuale."
              value={flag_thresholds.overpay_pct}
              onChange={(v) =>
                updateSettings({
                  flag_thresholds: { ...flag_thresholds, overpay_pct: v },
                })
              }
            />
            <Field
              label="Crediti minimi per slot"
              hint="Usato per stimare se il budget resta sufficiente agli slot ancora vuoti."
              value={flag_thresholds.min_credits_per_slot}
              onChange={(v) =>
                updateSettings({
                  flag_thresholds: { ...flag_thresholds, min_credits_per_slot: v },
                })
              }
            />
          </div>
        </section>

        {/* --- Teams ------------------------------------------------------- */}
        <section>
          <header className="mb-2 flex flex-wrap items-baseline gap-2">
            <h2 className="text-sm font-semibold">Squadre della lega</h2>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-(--color-fg-subtle)">
              numero di squadre
              <input
                type="number"
                min={1}
                value={session.teams.length}
                onChange={(e) => setNumTeams(Number(e.target.value) || 1)}
                className="h-8 w-16 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-sm tabular-nums"
              />
            </label>
          </header>
          <div className="divide-y divide-(--color-border) overflow-hidden rounded-lg border border-(--color-border) bg-(--color-surface)">
            {session.teams.map((team) => (
              <div key={team.id} className="flex items-center gap-2 px-3 py-2">
                <input
                  value={team.name}
                  onChange={(e) => updateTeam(team.id, { name: e.target.value })}
                  className="h-8 min-w-0 flex-1 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-sm"
                />
                <label className="flex items-center gap-1.5 text-xs text-(--color-fg-subtle)">
                  budget
                  <input
                    type="number"
                    min={0}
                    value={team.budget_total}
                    onChange={(e) =>
                      updateTeam(team.id, {
                        budget_total: Number(e.target.value) || 0,
                      })
                    }
                    className="h-8 w-20 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-sm tabular-nums"
                  />
                </label>
                <span className="w-8 text-right text-[11px] text-(--color-brand)">
                  {team.isMe ? 'io' : ''}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-(--color-fg-subtle)">
            Riducendo il numero, le squadre vengono rimosse dal fondo — ma non quelle con acquisti
            già registrati, né la tua.
          </p>
        </section>

        {/* --- Session synchronization ------------------------------------ */}
<section>
  <header className="mb-2">
    <h2 className="text-sm font-semibold">
      Sincronizzazione sessione
    </h2>

    <p className="mt-1 text-xs text-(--color-fg-subtle)">
      Sincronizzazione manuale tramite il Gist condiviso.
      Nessun download o aggiornamento automatico quando cambi pagina.
    </p>
  </header>

  {/* Gist synchronization */}
  <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-4">
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="text-xs text-(--color-fg-subtle)">
        Gist condiviso
      </span>

      <code className="min-w-0 truncate text-xs text-(--color-fg-muted)">
        {DEFAULT_LIVE_GIST_URL}
      </code>
    </div>

    <div className="flex flex-wrap gap-2">
      {/* GIST → LOCAL */}
      <button
        onClick={() => void importFromGist()}
        disabled={gistSyncLoading}
        className="flex h-9 items-center gap-2 rounded-md border border-(--color-border) px-3 text-sm text-(--color-fg-muted) hover:bg-(--color-surface-2) disabled:opacity-50"
      >
        <Upload size={14} />
        Importa da Gist
      </button>

      {/* LOCAL → GIST */}
      <button
        onClick={() => void saveCurrentStateToGist()}
        disabled={gistSyncLoading}
        className="flex h-9 items-center gap-2 rounded-md border border-(--color-border) px-3 text-sm text-(--color-fg-muted) hover:bg-(--color-surface-2) disabled:opacity-50"
      >
        <Download size={14} />
        Salva stato corrente
      </button>
    </div>

    {gistId && gistFileName && (
      <div className="mt-2 text-[11px] text-(--color-fg-subtle)">
        File Gist: {gistFileName}
      </div>
    )}

    {gistStatus && (
      <div className="mt-2 text-xs text-(--color-fg-muted)">
        {gistStatus}
      </div>
    )}

    {savedMsg && (
      <div className="mt-2 text-xs text-(--color-fg-muted)">
        {savedMsg}
      </div>
    )}
  </div>

  {/* JSON safety backup */}
  <div className="mt-3 rounded-lg border border-(--color-border) bg-(--color-surface) p-4">
    <h3 className="text-xs font-semibold">
      Backup locale (JSON)
    </h3>

    <p className="mt-1 text-[11px] text-(--color-fg-subtle)">
      Usa questi comandi come alternativa manuale se il Gist
      non è disponibile.
    </p>

    <div className="mt-3 flex flex-wrap gap-2">
      {/* LOCAL → JSON */}
      <button
        onClick={exportSession}
        className="flex h-9 items-center gap-2 rounded-md border border-(--color-border) px-3 text-sm text-(--color-fg-muted) hover:bg-(--color-surface-2)"
      >
        <Download size={14} />
        Esporta sessione (JSON)
      </button>

      {/* JSON → LOCAL */}
      <button
        onClick={() => fileInput.current?.click()}
        className="flex h-9 items-center gap-2 rounded-md border border-(--color-border) px-3 text-sm text-(--color-fg-muted) hover:bg-(--color-surface-2)"
      >
        <Upload size={14} />
        Importa sessione (JSON)
      </button>

      <input
        ref={fileInput}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]

          if (file) {
            void importSessionFile(file)
          }

          e.target.value = ''
        }}
      />
    </div>

    {importError && (
      <p
        className="mt-2 text-xs"
        style={{ color: 'var(--color-danger)' }}
      >
        {importError}
      </p>
    )}
  </div>
</section>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="h-8 w-24 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-sm tabular-nums"
      />
      <span className="text-[11px] text-(--color-fg-subtle)">{hint}</span>
    </label>
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
      className="flex items-start gap-2 rounded px-2.5 py-2 text-xs leading-snug"
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