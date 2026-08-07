import { useEffect, useMemo, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import type {
  InsightsAutomation,
  InsightsSchedule,
  ReportFrequency,
  ReportPeriod,
} from '../../lib/types'
import { MAX_DAY_OF_MONTH, REPORT_FREQUENCIES, REPORT_PERIODS } from '../../lib/types'
import {
  DEFAULT_SCHEDULE,
  FREQUENCY_LABELS,
  PERIOD_LABELS,
  WEEKDAY_LABELS,
  describeSchedule,
  isDue,
  nextRun,
} from '../../lib/insightsSchedule'
import { formatDate } from '../../lib/format'
import { storeTimeZone, timeZoneLabel } from '../../lib/timeZone'
import { Skeleton } from '../Skeleton'

interface InsightsScheduleCardProps {
  automation: InsightsAutomation | undefined
  loading: boolean
  /** From the load or the last save; either one means the settings on screen are not the stored ones. */
  error: string | null
  saving: boolean
  onSave: (schedule: InsightsSchedule) => void
}

const FIELD =
  'h-8 rounded-md border border-btn-border bg-btn px-2 text-[13px] text-ink outline-none transition-colors focus:border-[#3d3d44] disabled:opacity-40'

/**
 * When the dashboard should write a report on its own.
 *
 * Edits are held locally and sent on Save, the way the operating costs are:
 * a schedule half-typed into a form should never be the one a function reads
 * at three in the morning.
 *
 * Everything here is on the store's calendar. A dashboard read from three
 * countries has one set of dates for all of them, and a schedule that meant a
 * different hour to each reader could not be discussed.
 */
export function InsightsScheduleCard({
  automation,
  loading,
  error,
  saving,
  onSave,
}: InsightsScheduleCardProps) {
  const stored = automation?.schedule
  const [draft, setDraft] = useState<InsightsSchedule>(DEFAULT_SCHEDULE)

  // Reseeded on the initial load, and again with whatever the server echoed
  // back after a save.
  useEffect(() => {
    if (stored) setDraft(stored)
  }, [stored])

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(stored ?? DEFAULT_SCHEDULE),
    [draft, stored],
  )

  const zone = storeTimeZone()
  const lastRunAt = automation?.lastRunAt ?? null
  // Drawn from the draft rather than the stored schedule, so moving the time
  // answers immediately with the day it would land on. Labelled as pending
  // while it is still unsaved.
  const due = isDue(draft, lastRunAt, zone)
  const next = nextRun(draft, lastRunAt, zone)

  const set = (patch: Partial<InsightsSchedule>) =>
    setDraft((current) => ({ ...current, ...patch }))

  if (loading && !automation) {
    return (
      <div className="card">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-3 w-full" />
        <Skeleton className="mt-2 h-3 w-2/3" />
      </div>
    )
  }

  return (
    <div className="card p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <CalendarClock size={15} className="text-muted" />
            Automatic reports
          </h3>
          <p className="mt-0.5 max-w-prose text-[12px] leading-relaxed text-muted">
            Writes a report on its own, without anyone having the dashboard
            open. Times are on the store&apos;s calendar — {timeZoneLabel(zone)} —
            and a run lands in the first hour at or after the time you pick.
          </p>
        </div>
      </div>

      {error && (
        <p className="mx-5 mb-3 rounded-lg border border-[#4a2626] bg-[#1e1414] px-3 py-2 text-[12px] text-neg">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 px-5 pb-4">
        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => set({ enabled: event.target.checked })}
            className="h-3.5 w-3.5 accent-[#6c6cf0]"
          />
          Generate automatically
        </label>

        <Field label="How often">
          <select
            value={draft.frequency}
            disabled={!draft.enabled}
            onChange={(event) =>
              set({ frequency: event.target.value as ReportFrequency })
            }
            className={FIELD}
          >
            {REPORT_FREQUENCIES.map((id) => (
              <option key={id} value={id}>
                {FREQUENCY_LABELS[id]}
              </option>
            ))}
          </select>
        </Field>

        {draft.frequency === 'weekly' && (
          <Field label="On">
            <select
              value={draft.weekday}
              disabled={!draft.enabled}
              onChange={(event) => set({ weekday: Number(event.target.value) })}
              className={FIELD}
            >
              {WEEKDAY_LABELS.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        )}

        {draft.frequency === 'monthly' && (
          <Field label="Day of month">
            <select
              value={draft.dayOfMonth}
              disabled={!draft.enabled}
              onChange={(event) => set({ dayOfMonth: Number(event.target.value) })}
              className={FIELD}
            >
              {/* Stops at the 28th: a report set for the 31st would skip
                  February, and a month silently missing is worse than a day
                  earlier than asked for. */}
              {Array.from({ length: MAX_DAY_OF_MONTH }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="At">
          <input
            type="time"
            value={draft.time}
            disabled={!draft.enabled}
            onChange={(event) => set({ time: event.target.value || '08:00' })}
            className={FIELD}
          />
        </Field>

        <Field label="Report on">
          <select
            value={draft.period}
            disabled={!draft.enabled}
            onChange={(event) => set({ period: event.target.value as ReportPeriod })}
            className={FIELD}
          >
            {REPORT_PERIODS.map((id) => (
              <option key={id} value={id}>
                {PERIOD_LABELS[id]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5 text-[12px]">
        <span className="min-w-0 text-muted">
          {!draft.enabled ? (
            'Off — reports are written only when you click Analyze.'
          ) : (
            <>
              {describeSchedule(draft)}, covering{' '}
              <span className="text-ink">{PERIOD_LABELS[draft.period].toLowerCase()}</span>.{' '}
              {due ? (
                <span className="text-ink">Due now — runs within the hour.</span>
              ) : next ? (
                <>
                  Next{dirty ? ' once saved' : ''}:{' '}
                  <span className="text-ink">
                    {formatDate(next.date)} at {next.time}
                  </span>
                </>
              ) : null}
            </>
          )}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-[0.06em] text-label">{label}</span>
      {children}
    </label>
  )
}
