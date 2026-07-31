import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import type { DateRange, PresetId } from '../lib/types'
import {
  PRESETS,
  formatRangeLabel,
  latestAvailableDate,
  rangeFromPreset,
  toIso,
} from '../lib/dateRange'

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
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

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
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
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
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
        <span className="whitespace-nowrap">{formatRangeLabel(value)}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Select date range"
          className="absolute right-0 z-50 mt-2 w-[46rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-[#3b3b40] bg-[#242426] shadow-2xl shadow-black/50"
        >
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
