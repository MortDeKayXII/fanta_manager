import { useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Database,
  Download,
  Info,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  X,
  Github,
} from 'lucide-react'
import clsx from 'clsx'

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
    sessions,
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
    renameSession,
    newSession,
    switchSession,
    deleteSession,
    loadDemoData,
    importSession,
    hasSavedState,
    saveState,
    clearSavedState,
  } = useSession()
  const { buckets, tiers, flag_thresholds } = session.settings
  const [importError, setImportError] = useState<string>()
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [gistMsg, setGistMsg] = useState<string | null>(null)
  const [gistLoading, setGistLoading] = useState(false)
  // Live share state
  const [liveGistId, setLiveGistId] = useState<string | null>(null)
  const [liveFileName, setLiveFileName] = useState<string | null>(null)
  const [liveGistUrlInput, setLiveGistUrlInput] = useState<string>('')
  const [liveTokenInput, setLiveTokenInput] = useState<string>('')
  const [liveStatus, setLiveStatus] = useState<string | null>(null)
  const pollingRef = useRef<number | null>(null)
  const lastContentRef = useRef<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

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

        {/* --- Sessions ---------------------------------------------------- */}
        <section>
          <header className="mb-2 flex flex-wrap items-baseline gap-2">
            <h2 className="text-sm font-semibold">Sessioni</h2>
            <p className="text-xs text-(--color-fg-subtle)">
              Salvate nel browser (IndexedDB). Ogni modifica è persistente.
            </p>
            <button
              onClick={() => newSession({})}
              className="ml-auto flex h-8 items-center gap-1.5 rounded-md bg-(--color-brand) px-2.5 text-xs font-semibold text-(--color-brand-fg) hover:bg-(--color-brand-strong)"
            >
              <Plus size={13} />
              Nuova sessione
            </button>
          </header>

          <div className="divide-y divide-(--color-border) overflow-hidden rounded-lg border border-(--color-border) bg-(--color-surface)">
            <div className="flex items-center gap-2 px-3 py-2">
              <input
                value={session.name}
                onChange={(e) => renameSession(e.target.value)}
                className="h-8 min-w-0 flex-1 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-sm"
              />
              <span className="shrink-0 text-[11px] tracking-wide text-(--color-brand) uppercase">
                aperta
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-(--color-fg-subtle)">
                {session.players.length} giocatori · {session.log.length} assegnati
              </span>
            </div>

            {sessions
              .filter((s) => s.id !== session.id)
              .map((s) => (
                <div key={s.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-(--color-fg-subtle)">
                    {s.players.length} giocatori · {s.log.length} assegnati
                  </span>
                  <button
                    onClick={() => switchSession(s.id)}
                    className="h-7 shrink-0 rounded border border-(--color-border) px-2 text-xs text-(--color-fg-muted) hover:bg-(--color-surface-2)"
                  >
                    Apri
                  </button>
                  <button
                    onClick={() => deleteSession(s.id)}
                    title="Elimina sessione"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-(--color-border) text-(--color-fg-subtle) hover:bg-(--color-surface-2) hover:text-(--color-danger)"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
          </div>

            <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={loadDemoData}
              className="flex h-9 items-center gap-2 rounded-md border border-(--color-border) px-3 text-sm text-(--color-fg-muted) hover:bg-(--color-surface-2)"
            >
              <Database size={14} />
              Carica dati demo
            </button>
            <button
              onClick={async () => {
                setSavedMsg('Salvataggio in corso...')
                try {
                  await saveState()
                  setSavedMsg('Stato salvato come predefinito per nuove sessioni')
                  // If live share is active and we have a gist id, attempt to push update
                  if (liveGistId && liveFileName) {
                    try {
                      const token = liveTokenInput || window.prompt('Inserisci Personal Access Token con scope `gist` per aggiornare il gist (annulla per saltare).')
                      if (token) {
                        const patchPayload = {
                          files: {
                            [liveFileName]: { content: serializeSession(session) },
                          },
                        }
                        const res = await fetch(`https://api.github.com/gists/${liveGistId}`, {
                          method: 'PATCH',
                          headers: {
                            'Content-Type': 'application/json',
                            Authorization: `token ${token}`,
                          },
                          body: JSON.stringify(patchPayload),
                        })
                        if (!res.ok) {
                          // eslint-disable-next-line no-console
                          console.error('push gist failed', await res.text())
                        }
                      }
                    } catch (err) {
                      // non-fatal
                      // eslint-disable-next-line no-console
                      console.error('live push failed', err)
                    }
                  }
                } catch (err) {
                  // Surface the error so the user sees failure (e.g. private mode)
                  // eslint-disable-next-line no-console
                  console.error('saveState failed', err)
                  setSavedMsg('Errore: impossibile salvare (controlla IndexedDB)')
                }
                setTimeout(() => setSavedMsg(null), 3000)
              }}
              className="flex h-9 items-center gap-2 rounded-md border border-(--color-border) px-3 text-sm text-(--color-fg-muted) hover:bg-(--color-surface-2)"
            >
              <Database size={14} />
              Salva stato corrente
            </button>
            <button
              onClick={async () => {
                setGistMsg('Creazione gist in corso...')
                setGistLoading(true)
                try {
                  const payload = {
                    description: `Shared session ${session.name}`,
                    public: true,
                    files: {
                      [sessionFileName(session, Date.now())]: {
                        content: serializeSession(session),
                      },
                    },
                  }

                  // Try unauthenticated first
                  let res = await fetch('https://api.github.com/gists', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                  })

                  if (res.status !== 201) {
                    // Prompt for token and retry
                    const token = window.prompt(
                      'Creazione gist pubblica fallita. Inserisci Personal Access Token con scope `gist` (orizza) per riprovare, oppure annulla.',
                    )
                    if (!token) throw new Error('Token non fornito')

                    res = await fetch('https://api.github.com/gists', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `token ${token}`,
                      },
                      body: JSON.stringify(payload),
                    })
                  }

                  if (!res.ok) {
                    const body = await res.text()
                    throw new Error(`Gist failed: ${res.status} ${body}`)
                  }

                  const data = await res.json()
                  const url = data.html_url || data.url
                  await navigator.clipboard.writeText(url)
                  setGistMsg(`Gist creato: ${url} (copiato negli appunti)`)
                } catch (err: any) {
                  // eslint-disable-next-line no-console
                  console.error('create gist failed', err)
                  setGistMsg('Errore: impossibile creare il gist. Usa Esporta per condividere.')
                } finally {
                  setGistLoading(false)
                  setTimeout(() => setGistMsg(null), 8000)
                }
              }}
              disabled={gistLoading}
              className="flex h-9 items-center gap-2 rounded-md border border-(--color-border) px-3 text-sm text-(--color-fg-muted) hover:bg-(--color-surface-2)"
            >
              <Github size={14} />
              Condividi (Gist)
            </button>
            {/* Live share controls: create/join a gist and poll for updates */}
            <div className="flex items-center gap-2">
              <input
                value={liveGistUrlInput}
                onChange={(e) => setLiveGistUrlInput(e.target.value)}
                placeholder="Gist URL o ID (lascia vuoto per crearne uno)"
                className="h-9 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-sm"
              />
              <input
                value={liveTokenInput}
                onChange={(e) => setLiveTokenInput(e.target.value)}
                placeholder="Token (opzionale, necessario per push)"
                type="password"
                className="h-9 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 text-sm"
              />
              <button
                onClick={async () => {
                  // Start or join live share
                  if (pollingRef.current) {
                    // Stop
                    window.clearInterval(pollingRef.current)
                    pollingRef.current = null
                    setLiveGistId(null)
                    setLiveFileName(null)
                    setLiveStatus('Live share fermato')
                    setTimeout(() => setLiveStatus(null), 3000)
                    return
                  }

                  setLiveStatus('Avvio live share...')
                  try {
                    let gistId: string | null = null
                    let fileName: string | null = null

                    if (liveGistUrlInput) {
                      // Extract id from input
                      const m = liveGistUrlInput.match(/([0-9a-f]{20,})$/i)
                      gistId = m ? m[1] : liveGistUrlInput
                    }

                    if (!gistId) {
                      // Create a new gist to be used for live sharing
                      const payload = {
                        description: `Live shared session ${session.name}`,
                        public: true,
                        files: {
                          [sessionFileName(session, Date.now())]: {
                            content: serializeSession(session),
                          },
                        },
                      }

                      let res = await fetch('https://api.github.com/gists', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                      })

                      // If GitHub requires authentication, prompt and retry with token
                      if (res.status === 401) {
                        const token = liveTokenInput || window.prompt('Creazione gist richiede autenticazione. Inserisci Personal Access Token con scope `gist` per creare il gist, oppure annulla.')
                        if (!token) throw new Error('Autenticazione richiesta')
                        res = await fetch('https://api.github.com/gists', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            Authorization: `token ${token}`,
                          },
                          body: JSON.stringify(payload),
                        })
                      }

                      if (!res.ok) throw new Error(await res.text())
                      const data = await res.json()
                      gistId = data.id
                      fileName = Object.keys(data.files)[0]
                      const url = data.html_url || data.url
                      await navigator.clipboard.writeText(url)
                      setLiveStatus(`Live gist creato e copiato negli appunti: ${url}`)
                    } else {
                      // Join existing gist: discover files
                      let res = await fetch(`https://api.github.com/gists/${gistId}`)
                      if (res.status === 401) {
                        const token = liveTokenInput || window.prompt('Accesso al gist richiesto. Inserisci Personal Access Token con scope `gist` per connetterti, oppure annulla.')
                        if (!token) throw new Error('Autenticazione richiesta')
                        res = await fetch(`https://api.github.com/gists/${gistId}`, {
                          headers: { Authorization: `token ${token}` },
                        })
                      }
                      if (!res.ok) throw new Error(await res.text())
                      const data = await res.json()
                      fileName = Object.keys(data.files)[0]
                      setLiveStatus(`Connesso a gist: ${gistId}`)
                    }

                    setLiveGistId(gistId)
                    setLiveFileName(fileName)

                    // Start polling
                    lastContentRef.current = null
                    pollingRef.current = window.setInterval(async () => {
                      try {
                        const res = await fetch(`https://api.github.com/gists/${gistId}`)
                        if (!res.ok) return
                        const data = await res.json()
                        const f = data.files[fileName]
                        if (!f) return
                        const content = f.content
                        if (content && content !== lastContentRef.current) {
                          lastContentRef.current = content
                          const { session: parsed, error } = parseSessionFile(content)
                          if (parsed && !error) {
                            importSession(parsed)
                            setLiveStatus('Sessione aggiornata dal gist')
                            setTimeout(() => setLiveStatus(null), 2000)
                          }
                        }
                      } catch (err) {
                        // eslint-disable-next-line no-console
                        console.error('poll gist failed', err)
                      }
                    }, 5000)
                  } catch (err: any) {
                    // eslint-disable-next-line no-console
                    console.error('start live share failed', err)
                    setLiveStatus('Errore: impossibile avviare il live share')
                    setTimeout(() => setLiveStatus(null), 4000)
                  }
                }}
                className="flex h-9 items-center gap-2 rounded-md border border-(--color-border) px-3 text-sm text-(--color-fg-muted) hover:bg-(--color-surface-2)"
              >
                {pollingRef.current ? 'Stop Live' : 'Start Live Share'}
              </button>
            </div>
            {liveStatus && (
              <div className="flex items-center pl-2">
                <span className="text-xs text-(--color-fg-muted)">{liveStatus}</span>
              </div>
            )}
            {hasSavedState && (
              <button
                onClick={async () => {
                  setSavedMsg('Rimozione in corso...')
                  try {
                    await clearSavedState()
                    setSavedMsg('Stato predefinito rimosso')
                  } catch (err) {
                    // eslint-disable-next-line no-console
                    console.error('clearSavedState failed', err)
                    setSavedMsg('Errore: impossibile rimuovere lo stato')
                  }
                  setTimeout(() => setSavedMsg(null), 3000)
                }}
                className="flex h-9 items-center gap-2 rounded-md border border-(--color-border) px-3 text-sm text-(--color-fg-muted) hover:bg-(--color-surface-2)"
              >
                <Trash2 size={14} />
                Cancella stato salvato
              </button>
            )}
            {savedMsg && (
              <div className="flex items-center pl-2">
                <span className="text-xs text-(--color-fg-muted)">{savedMsg}</span>
              </div>
            )}
            {gistMsg && (
              <div className="flex items-center pl-2">
                <span className="text-xs text-(--color-fg-muted)">{gistMsg}</span>
              </div>
            )}
            <button
              onClick={exportSession}
              className="flex h-9 items-center gap-2 rounded-md border border-(--color-border) px-3 text-sm text-(--color-fg-muted) hover:bg-(--color-surface-2)"
            >
              <Download size={14} />
              Esporta sessione (JSON)
            </button>
            <button
              onClick={() => fileInput.current?.click()}
              className="flex h-9 items-center gap-2 rounded-md border border-(--color-border) px-3 text-sm text-(--color-fg-muted) hover:bg-(--color-surface-2)"
            >
              <Upload size={14} />
              Importa sessione
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void importSessionFile(file)
                e.target.value = ''
              }}
            />
            {importError && (
              <p className="w-full text-xs" style={{ color: 'var(--color-danger)' }}>
                {importError}
              </p>
            )}
            <p className="w-full text-xs text-(--color-fg-subtle)">
              L’export scarica un file JSON della sessione aperta; l’import la apre come nuova
              sessione, senza toccare quella corrente.
            </p>
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
