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
  chargeLabel,
  costLines,
  hasImpossibleWindow,
  newCostId,
  totalOperatingCost,
} from '../../lib/operatingCosts'
import { formatCurrency } from '../../lib/format'
import { DatePicker } from '../DatePicker'
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
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

const INPUT =
  'h-8 w-full rounded-md border border-btn-border bg-btn px-2 text-[13px] text-ink outline-none transition-colors focus:border-[#3d3d44]'

/**
 * The single date a row starts on.
 *
 * Underneath, a recurring cost still carries two: `date`, the day of the week
 * or month each charge lands on, and `startDate`, the day it began applying.
 * They only ever differ in rows written before the two were asked for together
 * — a cost that started on the 5th bills on the 5th — so the field shows one
 * and writes both. The order here matches the one the charge itself resolves
 * by, so the date on screen is always the date being charged on.
 */
const startOf = (cost: OperatingCost): string | undefined =>
  cost.date ?? cost.startDate

/** Writes that one date back to whichever fields the cadence uses. */
const startPatch = (
  cost: OperatingCost,
  next: string | undefined,
): Partial<OperatingCost> =>
  cost.cadence === 'once'
    ? { date: next }
    : { date: next, startDate: next }

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

  // An end before its start can never match, and would otherwise read as an
  // ordinary $0.00 row — indistinguishable from a cost that simply did not run.
  const inverted = draft.filter(hasImpossibleWindow)

  return (
    <div className="card p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink">Operating costs</h3>
          <p className="mt-0.5 max-w-prose text-[12px] text-muted">
            Costs the store never sees — payroll, software, rent. A recurring
            cost asks when it{' '}
            <span className="text-ink">started</span> — that date sets both when
            it began and which day it lands on, so a subscription taken out on
            the 5th charges the 5th of every month — and when it{' '}
            <span className="text-ink">ended</span>, blank while it still runs. A
            one-off asks only for the day it was charged.
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
          <table className="w-full min-w-[1100px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left">
                <Th className="pl-5">Cost</Th>
                <Th>Category</Th>
                <Th>Cadence</Th>
                <Th>Starts</Th>
                <Th>Ends</Th>
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
                    <select
                      aria-label="Cadence"
                      value={line.cadence}
                      onChange={(e) => {
                        const cadence = e.target.value as CostCadence
                        const start = startOf(line)
                        update(line.id, {
                          cadence,
                          // A one-off must have a date; default it to the range
                          // end so the row counts immediately rather than
                          // reading zero. Either way the day already chosen
                          // carries over — it means the same thing on both
                          // sides of the switch.
                          date: cadence === 'once' ? (start ?? range.end) : start,
                          // An end date has no meaning against a single dated
                          // charge, so it is dropped rather than left dormant.
                          startDate: cadence === 'once' ? undefined : start,
                          endDate: cadence === 'once' ? undefined : line.endDate,
                        })
                      }}
                      className={`${INPUT} w-28`}
                    >
                      {COST_CADENCES.map((c) => (
                        <option key={c} value={c}>
                          {CADENCE_LABELS[c]}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="h-12 px-3 align-middle">
                    <div className="flex items-center gap-2">
                      <DatePicker
                        label={
                          line.cadence === 'once'
                            ? `Charge date, ${line.name || 'cost'}`
                            : `Start date, ${line.name || 'cost'}`
                        }
                        title={
                          line.cadence === 'once'
                            ? 'The day this charge landed'
                            : 'When the cost began. It also sets which day each charge lands on. Leave it blank to spread the amount evenly across the period instead.'
                        }
                        value={startOf(line)}
                        placeholder={
                          line.cadence === 'once' ? 'Pick a date' : 'Prorate evenly'
                        }
                        // A one-off with no date has nowhere to land, so it
                        // keeps the one it was given; a recurring cost can go
                        // back to being spread evenly.
                        clearable={line.cadence !== 'once'}
                        onChange={(next) => update(line.id, startPatch(line, next))}
                        className="w-[148px]"
                      />
                      {line.cadence !== 'once' && (
                        <span className="whitespace-nowrap text-[12px] text-muted">
                          {chargeLabel(line)}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="h-12 px-3 align-middle">
                    {line.cadence === 'once' ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <DatePicker
                        label={`End date, ${line.name || 'cost'}`}
                        title="When the cost stopped. Leave it blank while it still runs."
                        value={line.endDate}
                        placeholder="Still running"
                        clearable
                        // Nothing before the start can end it, so those days are
                        // unpickable rather than merely warned about after.
                        min={startOf(line)}
                        onChange={(next) => update(line.id, { endDate: next })}
                        className="w-[148px]"
                      />
                    )}
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
                  <td colSpan={8} className="px-5 py-10 text-center text-muted">
                    No operating costs yet. Add salaries, subscriptions or rent to
                    see them in the statement above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {inverted.length > 0 && (
        <p className="mx-5 mb-3 text-[12px] text-neg">
          {inverted.map((row) => row.name || 'A cost').join(', ')}{' '}
          {inverted.length === 1 ? 'ends' : 'end'} before{' '}
          {inverted.length === 1 ? 'it starts' : 'they start'}, so{' '}
          {inverted.length === 1 ? 'it never applies' : 'they never apply'}.
        </p>
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
