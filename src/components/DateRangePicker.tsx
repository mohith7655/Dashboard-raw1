import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, Check, ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { CompareMode, Comparison, DateRange, PresetId } from '../lib/types'
import {
  COMPARE_MODES,
  PRESETS,
  formatRangeLabel,
  latestAvailableDate,
  previousRange,
  rangeFromPreset,
  resolveComparison,
  toIso,
} from '../lib/dateRange'
import { DatePicker } from './DatePicker'

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
  comparison: Comparison
  onComparisonChange: (comparison: Comparison) => void
}

type Selecting = 'start' | 'end'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function fromIso(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function addMonths(date: Date, count: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1))
}

function monthStart(value: string) {
  const date = fromIso(value)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function formatInputDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(fromIso(value))
}

function monthLabel(month: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(month)
}

function calendarDays(month: Date) {
  const year = month.getUTCFullYear()
  const monthIndex = month.getUTCMonth()
  const firstDay = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()

  return Array.from({ length: firstDay + daysInMonth }, (_, index) =>
    index < firstDay ? null : new Date(Date.UTC(year, monthIndex, index - firstDay + 1)),
  )
}

export function DateRangePicker({
  value,
  onChange,
  comparison,
  onComparisonChange,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ start: value.start, end: value.end })
  const [selecting, setSelecting] = useState<Selecting>('start')
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(value.start))
  const rootRef = useRef<HTMLDivElement>(null)
  const maxDate = latestAvailableDate()

  useEffect(() => {
    setDraft({ start: value.start, end: value.end })
    setVisibleMonth(monthStart(value.start))
  }, [value.start, value.end])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      // The custom comparison's own calendar is portalled to the body, so it
      // sits outside this panel in the DOM while being part of it on screen.
      if (target.closest?.('[data-nested-popover]')) return
      if (!rootRef.current?.contains(target)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const months = useMemo(
    () => [visibleMonth, addMonths(visibleMonth, 1)],
    [visibleMonth],
  )

  const choosePreset = (preset: PresetId) => {
    if (preset === 'custom') {
      setSelecting('start')
      return
    }
    const nextRange = rangeFromPreset(preset)
    onChange(nextRange)
    setDraft({ start: nextRange.start, end: nextRange.end })
    setVisibleMonth(monthStart(nextRange.start))
    setOpen(false)
  }

  const chooseDate = (date: Date) => {
    const selected = toIso(date)
    if (selected > maxDate) return
    if (selecting === 'start') {
      setDraft({ start: selected, end: selected })
      setSelecting('end')
      return
    }

    setDraft((current) =>
      selected < current.start
        ? { start: selected, end: current.start }
        : { start: current.start, end: selected },
    )
    setSelecting('start')
  }

  const applyCustom = () => {
    if (!draft.start || !draft.end) return
    const orderedStart = draft.start <= draft.end ? draft.start : draft.end
    const orderedEnd = draft.start <= draft.end ? draft.end : draft.start
    const start = orderedStart > maxDate ? maxDate : orderedStart
    const end = orderedEnd > maxDate ? maxDate : orderedEnd
    onChange({ start, end, preset: 'custom' })
    setOpen(false)
  }

  const isInRange = (date: string) => date >= draft.start && date <= draft.end

  // Resolved from the applied range, not the draft: the button reports what the
  // dashboard is actually measuring against, not what it would be after Apply.
  const against = resolveComparison(value, comparison)

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-btn-border bg-btn px-3 py-2 text-[13px] text-ink transition-colors hover:border-[#3a3a40]"
      >
        <Calendar size={14} className="text-muted" />
        <span className="flex flex-col items-start leading-tight">
          <span className="whitespace-nowrap">{formatRangeLabel(value)}</span>
          {/* Every delta on the page is measured against this, so it is named
              on the button rather than only inside the panel that sets it. */}
          {against && (
            <span className="whitespace-nowrap text-[11px] text-muted">
              vs {formatRangeLabel(against)}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Select date range"
          // Capped and scrollable: two months, the presets and the comparison
          // run past the bottom of a phone screen, and the rows stranded below
          // the fold could not be reached at all.
          className="absolute right-0 z-50 mt-2 max-h-[80vh] w-[46rem] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-lg border border-[#3b3b40] bg-[#242426] shadow-2xl shadow-black/50"
        >
          {/* A way out, for the viewport that has neither of the other two: a
              phone has no Escape key, and the panel covers nearly the whole
              screen, so there is barely anything left outside it to tap. It
              stays put while the panel scrolls under it. */}
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-[#3b3b40] bg-[#242426] px-4 py-2.5 md:hidden">
            <span className="text-[12px] font-medium text-ink">Select date range</span>
            <button
              type="button"
              aria-label="Close date picker"
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-btn-border bg-btn text-muted transition-colors hover:text-ink"
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex flex-col md:flex-row">
            <div className="min-w-0 flex-1 p-4">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                <DateInput
                  label="Start date"
                  value={draft.start}
                  active={selecting === 'start'}
                  onClick={() => setSelecting('start')}
                />
                <DateInput
                  label="End date"
                  value={draft.end}
                  active={selecting === 'end'}
                  onClick={() => setSelecting('end')}
                />
              </div>

              <div className="mb-2 flex items-center justify-between px-1">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => setVisibleMonth((month) => addMonths(month, -1))}
                  className="rounded p-1 text-muted transition-colors hover:bg-[#313136] hover:text-ink"
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => setVisibleMonth((month) => addMonths(month, 1))}
                  className="rounded p-1 text-muted transition-colors hover:bg-[#313136] hover:text-ink"
                >
                  <ChevronRight size={17} />
                </button>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                {months.map((month) => (
                  <CalendarMonth
                    key={month.toISOString()}
                    month={month}
                    start={draft.start}
                    end={draft.end}
                    maxDate={maxDate}
                    inRange={isInRange}
                    onSelect={chooseDate}
                  />
                ))}
              </div>

              <ComparePanel
                range={value}
                comparison={comparison}
                onChange={onComparisonChange}
              />
            </div>

            <div className="border-t border-[#3b3b40] p-3 md:w-[9.25rem] md:border-l md:border-t-0">
              <div className="grid grid-cols-2 gap-1 md:block">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => choosePreset(preset.id)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-[13px] font-medium text-[#e8e8ea] transition-colors hover:bg-[#303035]"
                  >
                    <span>{preset.label}</span>
                    {value.preset === preset.id && preset.id !== 'custom' && (
                      <Check size={14} className="text-muted" />
                    )}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={applyCustom}
                className="mt-2 w-full rounded-md border border-btn-border bg-btn px-3 py-2 text-[12px] font-medium text-ink transition-colors hover:border-[#4a4a50]"
              >
                Apply range
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Chooses what the range is measured against.
 *
 * The modes are relative rather than absolute — `Month` means one month before
 * whatever range is selected, not a fixed June — so the comparison survives
 * changing the range, which is the whole point of picking it once at the top.
 * `Custom` names two dates for anything the four shifts do not reach, such as
 * two months back or the same quarter two years ago.
 */
function ComparePanel({
  range,
  comparison,
  onChange,
}: {
  range: DateRange
  comparison: Comparison
  onChange: (comparison: Comparison) => void
}) {
  const against = resolveComparison(range, comparison)
  const custom = comparison.mode === 'custom' ? (comparison.range ?? against) : null

  const choose = (mode: CompareMode) => {
    if (mode !== 'custom') return onChange({ mode })
    // Seeded from whatever is resolved now, so the two fields open on a real
    // window rather than empty ones that resolve to nothing.
    onChange({ mode: 'custom', range: against ?? previousRange(range) })
  }

  const setBound = (key: 'start' | 'end', iso: string | undefined) => {
    if (!iso || !custom) return
    const next =
      key === 'start'
        ? { start: iso, end: custom.end < iso ? iso : custom.end }
        : { start: custom.start, end: iso }
    onChange({ mode: 'custom', range: { ...next, preset: 'custom' as const } })
  }

  return (
    <div className="mt-4 border-t border-[#3b3b40] pt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-[#e8e8ea]">Compare to previous</span>
        {comparison.mode !== 'none' && (
          <button
            type="button"
            onClick={() => onChange({ mode: 'none' })}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted transition-colors hover:bg-[#313136] hover:text-ink"
          >
            <X size={11} />
            Clear
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {COMPARE_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => choose(mode.id)}
            aria-pressed={comparison.mode === mode.id}
            className={`rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors ${
              comparison.mode === mode.id
                ? 'border-[#67676f] bg-[#35353a] text-ink'
                : 'border-[#424248] bg-[#26262a] text-[#dedee1] hover:border-[#5a5a61]'
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {custom && (
        <div className="mt-2 flex items-center gap-1.5">
          <DatePicker
            label="Comparison start date"
            value={custom.start}
            onChange={(iso) => setBound('start', iso)}
            className="flex-1"
          />
          <span className="text-muted">–</span>
          <DatePicker
            label="Comparison end date"
            value={custom.end}
            min={custom.start}
            onChange={(iso) => setBound('end', iso)}
            className="flex-1"
          />
        </div>
      )}

      <p className="mt-2 text-[11px] text-muted">
        {against
          ? `Every change on the dashboard is measured against ${formatRangeLabel(against)}.`
          : 'Comparison off — figures are shown without a change.'}
      </p>
    </div>
  )
}

function DateInput({
  label,
  value,
  active,
  onClick,
}: {
  label: string
  value: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-[#26262a] px-3 py-2 text-left text-[12px] text-ink transition-colors ${
        active ? 'border-[#67676f]' : 'border-[#424248] hover:border-[#5a5a61]'
      }`}
    >
      <Calendar size={14} className="shrink-0 text-muted" />
      <span className="truncate font-medium">{formatInputDate(value)}</span>
    </button>
  )
}

function CalendarMonth({
  month,
  start,
  end,
  maxDate,
  inRange,
  onSelect,
}: {
  month: Date
  start: string
  end: string
  maxDate: string
  inRange: (date: string) => boolean
  onSelect: (date: Date) => void
}) {
  return (
    <section aria-label={monthLabel(month)}>
      <h3 className="mb-3 text-center text-[12px] font-semibold text-ink">
        {monthLabel(month)}
      </h3>
      <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-medium text-muted">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {calendarDays(month).map((date, index) => {
          if (!date) return <span key={`empty-${index}`} />
          const iso = toIso(date)
          const selected = iso === start || iso === end
          const ranged = inRange(iso)
          const unavailable = iso > maxDate
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelect(date)}
              disabled={unavailable}
              className={`relative h-7 text-center text-[12px] transition-colors disabled:cursor-not-allowed ${
                unavailable
                  ? 'text-[#5f5f66]'
                  : ranged ? 'bg-[#4a4a4d] text-ink' : 'text-[#dedee1] hover:bg-[#35353a]'
              } ${selected ? 'z-10 rounded-full bg-[#d7d7dc] font-semibold text-[#151518] hover:bg-[#e4e4e8]' : ''}`}
              aria-label={formatInputDate(iso)}
              aria-pressed={selected}
            >
              {date.getUTCDate()}
            </button>
          )
        })}
      </div>
    </section>
  )
}
