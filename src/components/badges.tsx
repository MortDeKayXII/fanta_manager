import clsx from 'clsx'
import { AlertTriangle, Ban, Check, Info, Target } from 'lucide-react'

import { bucketsForRole } from '@/lib/buckets'
import { bucketAccent, severityBg, severityColor } from '@/lib/colors'
import { findTier } from '@/lib/tiers'
import type {
  Flag,
  FlagSeverity,
  MantraRole,
  PersonalTag,
  RoleBucket,
  TierDef,
} from '@/types'
import { ROLE_LABELS } from '@/types'

const chip =
  'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] leading-none font-medium whitespace-nowrap'

/**
 * A Mantra role code. Tinted with the accent of the bucket the role belongs to,
 * so a role reads the same everywhere. Roles in no bucket (allowed) fall back to
 * neutral; roles in several use the first bucket's accent.
 */
export function RoleBadge({
  role,
  buckets,
}: {
  role: MantraRole
  buckets: RoleBucket[]
}) {
  const bucket = bucketsForRole(buckets, role)[0]
  const color = bucket ? bucketAccent[bucket.color] : 'var(--color-fg-subtle)'

  return (
    <span
      className={clsx(chip, 'border')}
      style={{ color, borderColor: color, background: 'transparent' }}
      title={`${ROLE_LABELS[role]}${bucket ? ` — ${bucket.label}` : ' — nessun reparto'}`}
    >
      {role}
    </span>
  )
}

export function RoleBadges({
  roles,
  buckets,
}: {
  roles: MantraRole[]
  buckets: RoleBucket[]
}) {
  return (
    <span className="inline-flex gap-1">
      {roles.map((r) => (
        <RoleBadge key={r} role={r} buckets={buckets} />
      ))}
    </span>
  )
}

/**
 * A user-defined tier ("fascia"). Resolved by id against `tiers`, mirroring
 * `RoleBadge`'s bucket lookup; an orphaned tier id (deleted since assigned)
 * falls back to a neutral color and the raw id, rather than throwing.
 */
export function TierBadge({ tier, tiers }: { tier: string; tiers?: TierDef[] | null }) {
  const def = findTier(tiers, tier)
  const color = def ? bucketAccent[def.color] : 'var(--color-fg-subtle)'

  return (
    <span
      className={chip}
      style={{ color, background: 'var(--color-surface-3)' }}
      title={def?.label ?? tier}
    >
      {def?.label ?? tier}
    </span>
  )
}

/** Personal tag: target / avoid. Status-like meaning, so status tokens + icon. */
export function TagBadge({ tag }: { tag: PersonalTag }) {
  const isTarget = tag === 'target'
  const Icon = isTarget ? Target : Ban

  return (
    <span
      className={chip}
      style={{
        color: isTarget ? 'var(--color-ok)' : 'var(--color-danger)',
        background: isTarget ? 'var(--color-ok-bg)' : 'var(--color-danger-bg)',
      }}
    >
      <Icon size={11} strokeWidth={2.5} />
      {isTarget ? 'Target' : 'Evita'}
    </span>
  )
}

const SEVERITY_ICON = {
  info: Info,
  warn: AlertTriangle,
  danger: AlertTriangle,
} as const

/** A single flag (spec §4.4). Always icon + text — never color alone. */
export function FlagBadge({ flag }: { flag: Flag }) {
  const Icon = SEVERITY_ICON[flag.severity]

  return (
    <span
      className="flex items-start gap-1.5 rounded px-2 py-1 text-xs leading-snug"
      style={{
        color: severityColor[flag.severity],
        background: severityBg[flag.severity],
      }}
    >
      <Icon size={13} strokeWidth={2.5} className="mt-px shrink-0" />
      <span>{flag.message}</span>
    </span>
  )
}

/**
 * Summary badge for a team's fit-check row: "OK" or a flag count. Icon + label,
 * so severity is legible without relying on hue.
 */
export function FlagCountBadge({ flags }: { flags: Flag[] }) {
  if (flags.length === 0) {
    return (
      <span
        className={chip}
        style={{ color: 'var(--color-ok)', background: 'var(--color-ok-bg)' }}
      >
        <Check size={11} strokeWidth={3} />
        OK
      </span>
    )
  }

  const severity: FlagSeverity = flags.some((f) => f.severity === 'danger')
    ? 'danger'
    : flags.some((f) => f.severity === 'warn')
      ? 'warn'
      : 'info'

  return (
    <span
      className={chip}
      style={{ color: severityColor[severity], background: severityBg[severity] }}
    >
      <AlertTriangle size={11} strokeWidth={2.5} />
      {flags.length}
    </span>
  )
}

/** Real-life club code. Neutral by design — club stacking is shown by flags. */
export function ClubBadge({ club }: { club: string }) {
  return (
    <span className={clsx(chip, 'bg-(--color-surface-3) text-(--color-fg-muted)')}>
      {club}
    </span>
  )
}
