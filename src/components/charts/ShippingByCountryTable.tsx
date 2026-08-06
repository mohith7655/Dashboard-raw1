import type { ReactNode } from 'react'
import type { CountryShipping } from '../../lib/shippingPnl'
import { countryName } from '../../lib/countries'
import { formatCurrency, formatInteger, formatPercent } from '../../lib/format'
import { Skeleton } from '../Skeleton'

/** Past this the card scrolls rather than pushing the page down. */
const MAX_BODY = 'max-h-[520px]'

interface ShippingByCountryTableProps {
  rows: CountryShipping[]
  /** Postage from destinations beyond the per-country cap, or zero. */
  unlisted: number
  loading?: boolean
  unavailable?: string
}

/**
 * Every destination, worst first.
 *
 * Ranked by what shipping there made or lost rather than by size, because the
 * question this table answers is which rates need changing — and a small
 * country losing on every parcel is exactly the row that sorting by revenue
 * would bury.
 */
export function ShippingByCountryTable({
  rows,
  unlisted,
  loading,
  unavailable,
}: ShippingByCountryTableProps) {
  const charged = rows.reduce((sum, row) => sum + row.charged, 0)
  const paid = rows.reduce((sum, row) => sum + row.paid, 0)
  const orders = rows.reduce((sum, row) => sum + row.orders, 0)
  const net = charged - paid
  const losing = rows.filter((row) => row.net < 0)

  return (
    <div className="card p-0">
      <div className="px-5 pb-4 pt-5">
        <h3 className="text-[15px] font-semibold text-ink">
          Shipping by country
        </h3>
        <p className="mt-0.5 text-[12px] text-muted">
          What each destination paid for postage against what it cost to send —
          worst first
          {!loading && !unavailable && losing.length > 0 && (
            <>
              {' · '}
              <span className="text-neg">
                {formatInteger(losing.length)}{' '}
                {losing.length === 1 ? 'destination loses' : 'destinations lose'} money
              </span>
            </>
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
          Nothing shipped in this period.
        </div>
      ) : (
        <>
          <div className={`${MAX_BODY} overflow-y-auto overflow-x-auto`}>
            <table className="w-full min-w-[680px] border-collapse text-[13px]">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-line text-left">
                  <Th className="pl-5">Country</Th>
                  <Th align="right">Orders</Th>
                  <Th align="right">Collected</Th>
                  <Th align="right">Paid</Th>
                  <Th align="right">Net</Th>
                  <Th align="right" className="pr-5">
                    Covered
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.country} className="border-b border-row-line last:border-0">
                    <Td className="pl-5">
                      <div className="flex items-center gap-2.5">
                        <span className="w-9 shrink-0 text-ink" title={countryName(row.country)}>
                          {row.country === '(unknown)' ? '??' : row.country}
                        </span>
                        <span className="truncate text-[12px] text-muted">
                          {countryName(row.country)}
                        </span>
                      </div>
                    </Td>
                    <Td align="right" className="tabular-nums text-muted">
                      {formatInteger(row.orders)}
                    </Td>
                    <Td align="right" className="tabular-nums text-muted">
                      {formatCurrency(row.charged)}
                      {row.orders > 0 && (
                        <span className="block text-[11px] text-label">
                          {formatCurrency(row.chargedPerOrder)}/order
                        </span>
                      )}
                    </Td>
                    <Td align="right" className="tabular-nums text-muted">
                      {formatCurrency(row.paid)}
                      {row.orders > 0 && (
                        <span className="block text-[11px] text-label">
                          {formatCurrency(row.paidPerOrder)}/order
                        </span>
                      )}
                    </Td>
                    <Td
                      align="right"
                      className={`tabular-nums ${row.net < 0 ? 'text-neg' : 'text-pos'}`}
                    >
                      {row.net < 0 ? '−' : '+'}
                      {formatCurrency(Math.abs(row.net))}
                    </Td>
                    <Td align="right" className="pr-5 tabular-nums text-muted">
                      {/* How much of this destination's postage bill the
                          customers covered. An em dash where nothing was
                          spent — there was no bill to cover. */}
                      {row.recovery === null ? '—' : formatPercent(row.recovery)}
                    </Td>
                  </tr>
                ))}
              </tbody>

              <tfoot className="sticky bottom-0 bg-card">
                <tr className="border-t border-line">
                  <Td className="pl-5 text-[12px] font-medium text-ink">Total</Td>
                  <Td align="right" className="tabular-nums text-ink">
                    {formatInteger(orders)}
                  </Td>
                  <Td align="right" className="tabular-nums text-ink">
                    {formatCurrency(charged)}
                  </Td>
                  <Td align="right" className="tabular-nums text-ink">
                    {formatCurrency(paid)}
                  </Td>
                  <Td
                    align="right"
                    className={`tabular-nums ${net < 0 ? 'text-neg' : 'text-pos'}`}
                  >
                    {net < 0 ? '−' : '+'}
                    {formatCurrency(Math.abs(net))}
                  </Td>
                  <Td align="right" className="pr-5 tabular-nums text-muted">
                    {paid === 0 ? '—' : formatPercent(charged / paid)}
                  </Td>
                </tr>
              </tfoot>
            </table>
          </div>

          {unlisted > 0 && (
            <p className="px-5 pb-4 pt-3 text-[12px] text-muted">
              A further {formatCurrency(unlisted)} of postage came from
              destinations beyond the ones listed — the split is read one country
              at a time, so the longest tail is left off rather than making a
              request for each.
            </p>
          )}
        </>
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
      className={`h-11 px-3 align-middle ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </td>
  )
}
