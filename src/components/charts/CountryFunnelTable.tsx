import type { ReactNode } from 'react'
import type { CountryRow } from '../../lib/marketTraffic'
import { formatCurrency, formatInteger, formatPercent } from '../../lib/format'
import { Skeleton } from '../Skeleton'

/** One series, so one recessive tone — the row label carries the identity. */
const BAR = '#a1a1aa'

/** Pixel width of a full-length share bar. */
const BAR_TRACK = 72

/** Past this the card scrolls rather than pushing the page down. */
const MAX_BODY = 'max-h-[520px]'

interface CountryFunnelTableProps {
  rows: CountryRow[]
  /** False where GA4 has no country data, so the visitor columns are dropped. */
  withVisitors: boolean
  loading?: boolean
  unavailable?: string
}

/**
 * Visitors, orders and revenue for every country either half of the dashboard
 * knows about.
 *
 * The full list rather than a top-N, for the same reason the market split is:
 * the interesting row is usually the country sending traffic that never buys,
 * and that is precisely the row a cut-off would remove.
 */
export function CountryFunnelTable({
  rows,
  withVisitors,
  loading,
  unavailable,
}: CountryFunnelTableProps) {
  const largest = rows.length > 0 ? Math.max(...rows.map((row) => row.revenue)) : 0
  const totalOrders = rows.reduce((sum, row) => sum + row.orders, 0)
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0)
  const totalVisitors = rows.reduce((sum, row) => sum + (row.visitors ?? 0), 0)

  const subtitle = withVisitors
    ? 'Every country that sent a visitor or placed an order, ranked by revenue'
    : 'Ranked by revenue. Connect GA4 to see the visitors behind these orders'

  return (
    <div className="card p-0">
      <div className="px-5 pb-4 pt-5">
        <h3 className="text-[15px] font-semibold text-ink">Countries</h3>
        <p className="mt-0.5 text-[12px] text-muted">
          {subtitle}
          {!loading && !unavailable && rows.length > 0 && (
            <> · {formatInteger(rows.length)} in this period</>
          )}
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3 px-5 pb-5">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      ) : unavailable ? (
        <div className="px-5 pb-6 text-[13px] text-muted">{unavailable}</div>
      ) : rows.length === 0 ? (
        <div className="px-5 pb-6 text-[13px] text-muted">
          Nothing to show for this period.
        </div>
      ) : (
        <div className={`${MAX_BODY} overflow-y-auto overflow-x-auto`}>
          <table
            className={`w-full border-collapse text-[13px] ${
              withVisitors ? 'min-w-[720px]' : 'min-w-[520px]'
            }`}
          >
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-line text-left">
                <Th className="pl-5">Country</Th>
                {withVisitors && <Th align="right">Visitors</Th>}
                <Th align="right">Orders</Th>
                {withVisitors && <Th align="right">Conv.</Th>}
                <Th align="right">Revenue</Th>
                {withVisitors && <Th align="right">Per visitor</Th>}
                <Th align="right" className="pr-5">
                  Share
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.code || row.name}
                  className="border-b border-row-line last:border-0"
                >
                  <Td className="pl-5">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-11 shrink-0 truncate text-ink"
                        title={row.name}
                      >
                        {row.code || row.name}
                      </span>
                      {/* Scaled against the largest row, so the column reads
                          as a chart without needing an axis. */}
                      <span
                        aria-hidden
                        className="h-1.5 rounded-full"
                        style={{
                          width:
                            largest === 0 || row.revenue <= 0
                              ? 0
                              : Math.max((row.revenue / largest) * BAR_TRACK, 2),
                          background: BAR,
                        }}
                      />
                    </div>
                  </Td>

                  {withVisitors && (
                    <Td align="right" className="tabular-nums text-muted">
                      {/* An em dash, not a zero: GA4 reporting nothing for a
                          country is not the same as nobody visiting it. */}
                      {row.visitors === null ? '—' : formatInteger(row.visitors)}
                    </Td>
                  )}

                  <Td align="right" className="tabular-nums text-muted">
                    {formatInteger(row.orders)}
                  </Td>

                  {withVisitors && (
                    <Td
                      align="right"
                      className={`tabular-nums ${
                        row.orders === 0 && (row.visitors ?? 0) > 0
                          ? 'text-neg'
                          : 'text-muted'
                      }`}
                    >
                      {row.conversion === null ? '—' : formatPercent(row.conversion)}
                    </Td>
                  )}

                  <Td align="right" className="tabular-nums text-ink">
                    {formatCurrency(row.revenue)}
                  </Td>

                  {withVisitors && (
                    <Td align="right" className="tabular-nums text-muted">
                      {row.revenuePerVisitor === null
                        ? '—'
                        : formatCurrency(row.revenuePerVisitor)}
                    </Td>
                  )}

                  <Td align="right" className="pr-5 tabular-nums text-muted">
                    {formatPercent(row.share)}
                  </Td>
                </tr>
              ))}
            </tbody>

            {/* Totals stay pinned to the bottom: on a long list the reader
                needs the base the share column is a share of. */}
            <tfoot className="sticky bottom-0 bg-card">
              <tr className="border-t border-line">
                <Td className="pl-5 text-[12px] font-medium text-ink">Total</Td>
                {withVisitors && (
                  <Td align="right" className="tabular-nums text-ink">
                    {formatInteger(totalVisitors)}
                  </Td>
                )}
                <Td align="right" className="tabular-nums text-ink">
                  {formatInteger(totalOrders)}
                </Td>
                {withVisitors && (
                  <Td align="right" className="tabular-nums text-muted">
                    {totalVisitors === 0
                      ? '—'
                      : formatPercent(totalOrders / totalVisitors)}
                  </Td>
                )}
                <Td align="right" className="tabular-nums text-ink">
                  {formatCurrency(totalRevenue)}
                </Td>
                {withVisitors && (
                  <Td align="right" className="tabular-nums text-muted">
                    {totalVisitors === 0
                      ? '—'
                      : formatCurrency(totalRevenue / totalVisitors)}
                  </Td>
                )}
                <Td align="right" className="pr-5 tabular-nums text-muted">
                  {formatPercent(1)}
                </Td>
              </tr>
            </tfoot>
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
