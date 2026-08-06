import { useId, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, ChevronDown, TicketPercent } from 'lucide-react'
import type { CouponUsage } from '../../lib/data/types'
import type { DateRange, Metric } from '../../lib/types'
import { formatCurrency, formatDeltaPercent, formatInteger, formatPercent } from '../../lib/format'
import { formatRangeLabel } from '../../lib/dateRange'
import { Skeleton } from '../Skeleton'

interface CouponUsageCardProps {
  /** Total redemptions in the period, carrying its own movement. */
  couponsUsed: Metric | undefined
  /** What every redemption took off between them. */
  discountTotal: Metric | undefined
  coupons: CouponUsage[]
  /** Codes used in the comparison window and not in this one; null when off. */
  lapsedCodes: number | null | undefined
  /** The window every movement here is measured against, or null when off. */
  against: DateRange | null
  loading: boolean
  failed: boolean
  /**
   * Open on load. False on the dashboard, where the card is one of many and
   * the sentence in its header is the whole answer; true on the coupons page,
   * where the leaderboard is what the page is for.
   */
  defaultOpen?: boolean
}

/**
 * How coupon usage moved, and which codes moved it.
 *
 * The KPI strip above already states the totals. What it cannot say is whether
 * a fall came from every code slowing down or from one code being switched off,
 * and those call for opposite responses — so the codes are ranked here, each
 * carrying its own movement rather than only its share of the total.
 */
export function CouponUsageCard({
  couponsUsed,
  discountTotal,
  coupons,
  lapsedCodes,
  against,
  loading,
  failed,
  defaultOpen = false,
}: CouponUsageCardProps) {
  const [open, setOpen] = useState(defaultOpen)
  // Unique per instance: two of these on one page would otherwise both claim
  // the same id, and a label pointing at one would find the other.
  const bodyId = useId()
  const delta = couponsUsed?.deltaPct ?? null

  const body = (
    <>
      {loading ? (
        <div className="mt-4 flex flex-col gap-2.5 border-t border-row-line pt-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : failed ? (
        <p className="mt-4 border-t border-row-line pt-3 text-[12px] text-muted">
          Coupon usage unavailable for this period.
        </p>
      ) : coupons.length === 0 ? (
        <p className="mt-4 border-t border-row-line pt-3 text-[12px] text-muted">
          No coupon was redeemed in this period.
        </p>
      ) : (
        // Rank, code and figures cannot all fit a phone; the rows scroll
        // sideways rather than wrapping a leaderboard into unreadable shapes.
        <div className="mt-4 overflow-x-auto border-t border-row-line pt-2">
          <ol className={`flex flex-col ${against ? 'min-w-[30rem]' : 'min-w-[24rem]'}`}>
            {coupons.map((coupon, index) => (
              <UsageRow key={coupon.code} coupon={coupon} rank={index + 1} compared={!!against} />
            ))}
          </ol>
        </div>
      )}

      {!loading && !failed && !!lapsedCodes && (
        <p className="mt-3 border-t border-row-line pt-2.5 text-[11px] text-muted">
          {lapsedCodes === 1 ? '1 code that was' : `${formatInteger(lapsedCodes)} codes that were`}{' '}
          redeemed in the compared window {lapsedCodes === 1 ? 'was' : 'were'} not redeemed at all
          in this one.
        </p>
      )}
    </>
  )

  return (
    <div className="card">
      {/* The whole header opens it. The sentence under the label is the answer
          most readings want — how much was given away, and which way it moved
          — so it stays visible closed, and the codes that made it up are what
          unfolds. */}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="kpi-label truncate">Coupon usage</div>
          <p className="mt-1 text-[12px] text-muted">
            {headline(couponsUsed, discountTotal, delta, against)}
          </p>
        </div>

        <span className="flex items-center gap-1.5 shrink-0 text-muted">
          <ChevronDown
            size={15}
            className={`transition-transform ${open ? 'rotate-180' : ''}`}
          />
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-icon-btn">
            <TicketPercent size={15} strokeWidth={2} />
          </span>
        </span>
      </button>

      <div id={bodyId} hidden={!open}>
        {open && body}
      </div>
    </div>
  )
}

/**
 * The one-line answer to "did usage go up or down", in words rather than in a
 * coloured arrow — this sits under a label, not beside a figure.
 */
function headline(
  couponsUsed: Metric | undefined,
  discountTotal: Metric | undefined,
  delta: number | null,
  against: DateRange | null,
): string {
  if (!couponsUsed) return 'Redemptions across every code in the period.'

  // The count alone says how often a coupon was reached for, not what that
  // cost — and the cost is the half of it that reaches the statement.
  const off = discountTotal ? ` worth ${formatCurrency(discountTotal.value)} off` : ''
  const uses = `${formatInteger(couponsUsed.value)} ${
    couponsUsed.value === 1 ? 'redemption' : 'redemptions'
  }${off}`
  if (!against) return `${uses}. Turn on a comparison to see how that moved.`
  if (delta === null) {
    // No baseline to divide by: the compared window had no coupon usage at all,
    // which is a rise from nothing rather than an unknown, and saying so beats
    // showing an empty delta the reader has to interpret.
    return couponsUsed.value > 0
      ? `${uses}, against none at all in ${formatRangeLabel(against)}.`
      : `${uses}, the same as ${formatRangeLabel(against)}.`
  }

  const direction = delta === 0 ? 'level with' : delta > 0 ? 'up' : 'down'
  const move = delta === 0 ? '' : ` ${formatDeltaPercent(delta)}`
  return `${uses}, ${direction}${move} ${delta === 0 ? '' : 'on '}${formatRangeLabel(against)}.`
}

