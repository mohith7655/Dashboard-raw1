import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Plus,
  Sparkles,
  Target as TargetIcon,
  Trash2,
  XCircle,
} from 'lucide-react'
import type { BlendedAds } from '../../lib/pnl'
import type { TargetAdviser } from '../../lib/queries'
import type {
  AimPlan,
  DateRange,
  MerchantFeed,
  OperatingCost,
  Target,
  TargetGoal,
  TargetAdvice,
  TargetAim,
  TargetNote,
  TargetPlan,
  WooMetrics,
} from '../../lib/types'
import { TARGET_GOALS, TARGET_GOAL_LABELS, isMoneyGoal } from '../../lib/types'
import { planTarget } from '../../lib/targets'
import { useTargetProgress } from '../../lib/targetProgress'
import {
  formatCurrency,
  formatDay,
  formatList,
  formatPercent,
  formatRoas,
} from '../../lib/format'
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
  /**
   * The saved operating costs, prorated onto each target's own window rather
   * than onto the range — a net profit aim is measured over the window the
   * target names.
   */
  costs: OperatingCost[] | undefined
  feed: MerchantFeed | undefined
  range: DateRange
  /** Model-written advice, asked for one target at a time. */
  adviser: TargetAdviser
  /** The same aggregates the Insights tab sends, built on demand. */
  getSnapshot: () => Record<string, unknown>
}

const TONE: Record<
  TargetNote['tone'],
  { icon: typeof AlertTriangle; className: string }
> = {
  good: { icon: CheckCircle2, className: 'text-pos' },
  warn: { icon: AlertTriangle, className: 'text-amber-400' },
  bad: { icon: XCircle, className: 'text-neg' },
}

/** A month out: far enough to plan against, near enough to mean something. */
function defaultDeadline(): string {
  const date = new Date()
  date.setMonth(date.getMonth() + 1)
  return toIsoDate(date)
}

/** The local calendar day, not UTC — a deadline is read in the store's own days. */
function toIsoDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

