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
import {
  TARGET_GOALS,
  TARGET_GOALS_OFFERED,
  TARGET_GOAL_LABELS,
  isMoneyGoal,
} from '../../lib/types'
import {
  QUARTERS,
  TARGET_PERIODS,
  TARGET_PERIOD_LABELS,
  endOfPeriod,
  periodOf,
  quarterOf,
  quarterStart,
  type Quarter,
  type TargetPeriod,
} from '../../lib/targetPeriod'
import { effectiveStart, planTarget } from '../../lib/targets'
import { baselineProgress, useTargetProgress } from '../../lib/targetProgress'
import { monthStart } from '../../lib/dateRange'
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
  countFromMonthStart: true,
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

  // The store as it is trading now, for windows that have yet to open. Built
  // from figures the page already holds, so it costs nothing to have.
  const baseline = useMemo(
    () => baselineProgress(range, woo, blended?.spend ?? null, costs),
    [range, woo, blended, costs],
  )

  const plans = useMemo(
    (): TargetPlan[] =>
      (targets ?? []).map((target) =>
        planTarget({
          target,
          progress: progress.byTarget[target.id] ?? null,
          baseline,
          woo,
          blended,
          range,
          feed,
          today,
        }),
      ),
    [targets, progress, baseline, woo, blended, range, feed, today],
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
            {goalLabel} from {formatDay(effectiveStart(target))} to{' '}
            {formatDay(target.deadline)}{' '}
            <span className={plan.daysLeft === 0 ? 'text-neg' : 'text-label'}>
              ({due})
            </span>
            {target.budgetPct > 0
              ? ` · ad budget ${formatPercent(target.budgetPct / 100)} of sales`
              : ' · no budget set'}
            {/* An estimate and a measurement must not look alike. Where the
                window has traded nothing, every rate below comes from the
                store's recent performance instead. */}
            {plan.basis === 'recent' && (
              <span className="text-amber-400/90"> · estimated from recent trading</span>
            )}
            {/* Said outright, because the window on the card is then not the
                date in the editor and the difference is the whole point. */}
            {target.countFromMonthStart && target.start !== effectiveStart(target) && (
              <span className="text-label"> · counted from the start of the month</span>
            )}
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
        {/* The two figures the whole card turns on, boxed out of the strip
            below: what is being spent, and what reaching the goal costs. They
            were two entries in a row of seven, read at the same weight as
            "per week" — and the gap between them is the decision the target
            exists to inform. Side by side, with the shortfall named, it can be
            read without arithmetic.

            Only where they are two different figures. With no budget set the
            plan already splits the implied one, so the heading above is
            quoting the same number and a box comparing it with itself would
            invent a gap of zero. */}
        {plan.impliedBudget !== null && !plan.basisIsImplied && (
          <div className="mt-2 flex flex-wrap items-stretch gap-2">
            <BudgetBox label="Budget set" value={formatCurrency(plan.budgetBasis)} />
            <BudgetBox
              label="Budget needed"
              value={formatCurrency(plan.impliedBudget)}
              // Short of what the goal needs is the case worth colouring. Over
              // it is not a warning — it is headroom.
              tone={plan.impliedBudget > plan.budgetBasis ? 'short' : 'ok'}
              note={
                plan.impliedBudget > plan.budgetBasis
                  ? `${formatCurrency(plan.impliedBudget - plan.budgetBasis)} short`
                  : `${formatCurrency(plan.budgetBasis - plan.impliedBudget)} spare`
              }
            />
          </div>
        )}

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

/**
 * One of the two budget figures, at the weight the comparison deserves.
 *
 * A box rather than another entry in the strip: these two are read against
 * each other, and the shortfall between them is the number the operator acts
 * on. The strip's job is to list rates; this one's is to pose a question.
 */
function BudgetBox({
  label,
  value,
  tone = 'plain',
  note,
}: {
  label: string
  value: string
  tone?: 'plain' | 'short' | 'ok'
  note?: string
}) {
  return (
    <div className="min-w-[9rem] flex-1 rounded-lg border border-btn-border bg-btn px-3 py-2">
      <div className="truncate text-[10px] uppercase tracking-wide text-label">
        {label}
      </div>
      <div className="mt-0.5 truncate text-[16px] font-semibold tabular-nums text-ink">
        {value}
      </div>
      {note && (
        <div
          className={`mt-0.5 truncate text-[11px] tabular-nums ${
            tone === 'short' ? 'text-neg' : tone === 'ok' ? 'text-pos' : 'text-muted'
          }`}
        >
          {note}
        </div>
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
/** Whether a target already aims at a goal. Module level so the form can ask
    it while building its own list of choices, before `chosen` is bound. */
const chosenGoal = (target: Target, goal: TargetGoal): boolean =>
  target.aims.some((aim) => aim.goal === goal)

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
  /*
   * Read off the window rather than stored on the target.
   *
   * A length is a way of writing two dates down, not a third fact about the
   * target — keeping it in the record would let it disagree with the dates it
   * describes. Derived, an old target opens on the button that matches it and
   * every other one opens on Custom, which is what it is.
   */
  const [period, setPeriod] = useState<TargetPeriod>(() =>
    periodOf(target.start, target.deadline),
  )

  /*
   * Which of the two budget fields is in play, read off the target rather than
   * stored — a sum above zero is what makes a target one budgeted by sum, and
   * that is exactly the test the plan itself applies.
   */
  const [budgetMode, setBudgetModeState] = useState<'percent' | 'amount'>(() =>
    target.budgetAmount && target.budgetAmount > 0 ? 'amount' : 'percent',
  )

  /*
   * Switching clears the field being left behind. Both kept, the record would
   * carry a share and a sum that disagree, and only one of them would be used
   * — the plan prefers the sum, so a stale sum would quietly outrank the
   * percentage the operator had just typed.
   */
  const setBudgetMode = (mode: 'percent' | 'amount') => {
    setBudgetModeState(mode)
    setDraft((d) =>
      mode === 'percent' ? { ...d, budgetAmount: 0 } : { ...d, budgetPct: 0 },
    )
  }

  const set = <K extends keyof Target>(key: K, value: Target[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  /** Moves the window's start, carrying its end where the length fixes one. */
  const setStart = (start: string, next: TargetPeriod = period) => {
    const end = endOfPeriod(start, next)
    setDraft((d) => ({
      ...d,
      start,
      // Custom keeps whatever is there, only refusing to invert.
      deadline: end ?? (start > d.deadline ? start : d.deadline),
    }))
  }

  const choosePeriod = (next: TargetPeriod) => {
    setPeriod(next)
    setStart(draft.start, next)
  }

  /**
   * The goals on the form: the two still offered, plus any the target already
   * carries. A target saved against sales or return on ad spend keeps its box
   * so it can be switched off — dropping it silently would leave an aim on the
   * record with no way to reach it.
   */
  const goalChoices = TARGET_GOALS.filter(
    (goal) => TARGET_GOALS_OFFERED.includes(goal) || chosenGoal(draft, goal),
  )

  const chosen = (goal: TargetGoal) => chosenGoal(draft, goal)

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
    budgetMode === 'amount'
      ? draft.budgetAmount && draft.budgetAmount > 0
        ? formatCurrency(draft.budgetAmount)
        : null
      : anchor && draft.budgetPct > 0
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

        {/* Two ways to say the same thing, and only one on screen at a time.
            Both inputs at once would leave the operator to work out which of
            the two the plan actually used. */}
        <Field label="Ad budget">
          <div className="flex items-center gap-1.5">
            <div className="flex overflow-hidden rounded-lg border border-btn-border">
              {(['percent', 'amount'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setBudgetMode(mode)}
                  aria-pressed={budgetMode === mode}
                  className={`px-2.5 py-2 text-[12.5px] transition-colors ${
                    budgetMode === mode
                      ? 'bg-[#5b9bd8]/12 text-ink'
                      : 'bg-btn text-muted hover:text-ink'
                  }`}
                >
                  {mode === 'percent' ? '% of sales' : 'Amount'}
                </button>
              ))}
            </div>
            {budgetMode === 'percent' ? (
              <input
                type="number"
                min={0}
                max={100}
                step="any"
                value={draft.budgetPct || ''}
                onChange={(e) =>
                  set('budgetPct', clamp(Number(e.target.value) || 0, 0, 100))
                }
                className="input-base w-[6rem] tabular-nums"
              />
            ) : (
              <input
                type="number"
                min={0}
                step="any"
                value={draft.budgetAmount || ''}
                onChange={(e) =>
                  set('budgetAmount', Math.max(0, Number(e.target.value) || 0))
                }
                className="input-base w-[8rem] tabular-nums"
              />
            )}
          </div>
        </Field>

        {/* How long the target runs, which decides where it ends. Chosen
            before the dates because it governs them: pick Monthly and the end
            follows the start for good, so the only date to think about is the
            one it opens on. */}
        <Field label="Length" className="min-w-[14rem] flex-1">
          <div className="flex flex-wrap gap-1.5">
            {TARGET_PERIODS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => choosePeriod(option)}
                aria-pressed={period === option}
                className={`rounded-lg border px-2.5 py-1.5 text-[12.5px] transition-colors ${
                  period === option
                    ? 'border-[#3a3a40] bg-btn text-ink'
                    : 'border-btn-border text-muted hover:border-[#3a3a40] hover:text-ink'
                }`}
              >
                {TARGET_PERIOD_LABELS[option]}
              </button>
            ))}
          </div>
        </Field>

        {/* The four calendar quarters, offered only once the target is one.
            A quarter is named rather than dated in every conversation it comes
            up in, and Q3 is a click where 1 July is a date to look up. The
            year comes from the start already set, so choosing Q1 in a target
            opened in 2027 does not jump back to this year. */}
        {period === 'quarterly' && (
          <Field label="Quarter" className="min-w-[12rem]">
            <div className="flex flex-wrap gap-1.5">
              {QUARTERS.map((quarter) => {
                const at = quarterOf(draft.start)
                const year = at?.year ?? new Date().getFullYear()
                const on = at?.quarter === quarter
                return (
                  <button
                    key={quarter}
                    type="button"
                    onClick={() => setStart(quarterStart(year, quarter as Quarter))}
                    aria-pressed={on}
                    className={`rounded-lg border px-2.5 py-1.5 text-[12.5px] tabular-nums transition-colors ${
                      on
                        ? 'border-[#3a3a40] bg-btn text-ink'
                        : 'border-btn-border text-muted hover:border-[#3a3a40] hover:text-ink'
                    }`}
                  >
                    Q{quarter}
                  </button>
                )
              })}
            </div>
          </Field>
        )}

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
            onChange={(e) => setStart(e.target.value || draft.start)}
            className="input-base tabular-nums"
          />
        </Field>

        <Field label={period === 'custom' ? 'End date' : 'End date (set by the length)'}>
          <input
            type="date"
            value={draft.deadline}
            min={draft.start}
            /* Fixed by the length, so it is shown rather than asked for. An
               editable end beside a length that decides it is two controls for
               one fact, and the loser is whichever the operator touched last. */
            readOnly={period !== 'custom'}
            aria-readonly={period !== 'custom'}
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
          {goalChoices.map((goal) => {
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

      {/* Advertising is bought and reconciled by the month, so a target set on
          the 16th is usually still working against a budget that started on
          the 1st. Moving the whole window rather than the spend alone keeps
          the return honest: spend counted from the first against sales counted
          from the sixteenth is a ratio struck from two different periods. */}
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={draft.countFromMonthStart}
          onChange={(e) => set('countFromMonthStart', e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#5a5a62]"
        />
        <span className="min-w-0">
          <span className="block text-[12.5px] text-ink">
            Count from the start of the month
          </span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
            {draft.countFromMonthStart
              ? `Everything is measured from ${formatDay(monthStart(draft.start))}, including the ad spend already made this month.`
              : `Everything is measured from ${formatDay(draft.start)}. Ad spend made earlier in the month is not counted against this target.`}
          </span>
        </span>
      </label>

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
