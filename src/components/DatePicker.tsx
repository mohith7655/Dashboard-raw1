import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { formatDate, parseIsoDate } from '../lib/format'
import { toIso } from '../lib/dateRange'

interface DatePickerProps {
  /** `yyyy-MM-dd`, or undefined when the field is empty. */
  value: string | undefined
  onChange: (value: string | undefined) => void
  /** Screen-reader name for the field — each row needs its own. */
  label: string
  /** What an empty field means, e.g. `Open-ended`. */
  placeholder?: string
  /** Whether the field can be emptied again once set. */
  clearable?: boolean
  /** No earlier day may be picked — an end date cannot precede its start. */
  min?: string
  title?: string
  /** Widths differ per column; everything else is fixed. */
  className?: string
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const PANEL_WIDTH = 268
const PANEL_HEIGHT = 316

/** Leading blanks so the 1st sits under its weekday, then every day of the month. */
function calendarDays(year: number, month: number): (Date | null)[] {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay()
  const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return Array.from({ length: firstWeekday + length }, (_, i) =>
    i < firstWeekday ? null : new Date(Date.UTC(year, month, i - firstWeekday + 1)),
  )
}

/**
 * A single-date field: a button that opens a calendar rather than a native
 * `<input type="date">`.
 *
 * Operating costs reach years back — a subscription taken out in 2021, a lease
 * signed before that — and the native control makes those months a long walk.
 * The header carries month and year dropdowns so any date is two clicks away,
 * and the panel matches the range picker rather than the browser's own chrome,
 * which on Windows arrives light-themed in a dark dashboard.
 */
export function DatePicker({
  value,
  onChange,
  label,
  placeholder = 'Pick a date',
  clearable = false,
  min,
  title,
  className = '',
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Which month the grid is showing. Follows the value when there is one, and
  // otherwise opens on the current month.
  const [view, setView] = useState(() => monthOf(value))
  useEffect(() => setView(monthOf(value)), [value])

  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // The rows live inside a horizontally scrolling table, which clips anything
  // absolutely positioned within it, so the panel is portalled to the body and
  // pinned to the trigger's viewport position instead.
  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const room = window.innerHeight - rect.bottom
    const flip = room < PANEL_HEIGHT + 8 && rect.top > room
    setPos({
      top: flip ? Math.max(8, rect.top - PANEL_HEIGHT - 6) : rect.bottom + 6,
      left: Math.min(
        Math.max(8, rect.left),
        Math.max(8, window.innerWidth - PANEL_WIDTH - 8),
      ),
    })
  }, [])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    // Capture, so the table's own horizontal scrolling moves the panel too.
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  // Wide enough for a lease signed years ago and a renewal years out, and
  // always containing the year already picked however far outside that it is.
  const years = useMemo(() => {
    const now = new Date().getUTCFullYear()
    const first = Math.min(now - 15, view.year)
    const last = Math.max(now + 10, view.year)
    return Array.from({ length: last - first + 1 }, (_, i) => first + i)
  }, [view.year])

  const shift = (months: number) =>
    setView(({ year, month }) => {
      const at = new Date(Date.UTC(year, month + months, 1))
      return { year: at.getUTCFullYear(), month: at.getUTCMonth() }
    })

  const choose = (date: Date) => {
    onChange(toIso(date))
    setOpen(false)
    triggerRef.current?.focus()
  }

  const today = todayIso()

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={title}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-8 items-center gap-1.5 rounded-md border border-btn-border bg-btn px-2 text-left text-[13px] transition-colors hover:border-[#3d3d44] ${
          value ? 'text-ink' : 'text-muted'
        } ${className}`}
      >
        <Calendar size={13} className="shrink-0 text-muted" />
        <span className="truncate">{value ? formatDate(value) : placeholder}</span>
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={label}
            style={{ top: pos.top, left: pos.left, width: PANEL_WIDTH }}
            className="fixed z-50 rounded-lg border border-[#3b3b40] bg-[#242426] p-3 shadow-2xl shadow-black/50"
          >
            <div className="mb-2 flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => shift(-1)}
                className="rounded p-1 text-muted transition-colors hover:bg-[#313136] hover:text-ink"
              >
                <ChevronLeft size={16} />
              </button>

              <select
                aria-label="Month"
                value={view.month}
                onChange={(e) =>
                  setView((current) => ({ ...current, month: Number(e.target.value) }))
                }
                className="h-7 min-w-0 flex-1 rounded-md border border-[#424248] bg-[#26262a] px-1.5 text-[12px] text-ink outline-none transition-colors focus:border-[#67676f]"
              >
                {MONTHS.map((name, index) => (
                  <option key={name} value={index}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                aria-label="Year"
                value={view.year}
                onChange={(e) =>
                  setView((current) => ({ ...current, year: Number(e.target.value) }))
                }
                className="h-7 rounded-md border border-[#424248] bg-[#26262a] px-1.5 text-[12px] text-ink outline-none transition-colors focus:border-[#67676f]"
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>

              <button
                type="button"
                aria-label="Next month"
                onClick={() => shift(1)}
                className="rounded p-1 text-muted transition-colors hover:bg-[#313136] hover:text-ink"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-medium text-muted">
              {WEEKDAYS.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-y-1">
              {calendarDays(view.year, view.month).map((date, index) => {
                if (!date) return <span key={`empty-${index}`} />
                const iso = toIso(date)
                const selected = iso === value
                const blocked = !!min && iso < min
                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={blocked}
                    onClick={() => choose(date)}
                    aria-label={formatDate(iso)}
                    aria-pressed={selected}
                    className={`h-7 text-center text-[12px] transition-colors disabled:cursor-not-allowed ${
                      blocked
                        ? 'text-[#5f5f66]'
                        : 'text-[#dedee1] hover:bg-[#35353a]'
                    } ${
                      selected
                        ? 'rounded-full bg-[#d7d7dc] font-semibold text-[#151518] hover:bg-[#e4e4e8]'
                        : iso === today
                          ? 'rounded-full ring-1 ring-inset ring-[#55555c]'
                          : ''
                    }`}
                  >
                    {date.getUTCDate()}
                  </button>
                )
              })}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-[#3b3b40] pt-2">
              <button
                type="button"
                onClick={() => {
                  onChange(today)
                  setOpen(false)
                }}
                className="rounded-md px-2 py-1 text-[12px] text-[#dedee1] transition-colors hover:bg-[#313136]"
              >
                Today
              </button>
              {clearable && value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange(undefined)
                    setOpen(false)
                  }}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted transition-colors hover:bg-[#313136] hover:text-ink"
                >
                  <X size={12} />
                  Clear
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

/**
 * The viewer's own calendar day as `yyyy-MM-dd`. Read in local time and then
 * labelled UTC, so someone west of Greenwich on a late evening does not see
 * tomorrow ringed as today.
 */
function todayIso(): string {
  const now = new Date()
  return toIso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())))
}

/** The month a value sits in, or the current one when there is no value. */
function monthOf(value: string | undefined): { year: number; month: number } {
  const at = parseIsoDate(value ?? todayIso())
  return { year: at.getUTCFullYear(), month: at.getUTCMonth() }
}