/**
 * `20% off` or `$10.00 off` — what the code is set to take, not what it took.
 *
 * Empty when the figure is missing rather than printed as `undefined% off`.
 * The function's responses are CDN-cached for a few minutes, so the first
 * loads after a deploy that adds a field can still be served a payload encoded
 * without it, and a card should degrade to saying less rather than to nonsense.
 */
function faceValue(coupon: CouponUsage): string {
  // Zero is treated as absent, not as a coupon that takes nothing off. No
  // store configures a 0% code, so a zero here means upstream did not report
  // the face value, and `0% off` would be a claim rather than a gap.
  if (!Number.isFinite(coupon.amount) || coupon.amount <= 0) return ''
  return coupon.type === 'percent'
    ? `${coupon.amount}% off`
    : `${formatCurrency(coupon.amount)} off`
}

/**
 * A code's own line. The bar behind it is its share of every redemption, so the
 * shape of the list reads before any figure does — one dominant code and a long
 * tail look different from five codes splitting the period evenly.
 */
function UsageRow({
  coupon,
  rank,
  compared,
}: {
  coupon: CouponUsage
  rank: number
  compared: boolean
}) {
  return (
    <li className="relative flex items-center gap-2 py-1.5">
      <span
        className="pointer-events-none absolute inset-y-0.5 left-0 rounded-[3px] bg-[#ffffff0a]"
        style={{ width: `${Math.max(1.5, coupon.share * 100)}%` }}
        aria-hidden
      />

      <span className="relative w-4 shrink-0 text-[11px] tabular-nums text-label">{rank}</span>
      {/* The code and what it takes off read as one thing — `20% off` is half
          of what `NEWUSER20` means — so the face value trails the code rather
          than claiming a column of its own. */}
      <span
        className="relative flex min-w-0 flex-1 items-baseline gap-1.5 truncate"
        title={`${coupon.code} — ${formatCurrency(coupon.revenue)} revenue`}
      >
        <span className="truncate font-mono text-[12px] text-ink">{coupon.code}</span>
        <span className="shrink-0 text-[10px] text-label">{faceValue(coupon)}</span>
      </span>

      <span className="relative shrink-0 text-[12px] font-semibold tabular-nums text-ink">
        {formatInteger(coupon.used)}
      </span>
      <span className="relative w-12 shrink-0 text-right text-[11px] tabular-nums text-muted">
        {formatPercent(coupon.share)}
      </span>
      {/* What the code actually took off over the period. Signed, like every
          other deduction on this dashboard: it comes off the statement.

          A code that was redeemed cannot have discounted nothing, so a zero
          here is upstream declining to report the figure, and it reads as the
          gap it is. Printed as −$0.00 it claimed the redemptions were free. */}
      <span className="relative w-20 shrink-0 text-right text-[11px] tabular-nums text-muted">
        {coupon.discount > 0 ? (
          `−${formatCurrency(coupon.discount)}`
        ) : coupon.freeShipping ? (
          // A code can be configured to take nothing off and exist purely to
          // waive postage. Its empty discount column is the whole truth about
          // it, and saying so beats a dash the reader has to interpret.
          <span className="text-[10px]">free shipping</span>
        ) : (
          '—'
        )}
      </span>

      {/* Holds its width even when a code has no movement to show, so one gap
          cannot shunt the column out of alignment down the list. */}
      {compared && (
        <span className="relative flex w-[4.5rem] shrink-0 items-center justify-end gap-0.5 text-[11px] tabular-nums">
          <Movement coupon={coupon} />
        </span>
      )}
    </li>
  )
}

/**
 * More redemptions is not plainly good — a coupon both wins the sale and pays
 * for it — so movement here is stated without the green/red the profit lines
 * carry, and only the direction is coloured in.
 */
function Movement({ coupon }: { coupon: CouponUsage }) {
  const { usedDeltaPct: delta, previousUsed } = coupon

  // A code with no prior redemptions has no percentage to report; it is new,
  // and `+∞%` would be both wrong and uninformative.
  if (delta === null) {
    return previousUsed === 0 ? <span className="text-pos">new</span> : <span className="text-muted">—</span>
  }
  if (delta === 0) {
    return (
      <span className="flex items-center gap-0.5 text-muted">
        <ArrowRight size={10} strokeWidth={3} />
        {formatDeltaPercent(delta)}
      </span>
    )
  }

  const Icon = delta < 0 ? ArrowDown : ArrowUp
  return (
    <span className={`flex items-center gap-0.5 ${delta < 0 ? 'text-neg' : 'text-pos'}`}>
      <Icon size={10} strokeWidth={3} />
      {formatDeltaPercent(delta)}
    </span>
  )
}
