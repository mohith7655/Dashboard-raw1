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
        {/* The wordmark set as type rather than as an image: there is no Raw1
            asset in the repo, and a text lockup stays sharp at any density and
            recolours with the theme. Swap in an <img> here the day one exists. */}
        <div className="flex min-w-0 flex-1 items-center">
          <div className="min-w-0">
            <h1 className="truncate text-[19px] font-semibold leading-none tracking-[-0.01em] text-ink">
              Raw1
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
 * Yesterday and today, as one segmented control.
 *
 * Set from the same presets the picker's own panel offers, so the two cannot
 * disagree about where a day starts — both run through `rangeFromPreset`, and
 * that reads the store's timezone rather than the reader's.
 *
 * Each button shows whether it is the period currently on screen. Pressing the
 * pressed one is left as a no-op rather than a toggle back: the page always has
 * some period selected, and there is nothing for it to return to.
 */
function QuickDays({
  range,
  onRangeChange,
}: {
  range: DateRange
  onRangeChange: (range: DateRange) => void
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-btn-border">
      <QuickDay
        preset="yesterday"
        label="Yesterday"
        range={range}
        onRangeChange={onRangeChange}
      />
      <span aria-hidden className="w-px bg-btn-border" />
      <QuickDay
        preset="today"
        label="Today"
        range={range}
        onRangeChange={onRangeChange}
      />
    </div>
  )
}

function QuickDay({
  preset,
  label,
  range,
  onRangeChange,
}: {
  preset: PresetId
  label: string
  range: DateRange
  onRangeChange: (range: DateRange) => void
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
      onClick={() => onRangeChange(rangeFromPreset(preset))}
      aria-pressed={active}
      className={`px-2.5 py-2 text-[13px] transition-colors ${
        active
          ? 'bg-[#5b9bd8]/12 text-ink'
          : 'bg-btn text-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  )
}
