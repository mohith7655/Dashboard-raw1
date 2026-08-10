import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Plus,
  Target as TargetIcon,
  Trash2,
  XCircle,
} from 'lucide-react'
import type { BlendedAds } from '../../lib/pnl'
import type {
  DateRange,
  MerchantFeed,
  Target,
  TargetGoal,
  TargetHorizon,
  TargetNote,
  TargetPlan,
  WooMetrics,
} from '../../lib/types'
import { planTarget } from '../../lib/targets'
import { formatCurrency, formatPercent, formatRoas } from '../../lib/format'
import { SectionLabel } from '../SectionLabel'
import { Skeleton } from '../Skeleton'

interface TargetsSectionProps {
  targets: Target[] | undefined
  loading: boolean
  error: string | null
  saving: boolean
  onSave: (targets: Target[]) => void
  woo: WooMetrics | undefined
  blended: BlendedAds | null
  feed: MerchantFeed | undefined
  range: DateRange
}

const TONE: Record<
  TargetNote['tone'],
  { icon: typeof AlertTriangle; className: string }
> = {
  good: { icon: CheckCircle2, className: 'text-pos' },
  warn: { icon: AlertTriangle, className: 'text-amber-400' },
  bad: { icon: XCircle, className: 'text-neg' },
}

const HORIZON_LABEL: Record<TargetHorizon, string> = {
  monthly: 'a month',
  quarterly: 'a quarter',
}

const newTarget = (): Target => ({
  // Date-based rather than random: the list is tiny, single-writer, and an id
  // that sorts by creation is easier to read in the stored blob.
  id: `t${Date.now().toString(36)}`,
  name: 'New target',
  goal: 'sales',
  amount: 0,
  budget: 0,
  horizon: 'monthly',
})

/**
 * What it would take to hit a number, worked out from the period on screen.
 *
 * Sits under the Overview because it is the one section that reads forward. The
 * cards above report what happened; this divides a goal by what the store is
 * actually achieving and says what the budget would have to be — and, where the
 * figures already show it, what is stopping the money working.
 *
 * Every figure is derived on the client from metrics the Overview has already
 * fetched. Nothing is computed twice and nothing is stored but the goal itself,
 * so the plan cannot drift from the cards it is reasoning about.
 */
