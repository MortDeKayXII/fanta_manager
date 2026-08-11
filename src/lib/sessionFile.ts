/**
 * Export/Import session JSON (spec §5: "explicit Export session (JSON) /
 * Import session buttons so I can back up mid-draft or move to another
 * device manually").
 *
 * Pure functions over strings and objects — no `Blob`/`File`/DOM APIs here,
 * so the shape validation is unit-testable without a browser. The screen
 * owns the actual download/file-picker mechanics.
 */

import type { DraftSession } from '@/types'

export function serializeSession(session: DraftSession): string {
  return JSON.stringify(session, null, 2)
}

export interface ParsedSessionFile {
  session?: DraftSession
  error?: string
}

/**
 * Parses and shape-checks an imported session file. Deliberately shallow —
 * this checks the top-level fields a corrupt or unrelated JSON file would be
 * missing, not a full schema, since the file only ever comes from this app's
 * own Export.
 */
export function parseSessionFile(raw: string): ParsedSessionFile {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { error: 'Il file non è un JSON valido.' }
  }

  if (typeof data !== 'object' || data === null) {
    return { error: 'Il file non contiene un oggetto sessione.' }
  }

  const REQUIRED_KEYS = ['id', 'name', 'settings', 'teams', 'players', 'strategies', 'slot_assignments', 'log'] as const
  const missing = REQUIRED_KEYS.filter((k) => !(k in (data as Record<string, unknown>)))
  if (missing.length > 0) {
    return { error: `File sessione incompleto: manca ${missing.join(', ')}.` }
  }

  return { session: data as DraftSession }
}

const DIACRITICS = new RegExp(
  '[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']',
  'g',
)

/** A filesystem-safe filename derived from the session name and its export date. */
export function sessionFileName(session: DraftSession, at: number): string {
  const slug = session.name
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const date = new Date(at).toISOString().slice(0, 10)
  return `fantadraft-${slug || 'sessione'}-${date}.json`
}
