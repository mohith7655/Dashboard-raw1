import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type {
  CostCadence,
  CostCategory,
  DateRange,
  OperatingCost,
} from '../../lib/types'
import { COST_CADENCES, COST_CATEGORIES } from '../../lib/types'
import {
  costLines,
  newCostId,
  totalOperatingCost,
} from '../../lib/operatingCosts'
import { formatCurrency } from '../../lib/format'
import { Skeleton } from '../Skeleton'

interface OperatingCostsCardProps {
  costs: OperatingCost[] | undefined
  range: DateRange
  loading: boolean
  /** Message from the load or the last save; either one blocks trusting the list. */
  error: string | null
  saving: boolean
  onSave: (costs: OperatingCost[]) => void
}

const CADENCE_LABELS: Record<CostCadence, string> = {
  once: 'One-off',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

const INPUT =
  'h-8 w-full rounded-md border border-btn-border bg-btn px-2 text-[13px] text-ink outline-none transition-colors focus:border-[#3d3d44]'

/**
 * The one place in the dashboard that writes rather than reads. Edits are held
 * locally and sent as a whole list on Save, so a half-typed salary never
 * reaches the store and the P&L never redraws on every keystroke.
 */
export function OperatingCostsCard({
  costs,
  range,
  loading,
  error,
  saving,
  onSave,
}: OperatingCostsCardProps) {
  const [draft, setDraft] = useState<OperatingCost[]>([])

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
  const lines = useMemo(() => costLines(draft, range), [draft, range])
  const total = totalOperatingCost(lines)

  const update = (id: string, patch: Partial<OperatingCost>) =>
    setDraft((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    )

  const add = () =>
    setDraft((rows) => [
      ...rows,
      {
        id: newCostId(),
        name: '',
        category: 'Software',
        amount: 0,
        cadence: 'monthly',
      },
    ])

  const remove = (id: string) =>
    setDraft((rows) => rows.filter((row) => row.id !== id))

  // A nameless row is the blank one just added; saving it would store a ghost.
  const saveable = draft.filter((row) => row.name.trim().length > 0)

  return (
    <div className="card p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink">Operating costs</h3>
          <p className="mt-0.5 text-[12px] text-muted">
            Costs the store never sees — payroll, software, rent. Recurring costs
            are prorated onto the selected range, so a full calendar month shows
            exactly one month&apos;s charge.
          </p>
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
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left">
                <Th className="pl-5">Cost</Th>
                <Th>Category</Th>
                <Th>Cadence</Th>
                <Th align="right">Amount</Th>
                <Th align="right">In this range</Th>
                <Th className="w-10 pr-5" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-b border-row-line last:border-0">
                  <td className="h-12 pl-5 pr-3 align-middle">
                    <input
                      aria-label="Cost name"
                      value={line.name}
                      placeholder="e.g. Warehouse salaries"
                      onChange={(e) => update(line.id, { name: e.target.value })}
                      className={INPUT}
                    />
                  </td>
                  <td className="h-12 px-3 align-middle">
                    <select
                      aria-label="Category"
                      value={line.category}
                      onChange={(e) =>
                        update(line.id, { category: e.target.value as CostCategory })
                      }
                      className={INPUT}
                    >
                      {COST_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="h-12 px-3 align-middle">
                    <div className="flex items-center gap-2">
                      <select
                        aria-label="Cadence"
                        value={line.cadence}
                        onChange={(e) =>
                          update(line.id, {
                            cadence: e.target.value as CostCadence,
                            // A one-off needs a date; default it to the range end
                            // so the row counts immediately instead of reading zero.
                            date:
                              e.target.value === 'once'
                                ? (line.date ?? range.end)
                                : undefined,
                          })
                        }
                        className={INPUT}
                      >
                        {COST_CADENCES.map((c) => (
                          <option key={c} value={c}>
                            {CADENCE_LABELS[c]}
                          </option>
                        ))}
                      </select>
                      {line.cadence === 'once' && (
                        <input
                          type="date"
                          aria-label="Charge date"
                          value={line.date ?? ''}
                          onChange={(e) => update(line.id, { date: e.target.value })}
                          className={INPUT}
                        />
                      )}
                    </div>
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
                      className={`${INPUT} text-right tabular-nums`}
                    />
                  </td>
                  <td className="h-12 px-3 text-right align-middle tabular-nums text-ink">
                    {formatCurrency(line.applied)}
                  </td>
                  <td className="h-12 pl-3 pr-5 align-middle">
                    <button
                      type="button"
                      aria-label={`Remove ${line.name || 'cost'}`}
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
                  <td colSpan={6} className="px-5 py-10 text-center text-muted">
                    No operating costs yet. Add salaries, subscriptions or rent to
                    see them in the statement above.
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
            onClick={() => onSave(saveable)}
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