export function TargetsSection({
  targets,
  loading,
  error,
  saving,
  onSave,
  woo,
  blended,
  feed,
  range,
}: TargetsSectionProps) {
  const [editing, setEditing] = useState<Target | null>(null)

  const plans = useMemo(
    (): TargetPlan[] =>
      (targets ?? []).map((target) => planTarget({ target, woo, blended, range, feed })),
    [targets, woo, blended, range, feed],
  )

  const commit = (next: Target[]) => {
    onSave(next)
    setEditing(null)
  }

  const upsert = (target: Target) => {
    const list = targets ?? []
    const found = list.some((t) => t.id === target.id)
    commit(found ? list.map((t) => (t.id === target.id ? target : t)) : [...list, target])
  }

  const remove = (id: string) => commit((targets ?? []).filter((t) => t.id !== id))

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionLabel>Targets</SectionLabel>
        <button
          type="button"
          onClick={() => setEditing(newTarget())}
          disabled={saving}
          className="flex h-9 items-center gap-2 rounded-lg border border-btn-border bg-btn px-3 text-[13px] text-ink transition-colors hover:border-[#3a3a40] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin text-muted" />
          ) : (
            <Plus size={14} className="text-muted" />
          )}
          Add target
        </button>
      </div>

      {error && <p className="text-[12px] leading-relaxed text-neg">{error}</p>}

      {editing && (
        <TargetEditor
          target={editing}
          saving={saving}
          onCancel={() => setEditing(null)}
          onSave={upsert}
        />
      )}

      {loading ? (
        <div className="card">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-3/5" />
        </div>
      ) : plans.length === 0 && !editing ? (
        <p className="card text-[12px] leading-relaxed text-muted">
          No target set. Add one to see the budget it needs at the return the
          store is currently achieving, split by day, week and month.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {plans.map((plan) => (
            <PlanCard
              key={plan.target.id}
              plan={plan}
              disabled={saving}
              onEdit={() => setEditing(plan.target)}
              onRemove={() => remove(plan.target.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function PlanCard({
  plan,
  disabled,
  onEdit,
  onRemove,
}: {
  plan: TargetPlan
  disabled: boolean
  onEdit: () => void
  onRemove: () => void
}) {
  const { target } = plan
  const goalLabel =
    target.goal === 'sales'
      ? `${formatCurrency(target.amount)} of sales ${HORIZON_LABEL[target.horizon]}`
      : `${formatRoas(target.amount)} return ${HORIZON_LABEL[target.horizon]}`

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-icon-btn text-muted">
              <TargetIcon size={14} strokeWidth={2} />
            </span>
            <h3 className="truncate text-[14px] font-medium text-ink">{target.name}</h3>
          </div>
          <p className="mt-1 text-[12px] text-muted">
            {goalLabel} on {formatCurrency(target.budget)} of ad budget
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            disabled={disabled}
            className="h-8 rounded-lg border border-btn-border bg-btn px-2.5 text-[12px] text-muted transition-colors hover:border-[#3a3a40] hover:text-ink disabled:opacity-50"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Remove ${target.name}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-btn-border bg-btn text-muted transition-colors hover:border-[#3a3a40] hover:text-neg disabled:opacity-50"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* The budget split, which is the question most often asked of a target:
          not what it totals but what it means to spend tomorrow. */}
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-row-line pt-3">
        <Figure label="Per day" value={formatCurrency(plan.perDay)} />
        <Figure label="Per week" value={formatCurrency(plan.perWeek)} />
        <Figure label="Per month" value={formatCurrency(plan.perMonth)} />
        <Figure
          label="Spending now"
          value={plan.pacingPerDay === null ? '—' : `${formatCurrency(plan.pacingPerDay)} / day`}
        />
        {plan.impliedBudget !== null && (
          <Figure label="Budget needed" value={formatCurrency(plan.impliedBudget)} />
        )}
        {plan.attainment !== null && (
          <Figure
            label="On target"
            value={formatPercent(plan.attainment)}
            className={plan.attainment >= 1 ? 'text-pos' : 'text-neg'}
          />
        )}
      </div>

      {plan.notes.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2.5 border-t border-row-line pt-3">
          {plan.notes.map((note, i) => {
            const { icon: Icon, className } = TONE[note.tone]
            return (
              <li key={i} className="flex gap-2">
                <Icon size={14} className={`mt-0.5 shrink-0 ${className}`} />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink">{note.title}</p>
                  <p className="mt-0.5 max-w-prose text-[12px] leading-relaxed text-muted">
                    {note.detail}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Figure({
  label,
  value,
  className = 'text-ink',
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] uppercase tracking-wide text-label">{label}</div>
      <div className={`mt-0.5 text-[13.5px] font-semibold tabular-nums ${className}`}>
        {value}
      </div>
    </div>
  )
}

/**
 * Held in local state until saved, so a half-typed figure never reaches the
 * store — and never briefly redraws every plan on the page as it is typed.
 */
function TargetEditor({
  target,
  saving,
  onCancel,
  onSave,
}: {
  target: Target
  saving: boolean
  onCancel: () => void
  onSave: (target: Target) => void
}) {
  const [draft, setDraft] = useState<Target>(target)
  const set = <K extends keyof Target>(key: K, value: Target[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const amountLabel = draft.goal === 'sales' ? 'Sales target' : 'Return target (x)'

  return (
    <form
      className="card flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        onSave({ ...draft, name: draft.name.trim() || 'Untitled target' })
      }}
    >
      <div className="flex flex-wrap gap-3">
        <Field label="Name" className="min-w-[12rem] flex-1">
          <input
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            maxLength={80}
            className="input-base"
          />
        </Field>

        <Field label="Goal">
          <select
            value={draft.goal}
            onChange={(e) => set('goal', e.target.value as TargetGoal)}
            className="input-base"
          >
            <option value="sales">Sales</option>
            <option value="roas">Return on ad spend</option>
          </select>
        </Field>

        <Field label={amountLabel}>
          <input
            type="number"
            min={0}
            step={draft.goal === 'sales' ? 100 : 0.1}
            value={draft.amount || ''}
            onChange={(e) => set('amount', Math.max(0, Number(e.target.value) || 0))}
            className="input-base tabular-nums"
          />
        </Field>

        <Field label="Ad budget">
          <input
            type="number"
            min={0}
            step={100}
            value={draft.budget || ''}
            onChange={(e) => set('budget', Math.max(0, Number(e.target.value) || 0))}
            className="input-base tabular-nums"
          />
        </Field>

        <Field label="Over">
          <select
            value={draft.horizon}
            onChange={(e) => set('horizon', e.target.value as TargetHorizon)}
            className="input-base"
          >
            <option value="monthly">A month</option>
            <option value="quarterly">A quarter</option>
          </select>
        </Field>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex h-9 items-center gap-2 rounded-lg border border-btn-border bg-btn px-3 text-[13px] text-ink transition-colors hover:border-[#3a3a40] disabled:opacity-50"
        >
          {saving && <Loader2 size={14} className="animate-spin text-muted" />}
          Save target
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-lg px-3 text-[13px] text-muted transition-colors hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function Field({
  label,
  className = '',
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[10.5px] uppercase tracking-wide text-label">{label}</span>
      {children}
    </label>
  )
}
