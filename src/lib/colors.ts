/**
 * Maps the named accent of a user-defined bucket onto concrete CSS values.
 * Kept as a lookup (not string interpolation) so Tailwind's scanner and the
 * token set in index.css stay in sync.
 */

import type { BucketColor, FlagSeverity } from '@/types'

export const bucketAccent: Record<BucketColor, string> = {
  amber: 'var(--color-accent-amber)',
  sky: 'var(--color-accent-sky)',
  violet: 'var(--color-accent-violet)',
  teal: 'var(--color-accent-teal)',
  rose: 'var(--color-accent-rose)',
  lime: 'var(--color-accent-lime)',
  slate: 'var(--color-accent-slate)',
}

export const severityColor: Record<FlagSeverity | 'ok', string> = {
  ok: 'var(--color-ok)',
  info: 'var(--color-info)',
  warn: 'var(--color-warn)',
  danger: 'var(--color-danger)',
}

export const severityBg: Record<FlagSeverity | 'ok', string> = {
  ok: 'var(--color-ok-bg)',
  info: 'var(--color-info-bg)',
  warn: 'var(--color-warn-bg)',
  danger: 'var(--color-danger-bg)',
}