const newTarget = (): Target => ({
  // Date-based rather than random: the list is tiny, single-writer, and an id
  // that sorts by creation is easier to read in the stored blob.
  id: `t${Date.now().toString(36)}`,
  name: 'New target',
  // Revenue alone to begin with. More aims are a click away, and a target that
  // opened with four of them would ask for four figures before it said
  // anything.
  aims: [{ goal: 'revenue', amount: 0 }],
  budgetPct: 0,
  // Today to a month out: the window a target set now is almost always for,
  // and both ends movable.
  start: toIsoDate(new Date()),
  deadline: defaultDeadline(),
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
  costs,
  feed,
  range,
  adviser,
  getSnapshot,
}: TargetsSectionProps) {
  const [editing, setEditing] = useState<Target | null>(null)

  // Fixed for the life of the mount rather than read per plan: every card must
  // count its days from the same day, and a render that straddled midnight
  // would otherwise date two targets differently.
  const today = useMemo(() => toIsoDate(new Date()), [])

  const progress = useTargetProgress(targets, costs, today)

  const plans = useMemo(
    (): TargetPlan[] =>
      (targets ?? []).map((target) =>
        planTarget({
          target,
          progress: progress.byTarget[target.id] ?? null,
          woo,
          blended,
          range,
          feed,
          today,
        }),
      ),
    [targets, progress, woo, blended, range, feed, today],
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
              advice={adviser.advice[plan.target.id]}
              advising={adviser.running === plan.target.id}
              adviceError={adviser.running === plan.target.id ? null : adviser.error}
              onAdvise={() => {
                // The plan travels with the target so the model explains the
                // figures already on the card rather than deriving its own.
                const { target: _t, notes: _n, ...rest } = plan
                adviser.ask(plan.target, rest, getSnapshot())
              }}
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
  advice,
  advising,
  adviceError,
  onAdvise,
}: {
  plan: TargetPlan
  disabled: boolean
  onEdit: () => void
  onRemove: () => void
  advice: TargetAdvice | undefined
  advising: boolean
  adviceError: string | null
  onAdvise: () => void
}) {
  const { target } = plan
  // Every aim on one line, in the plan's own order. "$50,000 of revenue and
  // $8,000 of net profit" is what was committed to; naming only the first
  // would make the blocks below look like arithmetic nobody asked for.
  const goalLabel = formatList(
    plan.aims.map((aim) =>
      aim.goal === 'roas'
        ? `${formatRoas(aim.amount)} return`
        : `${formatCurrency(aim.amount)} of ${TARGET_GOAL_LABELS[aim.goal].toLowerCase()}`,
    ),
  )

  // How far through the window it is, which is what the start date buys: on
  // its own a deadline says how long is left but never how long there was.
  const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`
  const due = plan.notStarted
    ? `not started · ${days(plan.windowDays)}`
    : plan.daysLeft === 0
      ? 'overdue'
      : `day ${plan.daysElapsed + 1} of ${plan.windowDays} · ${days(plan.daysLeft)} left`

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
            {goalLabel} from {formatDay(target.start)} to{' '}
            {formatDay(target.deadline)}{' '}
            <span className={plan.daysLeft === 0 ? 'text-neg' : 'text-label'}>
              ({due})
            </span>
            {target.budgetPct > 0
              ? ` · ad budget ${formatPercent(target.budgetPct / 100)} of sales`
              : ' · no budget set'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onAdvise}
            disabled={disabled || advising}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-btn-border bg-btn px-2.5 text-[12px] text-ink transition-colors hover:border-[#3a3a40] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {advising ? (
              <Loader2 size={13} className="animate-spin text-muted" />
            ) : (
              <Sparkles size={13} className="text-muted" />
            )}
            {advising ? 'Thinking…' : advice ? 'Re-advise' : 'Advise'}
          </button>
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
          not what it totals but what it means to spend tomorrow.

          Said outright when the split comes from the budget the goal implies
          rather than one that was entered — the same figures mean different
          things depending on who chose them. */}
      <div className="mt-3 border-t border-row-line pt-3">
        {/* Named as budget-in-full and budget-left, not one figure standing
            for both. The window has usually spent some of it already, and a
            daily rate struck from the whole would hand the same money out
            twice. */}
        <div className="text-[10.5px] uppercase tracking-wide text-label">
          {plan.basisIsImplied
            ? `To reach it — ${formatCurrency(plan.budgetBasis)} across the window, ${formatCurrency(plan.budgetRemaining)} left over ${plan.daysLeft} days`
            : `Your budget — ${formatCurrency(plan.budgetBasis)} across the window, ${formatCurrency(plan.budgetRemaining)} left over ${plan.daysLeft} days`}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
          {plan.progress && (
            <Figure label="Spent so far" value={formatCurrency(plan.progress.spend)} />
          )}
          <Figure label="Per day" value={formatCurrency(plan.perDay)} />
          <Figure label="Per week" value={formatCurrency(plan.perWeek)} />
          <Figure label="Per month" value={formatCurrency(plan.perMonth)} />
          <Figure
            label="Spending now"
            value={
              plan.pacingPerDay === null ? '—' : `${formatCurrency(plan.pacingPerDay)} / day`
            }
          />
          {/* Redundant beside the heading above when the split is already the
              implied budget; shown only where it is a second figure. */}
          {plan.impliedBudget !== null && !plan.basisIsImplied && (
            <Figure label="Budget needed" value={formatCurrency(plan.impliedBudget)} />
          )}
          {plan.attainment !== null && !plan.basisIsImplied && (
            <Figure
              label="On target"
              value={formatPercent(plan.attainment)}
              className={plan.attainment >= 1 ? 'text-pos' : 'text-neg'}
            />
          )}
        </div>
      </div>

      {/* One block per aim: the goal itself at the rate it has to be met, and
          the rate the store is actually running at against it. A figure by a
          date is not something anybody can trade against; a week's worth of it
          is. Kept apart rather than merged because revenue and profit are
          reached at different rates and are rarely both on pace. */}
      {plan.aims.map((aim) => (
        <AimBlock key={aim.goal} aim={aim} />
      ))}

      {adviceError && (
        <p className="mt-3 text-[12px] leading-relaxed text-neg">{adviceError}</p>
      )}

      {advice && (
        <div className="mt-3 border-t border-row-line pt-3">
          <p className="text-[13px] font-medium text-ink">{advice.headline}</p>
          <ul className="mt-2.5 flex flex-col gap-2.5">
            {advice.notes.map((note, i) => {
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
          {/* Named and dated, so advice written against a different period
              cannot pass for advice about this one. */}
          <p className="mt-2.5 text-[11px] text-label">
            Written by {advice.model} · {new Date(advice.generatedAt).toLocaleString()}.
            Check the figures it quotes before acting on them.
          </p>
        </div>
      )}

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

/**
 * One aim's own arithmetic.
 *
 * A money aim divides into a daily, weekly and monthly rate and is set against
 * what the store is on pace for. A return aim divides into nothing — a rate
 * does not accumulate — so it shows the return itself against the one asked
 * for, and no per-day figures that would be the same number three times.
 */
function AimBlock({ aim }: { aim: AimPlan }) {
  const name = TARGET_GOAL_LABELS[aim.goal]
  const reached = aim.paceAttainment !== null && aim.paceAttainment >= 1
  const pacing = reached ? 'text-pos' : 'text-neg'

  return (
    <div className="mt-3 border-t border-row-line pt-3">
      <div className="text-[10.5px] uppercase tracking-wide text-label">
        {aim.goal === 'roas'
          ? `Return of ${formatRoas(aim.amount)} to hold`
          : `${name} — ${formatCurrency(aim.amount)} by the deadline`}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
        {/* Banked first, then what is left, then the rate that finds it. The
            order the question is actually asked in: how far along am I, how
            much more, how fast. */}
        {aim.goal !== 'roas' && aim.achieved !== null && (
          <Figure label="Banked so far" value={formatCurrency(aim.achieved)} />
        )}
        {aim.remaining !== null && (
          <Figure
            label="Still to find"
            value={formatCurrency(aim.remaining)}
            className={aim.remaining === 0 ? 'text-pos' : 'text-ink'}
          />
        )}
        {aim.perDay !== null && (
          <Figure label="Per day" value={formatCurrency(aim.perDay)} />
        )}
        {aim.perWeek !== null && (
          <Figure label="Per week" value={formatCurrency(aim.perWeek)} />
        )}
        {aim.perMonth !== null && (
          <Figure label="Per month" value={formatCurrency(aim.perMonth)} />
        )}
        {/* What the store is doing now, in the same units as the rates beside
            it — so the gap is read across the row rather than worked out. */}
        {aim.runRate !== null && (
          <Figure
            label="Running at"
            value={
              aim.goal === 'roas'
                ? formatRoas(aim.runRate)
                : `${formatCurrency(aim.runRate)} / day`
            }
            className={aim.goal === 'roas' ? pacing : 'text-ink'}
          />
        )}
        {aim.goal !== 'roas' && aim.pace !== null && (
          <Figure
            label="On pace for"
            value={formatCurrency(aim.pace)}
            className={pacing}
          />
        )}
        {aim.paceAttainment !== null && (
          <Figure
            label="Pace vs goal"
            value={formatPercent(aim.paceAttainment)}
            className={pacing}
          />
        )}
      </div>
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

  const chosen = (goal: TargetGoal) => draft.aims.some((aim) => aim.goal === goal)

  /**
   * Adds or removes a goal, keeping the aims in the canonical order.
   *
   * The last one cannot be removed: a target with nothing to reach has no
   * arithmetic in it, and the store drops such a row on save — better to
   * refuse the click than to accept an edit that quietly disappears.
   */
  const toggle = (goal: TargetGoal) =>
    setDraft((d) => {
      const has = d.aims.some((aim) => aim.goal === goal)
      if (has && d.aims.length === 1) return d
      const aims: TargetAim[] = has
        ? d.aims.filter((aim) => aim.goal !== goal)
        : [...d.aims, { goal, amount: 0 }]
      return {
        ...d,
        aims: aims.sort(
          (a, b) => TARGET_GOALS.indexOf(a.goal) - TARGET_GOALS.indexOf(b.goal),
        ),
      }
    })

  const setAmount = (goal: TargetGoal, amount: number) =>
    setDraft((d) => ({
      ...d,
      aims: d.aims.map((aim) => (aim.goal === goal ? { ...aim, amount } : aim)),
    }))

  // What the percentage resolves to, against the aim the budget is struck
  // from. A share is easier to hold to and harder to picture; the money is
  // shown so the operator is never typing a number they cannot see the size of.
  const anchor = draft.aims.find((aim) => isMoneyGoal(aim.goal) && aim.amount > 0)
  const budgetPreview =
    anchor && draft.budgetPct > 0
      ? formatCurrency((anchor.amount * draft.budgetPct) / 100)
      : null

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

        <Field label="Ad budget (% of sales)">
          <input
            type="number"
            min={0}
            max={100}
            step="any"
            value={draft.budgetPct || ''}
            onChange={(e) =>
              set('budgetPct', clamp(Number(e.target.value) || 0, 0, 100))
            }
            className="input-base tabular-nums"
          />
        </Field>

        {/* Both ends of the window. Each keeps the other in order rather than
            validating on save: the start can never be set past the end, and
            moving the start past the end drags the end with it — an inverted
            window would divide every rate below by a negative number of days.

            Neither is held to today. A window that opened last week is an
            ordinary thing to write down, and the card reports an overdue one
            as overdue rather than refusing to hold it. */}
        <Field label="Start date">
          <input
            type="date"
            value={draft.start}
            max={draft.deadline}
            onChange={(e) => {
              const start = e.target.value || draft.start
              setDraft((d) => ({
                ...d,
                start,
                deadline: start > d.deadline ? start : d.deadline,
              }))
            }}
            className="input-base tabular-nums"
          />
        </Field>

        <Field label="End date">
          <input
            type="date"
            value={draft.deadline}
            min={draft.start}
            onChange={(e) => {
              const deadline = e.target.value || draft.deadline
              setDraft((d) => ({
                ...d,
                deadline,
                start: deadline < d.start ? deadline : d.start,
              }))
            }}
            className="input-base tabular-nums"
          />
        </Field>
      </div>

      {/* Goals are chosen rather than picked from a list of one: a quarter is
          usually committed to on more than one measure, and revenue met by
          discounting into a loss is not the quarter anybody meant. Checkboxes
          rather than a multiple `<select>`, which on a phone opens a picker
          most people cannot multi-select in at all. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[10.5px] uppercase tracking-wide text-label">
          Goals — pick one or more
        </legend>
        <div className="flex flex-wrap gap-2">
          {TARGET_GOALS.map((goal) => {
            const on = chosen(goal)
            // The last one standing cannot be switched off; the target would
            // have nothing left to aim at.
            const locked = on && draft.aims.length === 1
            return (
              <label
                key={goal}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors ${
                  on
                    ? 'border-[#3a3a40] bg-btn text-ink'
                    : 'border-btn-border text-muted hover:border-[#3a3a40] hover:text-ink'
                } ${locked ? 'cursor-default' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={locked}
                  onChange={() => toggle(goal)}
                  className="h-3.5 w-3.5 accent-[#5a5a62]"
                />
                {TARGET_GOAL_LABELS[goal]}
              </label>
            )
          })}
        </div>
      </fieldset>

      {/* One figure per chosen goal, in the same order as the pills above.
          `step="any"` throughout, never a round increment: a step the browser
          can enforce is a validation rule, and `step=100` refuses 10,050 with
          "the two nearest valid values are 10,000 and 10,100". The spinner
          arrows are a convenience; they must not decide what a target may be. */}
      <div className="flex flex-wrap gap-3">
        {draft.aims.map((aim) => (
          <Field
            key={aim.goal}
            label={
              aim.goal === 'roas'
                ? 'Return target (x)'
                : `${TARGET_GOAL_LABELS[aim.goal]} target`
            }
          >
            <input
              type="number"
              min={0}
              step="any"
              value={aim.amount || ''}
              onChange={(e) =>
                setAmount(aim.goal, Math.max(0, Number(e.target.value) || 0))
              }
              className="input-base tabular-nums"
            />
          </Field>
        ))}
      </div>

      {budgetPreview && anchor && (
        <p className="text-[11px] text-label">
          {formatPercent(draft.budgetPct / 100)} of the{' '}
          {formatCurrency(anchor.amount)} {TARGET_GOAL_LABELS[anchor.goal].toLowerCase()}{' '}
          goal is <span className="text-muted">{budgetPreview}</span> of ad spend.
        </p>
      )}

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

const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n))

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
