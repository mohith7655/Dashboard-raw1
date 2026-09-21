import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, Check, ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { CompareMode, Comparison, DateRange, PresetId } from '../lib/types'
import {
  COMPARE_MODES,
  PICKER_PRESETS,
  canDropToday,
  includesToday,
  formatRangeLabel,
  latestAvailableDate,
  previousRange,
  rangeFromPreset,
  resolveComparison,
  toIso,
} from '../lib/dateRange'
import { storeTimeZone, timeZoneLabel } from '../lib/timeZone'
import { DatePicker } from './DatePicker'

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
  comparison: Comparison
  onComparisonChange: (comparison: Comparison) => void
  /** Whether today is being left out of the range everything is measured over. */
  excludeToday: boolean
  onExcludeTodayChange: (exclude: boolean) => void
}

type Selecting = 'start' | 'end'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/** The panel at its roomiest — two months side by side, and no wider. */
const PANEL_MAX_WIDTH = 736
/** Below this the panel spans the screen instead of hanging off the button. */
const ANCHORED_FROM = 640
/** Kept clear between the panel and the edge of the screen, per form. */
const SHEET_GUTTER = 8
const ANCHORED_GUTTER = 16

/**
 * One gutter for every row in the panel.
 *
 * Each section used to set its own — 16px on the title row, 12px on the
 * presets, none at all on the comparison block — so the comparison heading and
 * its Clear button sat a pixel off the border while everything above them was
 * inset. Naming it once is what keeps the left edge of the panel a straight
 * line.
 */
const GUTTER = 'px-4'

interface Placement {
  left: number
  top: number
  width: number
  maxHeight: number
}

/** The dropdown form: right edge under the button, never off either side. */
function anchored(trigger: DOMRect, vw: number, vh: number): Placement {
  const width = Math.min(PANEL_MAX_WIDTH, vw - ANCHORED_GUTTER * 2)
  const top = trigger.bottom + 8
  return {
    left: Math.min(
      Math.max(ANCHORED_GUTTER, trigger.right - width),
      vw - width - ANCHORED_GUTTER,
    ),
    top,
    width,
    // Measured off the bottom of the screen rather than a flat 80vh, so the
    // panel always ends above the fold and scrolls the rest.
    maxHeight: Math.max(240, vh - top - ANCHORED_GUTTER),
  }
}

