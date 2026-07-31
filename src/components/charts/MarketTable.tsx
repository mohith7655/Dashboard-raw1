import type { ReactNode } from 'react'
import type { MarketRevenue } from '../../lib/types'
import {
  formatCurrency,
  formatInteger,
  formatPercent,
} from '../../lib/format'
import { Skeleton } from '../Skeleton'

/** One series, so one recessive tone — the row label carries the identity. */
const BAR = '#a1a1aa'

/** Pixel width of a full-length share bar. */
const BAR_TRACK = 96

/** Past this the card scrolls rather than pushing the page down. */
const MAX_BODY = 'max-h-[420px]'

export type MarketMeasure = 'revenue' | 'shippingCost'

interface MarketTableProps {
  title: string
  subtitle: string
  /** Column heading for the first column, e.g. `Country`. */
  keyHeader: string
  rows: MarketRevenue[]
  /** Which figure drives the ranking and the share bar. */
  measure: MarketMeasure
  loading?: boolean
  unavailable?: string
}

/**
 * The full list, never a top-N: a country that ships at a loss is exactly the
 * one that would have been collapsed into "other". The share bar gives the
 * magnitude at a glance and the columns give the exact figures.
 */
export function MarketTable({
  title,
  subtitle,
  keyHeader,
  rows,
  measure,
  loading,
  unavailable,
}: MarketTableProps) {
  const sorted = [...rows].sort((a, b) => b[measure] - a[measure])
  const total = sorted.reduce((sum, row) => sum + row[measure], 0)
  const largest = sorted.length > 0 ? Math.max(...sorted.map((r) => r[measure])) : 0
  const shippingView = measure === 'shippingCost'

  return (
    <div className="card p-0">
      <div className="px-5 pb-4 pt-5">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        <p className="mt-0.5 text-[12px] text-muted">
          {subtitle}
          {!loading && !unavailable && sorted.length > 0 && (
            <> · {formatInteger(sorted.length)} in this period</>
          )}
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3 px-5 pb-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      ) : unavailable ? (
        <div className="px-5 pb-6 text-[13px] text-muted">{unavailable}</div>
      ) : sorted.length === 0 ? (
        <div className="px-5 pb-6 text-[13px] text-muted">No orders in this period.</div>
      ) : (
        <div className={`${MAX_BODY} overflow-y-auto overflow-x-auto`}>
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-line text-left">
                <Th className="pl-5">{keyHeader}</Th>
                <Th align="right">Orders</Th>
                <Th align="right">{shippingView ? 'Shipping' : 'Revenue'}</Th>
                <Th align="right">{shippingView ? 'Per order' : 'AOV'}</Th>
                <Th align="right" className="pr-5">
                  {shippingView ? '% of revenue' : 'Share'}
                </Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const value = row[measure]
                const perOrder = row.orders === 0 ? 0 : value / row.orders
                const ratio = shippingView
                  ? row.revenue === 0
                    ? 0
                    : row.shippingCost / row.revenue
                  : total === 0
                    ? 0
                    : value / total

                return (
                  <tr key={row.key} className="border-b border-row-line last:border-0">
                    <Td className="pl-5">
                      <div className="flex items-center gap-2.5">
                        <span className="w-11 shrink-0 text-ink">{row.key}</span>
                        {/* Scaled against the largest row, so the column reads
                            as a chart without needing an axis. */}
                        <span
                          aria-hidden
                          className="h-1.5 rounded-full"
                          style={{
                            width:
                              largest === 0 || value <= 0
                                ? 0
                                : Math.max((value / largest) * BAR_TRACK, 2),
                            background: BAR,
                          }}
                        />
                      </div>
                    </Td>
                    <Td align="right" className="tabular-nums text-muted">
                      {formatInteger(row.orders)}
                    </Td>
                    <Td align="right" className="tabular-nums text-ink">
                      {formatCurrency(value)}
                    </Td>
                    <Td align="right" className="tabular-nums text-muted">
                      {formatCurrency(perOrder)}
                    </Td>
                    <Td align="right" className="pr-5 tabular-nums text-muted">
                      {formatPercent(ratio)}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Th({
  children,
  align = 'left',
  className = '',
}: {
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-label ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align = 'left',
  className = '',
}: {
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  return (
    <td
      className={`h-10 px-3 align-middle ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </td>
  )
}
