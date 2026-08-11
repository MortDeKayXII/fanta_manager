/**
 * Numeric display components: stat tiles, meters and quota bars.
 *
 * Per the dataviz method these are figures, not charts — a budget or a quota is
 * a single ratio against a limit, which is a meter's job, not a chart's.
 * Conventions followed here:
 *  - meter fill carries severity; the track is a dim step of the same ramp, so
 *    state reads across the whole bar
 *  - a 2px surface gap separates touching fills; no borders around marks
 *  - large standalone values use proportional figures; `tabular-nums` is only
 *    applied to columns that align vertically
 *  - every value is readable as text, never by color or length alone
 */

import clsx from 'clsx'

import { bucketAccent } from '@/lib/colors'
import type { BucketColor } from '@/types'

// --- Stat tile --------------------------------------------------------------

export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'neutral' | 'ok' | 'warn' | 'danger'
}) {
  const toneColor =
    tone === 'neutral'
      ? 'var(--color-fg)'
      : `var(--color-${tone === 'ok' ? 'ok' : tone})`

  return (
    <div className="rounded-lg border border-(--color-border) bg-(--color-surface) px-3 py-2.5">
      <div className="text-[11px] text-(--color-fg-subtle)">{label}</div>
      {/* Proportional figures: a large standalone number, not a column. */}
      <div
        className="mt-0.5 text-2xl leading-none font-semibold"
        style={{ color: toneColor }}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-[11px] text-(--color-fg-subtle)">{hint}</div>
      )}
    </div>
  )
}

/** The one number a screen leads with. Exactly one per view. */
export function HeroFigure({
  label,
  value,
  unit,
  hint,
}: {
  label: string
  value: string | number
  unit?: string
  hint?: string
}) {
  return (
    <div>
      <div className="text-xs text-(--color-fg-subtle)">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-5xl leading-none font-semibold">{value}</span>
        {unit && (
          <span className="text-base text-(--color-fg-muted)">{unit}</span>
        )}
      </div>
      {hint && <div className="mt-1.5 text-xs text-(--color-fg-muted)">{hint}</div>}
    </div>
  )
}

// --- Meter -----------------------------------------------------------------

/**
 * A single ratio against a limit. `severity` is derived from how much is left,
 * not from the raw value, so the fill means the same thing on every meter.
 */
export function BudgetMeter({
  spent,
  total,
  label = 'Budget',
  compact = false,
}: {
  spent: number
  total: number
  label?: string
  compact?: boolean
}) {
  const remaining = total - spent
  const pct = total > 0 ? Math.min(100, Math.max(0, (spent / total) * 100)) : 0
  const share = total > 0 ? remaining / total : 0

  const fill =
    share <= 0.1
      ? 'var(--color-danger)'
      : share <= 0.25
        ? 'var(--color-warn)'
        : 'var(--color-ok)'

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-(--color-fg-subtle)">{label}</span>
        <span className="tabular-nums text-(--color-fg-muted)">
          <span className="font-semibold text-(--color-fg)">{remaining}</span> / {total}
        </span>
      </div>
      <Track pct={pct} fill={fill} height={compact ? 4 : 6} />
      {!compact && (
        <div className="mt-1 text-[11px] text-(--color-fg-subtle) tabular-nums">
          {spent} spesi · {Math.round(pct)}% del budget
        </div>
      )}
    </div>
  )
}

/**
 * Bucket fill against its quota. Uses the bucket's own accent so the bar ties
 * back to the bucket it belongs to; over-quota switches to danger, since that is
 * state rather than identity.
 */
export function QuotaMeter({
  label,
  current,
  required,
  color,
  sublabel,
}: {
  label: string
  current: number
  required: number
  color: BucketColor
  sublabel?: string
}) {
  const pct = required > 0 ? Math.min(100, (current / required) * 100) : 0
  const over = current > required
  const fill = over ? 'var(--color-danger)' : bucketAccent[color]

  return (
    <div>
      <div className="flex items-baseline gap-2 text-xs">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: bucketAccent[color] }}
        />
        <span className="truncate text-(--color-fg)">{label}</span>
        {sublabel && (
          <span className="truncate text-[11px] text-(--color-fg-subtle)">
            {sublabel}
          </span>
        )}
        <span
          className="ml-auto shrink-0 tabular-nums"
          style={{ color: over ? 'var(--color-danger)' : 'var(--color-fg-muted)' }}
        >
          {current}/{required}
        </span>
      </div>
      <Track pct={pct} fill={fill} height={5} />
    </div>
  )
}

/**
 * Shared meter track. The unfilled remainder is a dim step of the fill's own
 * ramp rather than plain gray, so the bar reads as one object.
 */
function Track({
  pct,
  fill,
  height,
}: {
  pct: number
  fill: string
  height: number
}) {
  return (
    <div
      className="mt-1.5 w-full overflow-hidden rounded-full"
      style={{
        height,
        // Dim step of the same hue as the fill.
        background: `color-mix(in oklab, ${fill} 18%, var(--color-surface-2))`,
      }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${pct}%`, background: fill }}
      />
    </div>
  )
}

// --- Misc ------------------------------------------------------------------

export function BudgetPill({
  remaining,
  total,
}: {
  remaining: number
  total: number
}) {
  const share = total > 0 ? remaining / total : 0
  const tone =
    share <= 0.1 ? 'danger' : share <= 0.25 ? 'warn' : 'ok'

  return (
    <span
      className="rounded-md px-2 py-1 text-xs font-semibold tabular-nums"
      style={{
        color: `var(--color-${tone})`,
        background: `var(--color-${tone}-bg)`,
      }}
    >
      {remaining} cr
    </span>
  )
}

export function EmptyState({
  title,
  hint,
  className,
}: {
  title: string
  hint?: string
  className?: string
}) {
  return (
    <div
      className={clsx(
        'rounded-lg border border-dashed border-(--color-border) px-4 py-8 text-center',
        className,
      )}
    >
      <p className="text-sm text-(--color-fg-muted)">{title}</p>
      {hint && <p className="mt-1 text-xs text-(--color-fg-subtle)">{hint}</p>}
    </div>
  )
}