function samePlacement(a: Placement | null, b: Placement) {
  return (
    a !== null &&
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.maxHeight === b.maxHeight
  )
}

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
  excludeToday,
  onExcludeTodayChange,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ start: value.start, end: value.end })
  const [selecting, setSelecting] = useState<Selecting>('start')
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(value.start))
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const maxDate = latestAvailableDate()

  useEffect(() => {
    setDraft({ start: value.start, end: value.end })
    setVisibleMonth(monthStart(value.start))
  }, [value.start, value.end])

  const [placement, setPlacement] = useState<Placement | null>(null)

  /*
   * Where the panel sits, measured rather than declared.
   *
   * It used to be a `fixed` box with `inset-x-2`, which reads as "pinned to the
   * screen" and was not: the header it sits in carries `backdrop-blur`, and a
   * backdrop filter makes an element the containing block for every fixed
   * descendant. The panel was therefore pinned to the *header*, and only looked
   * right for as long as the header stayed flush against the top of the screen.
   * Where a browser lets a sticky header lag — momentum scrolling and a
   * collapsing address bar both do it on a phone — the panel drifted with it
   * and hung off the side of the screen.
   *
   * Portalled to the body and placed from the trigger's own viewport rect, so
   * nothing an ancestor does can move it.
   */
  const place = useCallback(() => {
    const trigger = triggerRef.current?.getBoundingClientRect()
    if (!trigger) return

    const vw = document.documentElement.clientWidth
    const vh = window.innerHeight

    const next: Placement =
      // Narrow: a sheet across the screen. There is no room to hang a
      // two-month calendar off a button, and anchoring it would only push it
      // off an edge.
      vw < ANCHORED_FROM
        ? {
            left: SHEET_GUTTER,
            top: SHEET_GUTTER,
            width: vw - SHEET_GUTTER * 2,
            maxHeight: vh - SHEET_GUTTER * 2,
          }
        : // Wide: a dropdown whose right edge follows the button, clamped so
          // neither side can leave the screen however far right the button
          // sits.
          anchored(trigger, vw, vh)

    // Only when it has actually moved. The listener below runs on capture, so
    // it fires for the panel's own scrolling too, and a fresh object every
    // frame would re-render the calendar under the finger doing the scrolling.
    setPlacement((current) => (samePlacement(current, next) ? current : next))
  }, [])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      // The custom comparison's own calendar is portalled to the body, so it
      // sits outside this panel in the DOM while being part of it on screen.
      if (target.closest?.('[data-nested-popover]')) return
      // The panel is portalled too, so it is no longer inside the root.
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    // Capture, so a scroll anywhere — not just on the page — keeps the
    // dropdown under its button.
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

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
        ref={triggerRef}
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

      {open &&
        placement &&
        createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Select date range"
          style={{
            left: placement.left,
            top: placement.top,
            width: placement.width,
            maxHeight: placement.maxHeight,
          }}
          // Capped and scrollable: two months, the presets and the comparison
          // run past the bottom of a phone screen, and the rows stranded below
          // the fold could not be reached at all.
          //
          // Sideways it may not scroll at all. `overflow-y: auto` alone makes
          // the other axis `auto` too, so any row that overran its gutter
          // turned the whole panel into a horizontal scroller and dragged the
          // sticky title row out of sight with it.
          className="fixed z-50 overflow-y-auto overflow-x-hidden overscroll-contain rounded-lg border border-[#3b3b40] bg-[#242426] shadow-2xl shadow-black/50"
        >
          {/* The title row, on every viewport rather than only the narrow ones
              it was added for.

              Apply sits here because it is the one control that finishes the
              job. At the foot of a column of presets it was below the fold on a
              phone and easy to miss on a desktop, and a panel whose confirm
              button has to be hunted for reads as though the presets were the
              only way to choose anything. Sticky, so it stays reachable while
              the months scroll under it.

              The close button stays for the viewport with neither of the other
              two ways out: a phone has no Escape key, and the panel covers
              nearly the whole screen, so there is little left outside to tap. */}
          <div
            className={`sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-[#3b3b40] bg-[#242426] py-2.5 ${GUTTER}`}
          >
            <span className="truncate text-[12px] font-medium text-ink">
              Select date range
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={applyCustom}
                className="rounded-md border border-btn-border bg-btn px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:border-[#4a4a50]"
              >
                Apply range
              </button>
              <button
                type="button"
                aria-label="Close date picker"
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-btn-border bg-btn text-muted transition-colors hover:text-ink"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* The presets as one row that scrolls sideways.

              A column down the right edge spent a fixed strip of width on every
              screen to hold seven short words, and on a phone it stacked into a
              two-up grid below the calendar — the quickest way to choose a
              period was the last thing reachable. Across the top they are the
              first thing read, and the row gives up horizontal space instead of
              taking vertical.

              Scrolled rather than wrapped: a wrapping row changes height with
              the width of the panel, which moves the calendar underneath it. */}
          <div
            // Padded to land the first chip's *text* on the same gutter as
            // every heading below it: the chips carry their own 10px, so the
            // row itself gives 6.
            className="flex gap-1 overflow-x-auto overscroll-x-contain border-b border-[#3b3b40] px-1.5 py-2"
            // Thin where the platform offers it, so the bar does not eat the
            // row it is scrolling.
            style={{ scrollbarWidth: 'thin' }}
          >
            {PICKER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => choosePreset(preset.id)}
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[#5b9bd8] transition-colors hover:bg-[#303035] hover:text-[#7ab3e8]"
              >
                <span>{preset.label}</span>
                {value.preset === preset.id && preset.id !== 'custom' && (
                  <Check size={14} className="text-muted" />
                )}
              </button>
            ))}
          </div>

          {/* Directly under the presets, because it is about them.

              At the foot of the panel it was below two months of calendar, so
              the sentence naming what every figure on the dashboard is measured
              against — the thing a preset silently changes — was the last thing
              anyone scrolled to. A period and what it is compared with are one
              decision, and they now read as one. */}
          <ComparePanel
            range={value}
            comparison={comparison}
            onChange={onComparisonChange}
          />

          {/* No row any more: the presets that used to sit beside this are
              across the top, so there is nothing to lay out against. */}
          <div className={`min-w-0 py-4 ${GUTTER}`}>
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

            {/* Pulled out to the gutter rather than inset by a further pixel,
                so the two arrows line up with the edges of the calendar they
                move. */}
            <div className="mb-2 flex items-center justify-between">
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

            <div className="grid min-w-0 gap-5 sm:grid-cols-2">
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

            {/* Named rather than assumed. Everyone looking at this dashboard
                is offered the same last day, whatever clock they are sitting
                under, and this is the clock it is. */}
            <p className="mt-3 text-[11px] text-muted">
              Dates follow the store&apos;s calendar — {timeZoneLabel(storeTimeZone())}
              . Today is {formatInputDate(maxDate)} there, and is the last day
              selectable.
            </p>
          </div>

          {/* A section of the panel in its own right rather than a footnote to
              the calendar: it sat inside the calendar's padding box while
              carrying its own, which inset it a further 16px from everything
              above it and left a rule hanging under the last row of the
              panel. */}
          <TodayToggle
            range={value}
            excludeToday={excludeToday}
            onChange={onExcludeTodayChange}
          />
        </div>,
        document.body,
      )}
    </div>
  )
}

