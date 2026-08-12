import { CalendarDays, CalendarOff } from 'lucide-react'
import type { DateRange } from '../lib/types'
import { canDropToday } from '../lib/dateRange'

/**
 * Whether today — a part-day — is counted in whatever this controls.
 *
 * A pressed toggle rather than a checkbox in a panel: it silently changes what
 * every figure under it means, so its state has to be legible without opening
 * anything. The label says which way it is set rather than what clicking would
 * do, because a button reading "Exclude today" tells you nothing about whether
 * today is currently in.
 */
export function TodayToggle({
  range,
  excludeToday,
  onChange,
  size = 'md',
}: {
  range: DateRange
  excludeToday: boolean
  onChange: (exclude: boolean) => void
  /** `sm` for a section title row, where it sits beside icon buttons. */
  size?: 'sm' | 'md'
}) {
  // A control that is on must always be switchable off — once it is, the range
  // no longer reaches today and looks like one that never did. Otherwise it is
  // offered only where there is a part-day to drop.
  const available = excludeToday || canDropToday(range)
  const small = size === 'sm'

  return (
    <button
      type="button"
      onClick={() => onChange(!excludeToday)}
      disabled={!available}
      aria-pressed={excludeToday}
      title={
        available
          ? excludeToday
            ? `Today is left out — figures cover up to ${range.end}. Click to put it back.`
            : 'Today is counted, and it is only a part-day. Click to leave it out.'
          : 'This range does not reach today, so there is no part-day to drop.'
      }
      className={`flex shrink-0 items-center gap-1.5 rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        small ? 'h-7 px-2 text-[11.5px]' : 'px-3 py-2 text-[13px]'
      } ${
        excludeToday
          ? 'border-[#5b9bd8] bg-[#5b9bd8]/12 text-ink'
          : 'border-btn-border bg-btn text-ink hover:border-[#3a3a40]'
      }`}
    >
      {excludeToday ? (
        <CalendarOff size={small ? 12 : 14} className="text-[#5b9bd8]" />
      ) : (
        <CalendarDays size={small ? 12 : 14} className="text-muted" />
      )}
      <span className={small ? '' : 'hidden sm:inline'}>
        {excludeToday ? 'Today off' : 'Today on'}
      </span>
    </button>
  )
}
