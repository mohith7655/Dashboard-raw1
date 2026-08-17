import { formatDay } from '../../lib/format'
import type { Summary } from '../../lib/chartSummary'

/**
 * The average, and the range it sits inside, beside a plot.
 *
 * Beside rather than on: the average is drawn on the chart as one dashed rule,
 * and its value — with the peak and the low — is read from here. Printing the
 * numbers against the line itself would put three labels into the plot area to
 * say what a two-column list says without crossing the data.
 *
 * The peak and low are here because an average alone cannot be judged. A mean
 * dragged up by one exceptional day reads identically to a mean earned evenly
 * across the period, and the two mean opposite things.
 *
 * Hidden below `sm`, where the plot needs the whole card width more than the
 * reader needs three figures the tooltip already carries.
 */
export function ChartSummaryPanel({
  summary,
  format,
}: {
  summary: Summary | null
  format: (value: number) => string
}) {
  if (!summary) return null

  return (
    <dl className="hidden w-[6.5rem] shrink-0 flex-col gap-3 self-center pl-1 sm:flex">
      <Figure label="Average" value={format(summary.average)} lead />
      <Figure
        label="Peak"
        value={format(summary.peak.value)}
        when={summary.peak.date}
      />
      <Figure
        label="Low"
        value={format(summary.low.value)}
        when={summary.low.date}
      />
    </dl>
  )
}

/**
 * One figure. The value wears the card's own ink rather than the series colour
 * — the dashed rule on the plot carries the identity, and a number tinted to
 * match it would read as a fourth series.
 */
function Figure({
  label,
  value,
  when,
  lead = false,
}: {
  label: string
  value: string
  when?: string
  lead?: boolean
}) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10px] uppercase tracking-wide text-label">
        {label}
      </dt>
      <dd
        className={`truncate tabular-nums text-ink ${
          // The average is what the rule on the chart marks, so it leads the
          // panel; the two beside it are the bounds that qualify it.
          lead ? 'text-[15px] font-semibold' : 'text-[13px]'
        }`}
      >
        {value}
      </dd>
      {when && (
        <div className="truncate text-[10.5px] tabular-nums text-muted">
          {formatDay(when)}
        </div>
      )}
    </div>
  )
}
