import { CalendarDays, ClockArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Comparison, DateRange, PresetId } from '../lib/types'
import { rangeFromPreset } from '../lib/dateRange'
import { DateRangePicker } from './DateRangePicker'

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

          {/* The today toggle used to sit here, on the bar. It now lives only
              in the picker's own panel, which still carries it — taking it off
              the bar removes the control from view, not from the page. */}
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
 * Yesterday and today, as two independent toggles.
 *
 * Set from the same presets the picker's own panel offers, so the two cannot
 * disagree about where a day starts — both run through `rangeFromPreset`, and
 * that reads the store's timezone rather than the reader's.
 *
 * Each is a switch rather than a jump: pressing one moves to that day,
 * pressing the lit one comes back. That makes a quick day a look rather than a
 * move — glance at today, then drop back into the month you were reading —
 * which is what the picker cannot do, since going back through it means
 * remembering the dates yourself.
 *
 * What they come back to is one remembered period, not one per button, and it
 * is only ever a period chosen by some other route. That is the whole point of
 * the design and it is what the previous one got wrong: it remembered
 * "whatever was on screen when you pressed", so pressing Yesterday and then
 * Today recorded yesterday as the place to return to, and switching Today off
 * landed on yesterday instead of the month the reader started from. Their
 * calendar selection was destroyed by using the other button.
 *
 * Holding only non-quick-day periods makes the two genuinely independent:
 * neither can overwrite what the other returns to, in any order, however many
 * times they are pressed.
 */
function QuickDays({
  range,
  onRangeChange,
}: {
  range: DateRange
  onRangeChange: (range: DateRange) => void
}) {
  /** The last period chosen by anything other than these two buttons. */
  const [base, setBase] = useState<DateRange | null>(() =>
    quickPresetOf(range) ? null : range,
  )

  /*
   * Any period that is not one of these two days is one the reader picked
   * elsewhere — the calendar, a preset, a section control — so it becomes the
   * thing to come back to.
   *
   * Depending on the dates rather than the object: the range is rebuilt on
   * every render upstream, so depending on identity would run this on each
   * one and overwrite the base with a quick day the moment React re-rendered.
   */
  useEffect(() => {
    if (!quickPresetOf(range)) setBase(range)
  }, [range])

  const press = (preset: PresetId, active: boolean) => {
    if (!active) {
      onRangeChange(rangeFromPreset(preset))
      return
    }
    /*
     * Switching off returns to the period this control interrupted.
     *
     * The month stands in where nothing is remembered — the page was loaded
     * already sitting on this day, so there is no interrupted period to
     * restore. It is where the dashboard opens, and it means the lit button is
     * never inert: a toggle that sometimes does nothing when pressed is worse
     * than one that always goes somewhere predictable.
     */
    onRangeChange(base ?? rangeFromPreset('thisMonth'))
  }

  return (
    <div className="flex overflow-hidden rounded-lg border border-btn-border">
      <QuickDay
        preset="yesterday"
        label="Yesterday"
        short="Y"
        icon={<ClockArrowLeft size={13} aria-hidden />}
        range={range}
        onPress={press}
      />
      <span aria-hidden className="w-px bg-btn-border" />
      <QuickDay
        preset="today"
        label="Today"
        short="T"
        icon={<CalendarDays size={13} aria-hidden />}
        range={range}
        onPress={press}
      />
    </div>
  )
}

/**
 * Which of the two quick days a range is, or null for anything else.
 *
 * Matched on the dates rather than on `range.preset`: a range picked by hand
 * carries `custom` even where it happens to cover exactly today, and treating
 * that as a period to return to would let the calendar overwrite itself.
 */
function quickPresetOf(range: DateRange): PresetId | null {
  for (const preset of ['yesterday', 'today'] as const) {
    const target = rangeFromPreset(preset)
    if (range.start === target.start && range.end === target.end) return preset
  }
  return null
}

/**
 * One quick day, down to an icon and its initial.
 *
 * The words are carried by `aria-label` and the tooltip rather than by the
 * button face: these two sit in a header that has to survive a narrow window,
 * and "Yesterday" spelled out costs more width than it earns beside a control
 * whose two options are only ever these.
 *
 * A clock wound back for yesterday, a calendar for today. The pair reads as
 * "a day behind" against "the day itself", which is the distinction the two
 * buttons actually draw.
 *
 * The calendar was unavailable until the today toggle came off this bar: it
 * used calendar glyphs for an unrelated question — whether today is counted in
 * the figures — and two calendars side by side meaning two different things
 * would have been worse than none. With it gone the glyph is free, and the
 * plain one is the clearest thing today can wear.
 */
function QuickDay({
  preset,
  label,
  short,
  icon,
  range,
  onPress,
}: {
  preset: PresetId
  label: string
  /** The initial shown on the button face; `label` carries the full word. */
  short: string
  icon: ReactNode
  range: DateRange
  onPress: (preset: PresetId, active: boolean) => void
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
      // Names the day, and says what a second press does — neither of which a
      // single letter can.
      title={active ? `${label} — press again to go back` : label}
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
