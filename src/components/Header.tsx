import { CircleDot, History } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Comparison, DateRange, PresetId } from '../lib/types'
import { rangeFromPreset } from '../lib/dateRange'
import { DateRangePicker } from './DateRangePicker'
import { TodayToggle } from './TodayToggle'

interface HeaderProps {
  range: DateRange
  onRangeChange: (range: DateRange) => void
  comparison: Comparison
  onComparisonChange: (comparison: Comparison) => void
  excludeToday: boolean
  onExcludeTodayChange: (exclude: boolean) => void
}

export function Header({
  range,
  onRangeChange,
  comparison,
  onComparisonChange,
  excludeToday,
  onExcludeTodayChange,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 px-4 py-3">
        {/* The wordmark set as type rather than as an image: there is no RA1
            asset in the repo, and a text lockup stays sharp at any density and
            recolours with the theme. Swap in an <img> here the day one exists. */}
        <div className="flex min-w-0 flex-1 items-center">
          <div className="min-w-0">
            <h1 className="truncate text-[19px] font-semibold leading-none tracking-[-0.01em] text-ink">
              RA1
            </h1>
            {/* Tight under the mark so the two read as one lockup rather than
                as a heading with a subtitle under it. */}
            <p className="mt-1 truncate text-[11px] leading-none text-muted">
              Dashboard
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* The two shortest periods, out beside the picker rather than three
              clicks inside it. They are the ones reached for most often and
              the only two a reader checks repeatedly through a day, so they
              earn the bar; every longer period stays in the panel. */}
          <QuickDays range={range} onRangeChange={onRangeChange} />

          {/* Out on the bar beside the picker rather than only inside it. It
              changes what every figure on the page covers, and a control with
              that reach should be readable without opening a panel — on at a
              glance, and one click to turn off. */}
          <TodayToggle
            range={range}
            excludeToday={excludeToday}
            onChange={onExcludeTodayChange}
          />
          <DateRangePicker
            value={range}
            onChange={onRangeChange}
            comparison={comparison}
            onComparisonChange={onComparisonChange}
            excludeToday={excludeToday}
            onExcludeTodayChange={onExcludeTodayChange}
          />
        </div>
      </div>
    </header>
  )
}

/**
 * Yesterday and today, as one segmented control that goes back.
 *
 * Set from the same presets the picker's own panel offers, so the two cannot
 * disagree about where a day starts — both run through `rangeFromPreset`, and
 * that reads the store's timezone rather than the reader's.
 *
 * Pressing a button jumps to that day and remembers what was on screen;
 * pressing the lit one returns to it. That makes a quick day a look rather
 * than a move — glance at today, then drop back into the month you were
 * reading — which is how these two get used and what the picker cannot do,
 * since going back through it means remembering the dates yourself.
 *
 * The memory is dropped as soon as the period changes by any other route. A
 * button offering to return you to a month you left three controls ago would
 * be a worse surprise than not offering at all.
 */
function QuickDays({
  range,
  onRangeChange,
}: {
  range: DateRange
  onRangeChange: (range: DateRange) => void
}) {
  const [previous, setPrevious] = useState<DateRange | null>(null)
  /** The range this control last set, so a change from elsewhere is visible. */
  const applied = useRef<string | null>(null)

  useEffect(() => {
    if (applied.current === keyOf(range)) return
    applied.current = null
    setPrevious(null)
  }, [range])

  const press = (preset: PresetId, active: boolean) => {
    // The lit button goes back where it can, and is otherwise inert — the page
    // always has some period selected, so there is nothing to toggle off to.
    if (active && !previous) return

    const next = active ? (previous as DateRange) : rangeFromPreset(preset)
    setPrevious(active ? null : range)
    applied.current = keyOf(next)
    onRangeChange(next)
  }

  return (
    <div className="flex overflow-hidden rounded-lg border border-btn-border">
      <QuickDay
        preset="yesterday"
        label="Yesterday"
        short="Y"
        icon={<History size={13} aria-hidden />}
        range={range}
        onPress={press}
        canReturn={!!previous}
      />
      <span aria-hidden className="w-px bg-btn-border" />
      <QuickDay
        preset="today"
        label="Today"
        short="T"
        icon={<CircleDot size={13} aria-hidden />}
        range={range}
        onPress={press}
        canReturn={!!previous}
      />
    </div>
  )
}

function keyOf(range: DateRange): string {
  return `${range.start}:${range.end}`
}

/**
 * One quick day, down to an icon and its initial.
 *
 * The words are carried by `aria-label` and the tooltip rather than by the
 * button face: these two sit in a header that has to survive a narrow window,
 * and "Yesterday" spelled out costs more width than it earns beside a control
 * whose two options are only ever these.
 *
 * The icons say past and present rather than picturing a calendar, because the
 * toggle immediately to the right already uses calendar glyphs for a different
 * question — whether today is counted. Two calendars side by side, meaning two
 * unrelated things, would be worse than none.
 */
function QuickDay({
  preset,
  label,
  short,
  icon,
  range,
  onPress,
  canReturn,
}: {
  preset: PresetId
  label: string
  /** The initial shown on the button face; `label` carries the full word. */
  short: string
  icon: ReactNode
  range: DateRange
  onPress: (preset: PresetId, active: boolean) => void
  /** Whether pressing the lit button has somewhere to go back to. */
  canReturn: boolean
}) {
  /*
   * Matched on the dates rather than on `range.preset`.
   *
   * A range picked by hand carries `custom` even where it happens to cover
   * exactly today, and a reader who selected today on the calendar should see
   * the button they would have pressed lit rather than a control that
   * disagrees with the dates beside it.
   */
  const target = rangeFromPreset(preset)
  const active = range.start === target.start && range.end === target.end

  return (
    <button
      type="button"
      onClick={() => onPress(preset, active)}
      aria-pressed={active}
      // The face is an initial, so the full word has to live here.
      aria-label={label}
      // Names the day, and says what the second press does — neither of which
      // a single letter can.
      title={active && canReturn ? `${label} — back to the previous period` : label}
      className={`flex items-center gap-1.5 px-2.5 py-2 text-[13px] font-medium transition-colors ${
        active
          ? 'bg-[#5b9bd8]/12 text-ink'
          : 'bg-btn text-muted hover:text-ink'
      }`}
    >
      {icon}
      {short}
    </button>
  )
}
