import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type {
  CountryShippingCost,
  MarketRevenue,
  ShippingCostBasis,
} from '../../lib/types'
import { SHIPPING_COST_BASES } from '../../lib/types'
import {
  newShippingCostId,
  shippingCostLines,
  totalShippingCost,
} from '../../lib/shippingCosts'
import { countryOptions } from '../../lib/countries'
import { formatCurrency, formatInteger } from '../../lib/format'
import { Skeleton } from '../Skeleton'

interface ShippingCostsCardProps {
  costs: CountryShippingCost[] | undefined
  /** The period's country split, for the order counts a per-order charge needs. */
  markets: MarketRevenue[]
  loading: boolean
  /** Message from the load or the last save; either one blocks trusting the list. */
  error: string | null
  saving: boolean
  onSave: (costs: CountryShippingCost[]) => void
}

const BASIS_LABELS: Record<ShippingCostBasis, string> = {
  'per-order': 'Per order',
  flat: 'Flat for period',
}

const INPUT =
  'h-8 w-full rounded-md border border-btn-border bg-btn px-2 text-[13px] text-ink outline-none transition-colors focus:border-[#3d3d44]'

/**
 * Shipping charges the orders do not carry — customs, courier surcharges, a
 * per-region 3PL fee.
 *
 * Edits are held locally and sent as a whole list on Save, as the operating
 * costs are, so a half-typed figure never reaches the store and the tables
 * above do not redraw on every keystroke.
 */
export function ShippingCostsCard({
  costs,
  markets,
  loading,
  error,
  saving,
  onSave,
}: ShippingCostsCardProps) {
  const [draft, setDraft] = useState<CountryShippingCost[]>([])

  // Reseed whenever the stored list changes identity — the initial load, and
  // again with whatever the server echoed back after a save.
  useEffect(() => {
    if (costs) setDraft(costs)
  }, [costs])

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(costs ?? []),
    [draft, costs],
  )

  // Previewed against the live draft, so the range column answers "what does
  // this cost me over this period?" while you are still typing.
  const lines = useMemo(() => shippingCostLines(draft, markets), [draft, markets])
  const total = totalShippingCost(lines)

  // Every country, with the ones this period actually shipped to hoisted to
  // the top — a list of 250 is unusable if the seven that matter are buried.
  const options = useMemo(
    () => countryOptions(markets.map((row) => row.key)),
    [markets],
  )

  const update = (id: string, patch: Partial<CountryShippingCost>) =>
    setDraft((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))

  const add = () =>
    setDraft((rows) => [
      ...rows,
      {
        id: newShippingCostId(),
        // Opens on the busiest destination, which is the one most likely to be
        // getting a surcharge entered for it.
        country: markets[0]?.key ?? 'US',
        label: '',
        amount: 0,
        basis: 'per-order',
      },
    ])

  const remove = (id: string) =>
    setDraft((rows) => rows.filter((row) => row.id !== id))

  return (
    <div className="card p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink">Extra shipping costs</h3>
        </div>
        <button
          type="button"
          onClick={add}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-btn-border bg-btn px-3 text-[12px] text-ink transition-colors hover:border-[#3d3d44]"
        >
          <Plus size={13} />
          Add cost
        </button>
      </div>

      {error && (
        <p className="mx-5 mb-3 rounded-lg border border-[#4a2626] bg-[#1e1414] px-3 py-2 text-[12px] text-neg">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex flex-col gap-3 px-5 pb-5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left">
                <Th className="pl-5">Country</Th>
                <Th>What it is</Th>
                <Th>Basis</Th>
                <Th align="right">Amount</Th>
                <Th align="right">Orders</Th>
                <Th align="right">In this range</Th>
                <Th className="w-10 pr-5" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-b border-row-line last:border-0">
                  <td className="h-12 pl-5 pr-3 align-middle">
                    <select
                      aria-label="Country"
                      value={line.country}
                      onChange={(e) => update(line.id, { country: e.target.value })}
                      className={`${INPUT} w-[13rem]`}
                    >
                      {/* A stored country the list does not know still has to be
                          selectable, or editing another field would silently
                          move the row to whatever the select fell back to. */}
                      {!options.some((o) => o.code === line.country) && (
                        <option value={line.country}>{line.country}</option>
                      )}
                      {options.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="h-12 px-3 align-middle">
                    <input
                      aria-label="What it is"
                      value={line.label}
                      placeholder="e.g. Customs clearance"
                      onChange={(e) => update(line.id, { label: e.target.value })}
                      className={INPUT}
                    />
                  </td>
                  <td className="h-12 px-3 align-middle">
                    <select
                      aria-label="Basis"
                      value={line.basis}
                      onChange={(e) =>
                        update(line.id, { basis: e.target.value as ShippingCostBasis })
                      }
                      className={`${INPUT} w-36`}
                    >
                      {SHIPPING_COST_BASES.map((basis) => (
                        <option key={basis} value={basis}>
                          {BASIS_LABELS[basis]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="h-12 px-3 align-middle">
                    <input
                      aria-label="Amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.amount === 0 ? '' : line.amount}
                      placeholder="0.00"
                      onChange={(e) =>
                        update(line.id, { amount: Math.max(0, Number(e.target.value)) })
                      }
                      className={`${INPUT} w-28 text-right tabular-nums`}
                    />
                  </td>
                  <td className="h-12 px-3 text-right align-middle tabular-nums text-muted">
                    {line.basis === 'per-order' ? formatInteger(line.orders) : '—'}
                  </td>
                  <td className="h-12 px-3 text-right align-middle tabular-nums text-ink">
                    {formatCurrency(line.applied)}
                  </td>
                  <td className="h-12 pl-3 pr-5 align-middle">
                    <button
                      type="button"
                      aria-label={`Remove ${line.label || line.country} cost`}
                      onClick={() => remove(line.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-btn-border bg-btn text-muted transition-colors hover:text-neg"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}

              {draft.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted">
                    No extra shipping costs yet. Add customs or a courier
                    surcharge to see it against the country below.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5 text-[12px]">
        <span className="text-muted">
          Total for this range{' '}
          <span className="ml-1 tabular-nums text-ink">{formatCurrency(total)}</span>
        </span>
        <div className="flex items-center gap-3">
          {dirty && !saving && <span className="text-muted">Unsaved changes</span>}
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => onSave(draft)}
            className="h-8 rounded-lg border border-btn-border bg-btn px-3 text-[12px] text-ink transition-colors hover:border-[#3d3d44] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Th({
  children,
  align = 'left',
  className = '',
}: {
  children?: React.ReactNode
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
