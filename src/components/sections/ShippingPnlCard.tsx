import { Truck } from 'lucide-react'
import type { ShippingResult } from '../../lib/shippingPnl'
import { formatCurrency, formatPercent } from '../../lib/format'
import { StatRows, type StatRowData } from '../StatRows'
import { Skeleton } from '../Skeleton'

interface ShippingPnlCardProps {
  result: ShippingResult | null
  /** Orders in the period, for the per-parcel lines. */
  orders: number
  /** Hand-entered surcharges, listed under what was paid. */
  extraCost: number
  /** What the orders themselves carried, before those surcharges. */
  orderCost: number
  loading: boolean
  failed: boolean
}

/**
 * Postage in, postage out, and what is left.
 *
 * In the statement's row grammar rather than as tiles, because it is the same
 * kind of reading: a figure, the parts that make it up, and each part's share
 * of the whole. Charged is the base — every share answers "what part of the
 * postage we collected is this".
 */
export function ShippingPnlCard({
  result,
  orders,
  extraCost,
  orderCost,
  loading,
  failed,
}: ShippingPnlCardProps) {
  const rows = result ? buildRows(result, orders, extraCost, orderCost) : []
  const losing = result !== null && result.net < 0

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="kpi-label truncate">Shipping profit &amp; loss</div>
          <div className="mt-2">
            {loading ? (
              <Skeleton className="h-[30px] w-40" />
            ) : (
              <div
                className={`kpi-value truncate ${
                  failed || !result ? '' : losing ? 'text-neg' : 'text-pos'
                }`}
              >
                {failed || !result
                  ? '—'
                  : `${losing ? '−' : '+'}${formatCurrency(Math.abs(result.net))}`}
              </div>
            )}
          </div>
          {result && !loading && !failed && (
            <p className="mt-1 text-[12px] text-muted">
              {result.recovery === null
                ? 'Nothing was spent on postage in this period.'
                : losing
                  ? `Customers covered ${formatPercent(result.recovery)} of the postage bill; the store paid the rest.`
                  : `Postage charged covered the bill ${formatPercent(result.recovery)} over.`}
            </p>
          )}
        </div>

        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-icon-btn text-muted">
          <Truck size={15} strokeWidth={2} />
        </span>
      </div>

      {loading ? (
        <div className="mt-4 flex flex-col gap-2 border-t border-row-line pt-3">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
        </div>
      ) : failed || rows.length === 0 ? (
        <p className="mt-4 border-t border-row-line pt-3 text-[12px] text-muted">
          Shipping data unavailable for this period.
        </p>
      ) : (
        <StatRows rows={rows} />
      )}
    </div>
  )
}

function buildRows(
  result: ShippingResult,
  orders: number,
  extraCost: number,
  orderCost: number,
): StatRowData[] {
  const base = result.charged
  const share = (n: number) => (base === 0 ? null : n / base)
  const rows: StatRowData[] = []

  rows.push({
    label: 'Shipping collected',
    value: formatCurrency(result.charged),
    kind: 'total',
    share: null,
    change: null,
  })
  if (orders > 0) {
    rows.push({
      label: 'Per order',
      value: formatCurrency(result.charged / orders),
      kind: 'part',
      share: null,
      change: null,
    })
  }

  rows.push({
    label: 'Shipping paid',
    value: `−${formatCurrency(result.paid)}`,
    kind: 'total',
    share: share(-result.paid),
    change: null,
    polarity: 'down-good',
  })
  rows.push({
    label: 'Carrier cost',
    value: `−${formatCurrency(orderCost)}`,
    kind: 'part',
    share: share(-orderCost),
    change: null,
    polarity: 'down-good',
  })
  // Only where some exist: a store that has entered none should not have to
  // read a zero to find that out.
  if (extraCost > 0) {
    rows.push({
      label: 'Extra costs',
      value: `−${formatCurrency(extraCost)}`,
      kind: 'part',
      share: share(-extraCost),
      change: null,
      polarity: 'down-good',
    })
  }
  if (orders > 0) {
    rows.push({
      label: 'Per order',
      value: `−${formatCurrency(result.paid / orders)}`,
      kind: 'part',
      share: null,
      change: null,
      polarity: 'down-good',
    })
  }

  rows.push({
    label: result.net < 0 ? 'Shipping loss' : 'Shipping profit',
    value: `${result.net < 0 ? '−' : ''}${formatCurrency(Math.abs(result.net))}`,
    kind: 'total',
    share: share(result.net),
    change: null,
  })

  return rows
}