/**
 * Drops the part-day off the end of the range.
 *
 * Today is counted in full by everything that divides — the per-day figures on
 * the CEO card, a target's pacing, the daily budget — and it is compared
 * against whole days in the window before it. A period read at nine in the
 * morning therefore reports a store trading far worse than it is, and the
 * earlier it is read the worse the figure looks.
 *
 * Sits with the comparison controls rather than the presets because it does
 * the same kind of work: it decides what the numbers are measured over, not
 * which dates were clicked.
 */
function TodayToggle({
  range,
  excludeToday,
  onChange,
}: {
  range: DateRange
  excludeToday: boolean
  onChange: (exclude: boolean) => void
}) {
  // `range` is the trimmed range — what the figures actually cover — so once
  // this is on it no longer reaches today and looks indistinguishable from a
  // range that never did. Hence the first clause: a control that is on must
  // always be switchable off, whatever the range it produced looks like.
  //
  // Otherwise it is offered only where it would do something. A range that
  // ended last week has no part-day on it, and a checkbox that changed nothing
  // would suggest the figures beside it were in question when they are not.
  const available = excludeToday || canDropToday(range)
  // Only reachable while the trim is a no-op, which is the one case where
  // today is both in the range and all of it.
  const onlyToday = includesToday(range) && !canDropToday(range)

  return (
    <div className={`border-t border-[#3b3b40] py-3 ${GUTTER}`}>
      <label
        className={`flex items-start gap-2.5 ${
          available ? 'cursor-pointer' : 'cursor-default opacity-45'
        }`}
      >
        <input
          type="checkbox"
          checked={excludeToday}
          disabled={!available}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#5b9bd8]"
        />
        <span className="min-w-0">
          <span className="block text-[12px] font-medium text-[#e8e8ea]">
            Leave today out
          </span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
            {onlyToday
              ? 'Today is the whole of this range, so there would be nothing left to measure. The dates above are unchanged.'
              : excludeToday
                ? `Left out — the range ends ${formatInputDate(range.end)}, and the comparison window is the same length.`
                : available
                  ? 'Today is only part of a day. Counted against whole days it drags every per-day figure down, and the comparison window shortens to match so both sides stay the same length.'
                  : 'This range does not reach today, so there is no part-day on it.'}
          </span>
        </span>
      </label>
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
    // The presets above already end in a rule, so this block carries neither a
    // top border nor a margin: the two together drew a second line and left an
    // empty band between them. Its own gutter matches every other section —
    // without one, the heading and the Clear button opposite it sat a pixel
    // off the border of the panel.
    <div className={`border-b border-[#3b3b40] py-3 ${GUTTER}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-[12px] font-medium text-[#e8e8ea]">
          Compare to previous
        </span>
        {comparison.mode !== 'none' && (
          <button
            type="button"
            onClick={() => onChange({ mode: 'none' })}
            className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted transition-colors hover:bg-[#313136] hover:text-ink"
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
        <div className="mt-2 flex min-w-0 items-center gap-1.5">
          <DatePicker
            label="Comparison start date"
            value={custom.start}
            onChange={(iso) => setBound('start', iso)}
            className="min-w-0 flex-1"
          />
          <span className="shrink-0 text-muted">–</span>
          <DatePicker
            label="Comparison end date"
            value={custom.end}
            min={custom.start}
            onChange={(iso) => setBound('end', iso)}
            className="min-w-0 flex-1"
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
      {/* No row gap: the selected range reads as one continuous band across a
          week, the way the store's own picker draws it, and a gap between the
          cells breaks it into separate boxes. */}
      <div className="grid grid-cols-7">
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
                  ? // Struck through rather than merely dimmed. A faint day
                    // still reads as a day one might click; a crossed-out one
                    // says outright that it is not on offer.
                    'text-[#54545c] line-through decoration-[#54545c]'
                  : ranged
                    ? 'bg-[#3a4450] text-white'
                    : 'text-[#dedee1] hover:bg-[#35353a]'
              } ${
                selected && !unavailable
                  ? 'bg-[#4d5a6b] font-semibold text-white'
                  : ''
              }`}
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
