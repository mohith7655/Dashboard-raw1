import type { MailchimpAutomation, MailchimpBenchmark } from '../../lib/types'
import { formatCtr, formatDay, formatInteger, formatPercent } from '../../lib/format'

interface AutomationsCardProps {
  automations: MailchimpAutomation[]
  /** For marking a rate against Mailchimp's sector average, where one loaded. */
  benchmark: MailchimpBenchmark | null
}

/**
 * The automations, and what they have earned since they were switched on.
 *
 * These are the sends nobody schedules — a welcome series, a lead follow-up —
 * and on this account they outperform the broadcast campaigns by a wide
 * margin. They are shown apart from those campaigns rather than beside them
 * because the figures answer different questions: a campaign's rate belongs to
 * a day, an automation's belongs to every day since it started, and adding one
 * to the other would produce a number that is true of no period at all.
 *
 * Nothing here moves with the date picker, and the card says so — otherwise a
 * reader who narrows the range and sees these figures hold still would be
 * right to distrust them.
 */
export function AutomationsCard({ automations, benchmark }: AutomationsCardProps) {
  if (automations.length === 0) return null

  const live = automations.filter((a) => a.status === 'sending')

  return (
    <div className="card p-0">
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-ink">Automations</h3>
            <p className="mt-0.5 text-[12px] text-muted">
              {live.length > 0
                ? `${formatInteger(live.length)} still sending`
                : 'None currently sending'}
              {' · '}
              totals since each was switched on, not for the period on screen
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left">
              <th
                scope="col"
                className="px-3 py-2.5 pl-5 text-[11px] font-medium uppercase tracking-[0.06em] text-label"
              >
                Automation
              </th>
              <th
                scope="col"
                className="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.06em] text-label"
              >
                Sent
              </th>
              <th
                scope="col"
                className="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.06em] text-label"
              >
                Open rate
              </th>
              <th
                scope="col"
                className="px-3 py-2.5 pr-5 text-right text-[11px] font-medium uppercase tracking-[0.06em] text-label"
              >
                Click rate
              </th>
            </tr>
          </thead>
          <tbody>
            {automations.map((a) => (
              <tr key={a.id} className="border-b border-row-line last:border-0">
                <td className="h-12 px-3 pl-5 align-middle">
                  <div className="min-w-0 max-w-[300px]">
                    <div className="flex items-center gap-2">
                      <StatusDot status={a.status} />
                      <span className="truncate text-ink" title={a.title}>
                        {a.title}
                      </span>
                    </div>
                    <div className="truncate pl-[14px] text-[11.5px] text-label">
                      {a.status === 'sending' ? 'Sending' : 'Paused'}
                      {a.startedAt && ` · since ${formatDay(a.startedAt.slice(0, 10))}`}
                    </div>
                  </div>
                </td>
                <td className="h-12 px-3 text-right align-middle tabular-nums text-muted">
                  {formatInteger(a.emailsSent)}
                </td>
                <td className="h-12 px-3 text-right align-middle tabular-nums text-ink">
                  {formatPercent(a.openRate)}
                </td>
                <td className="h-12 px-3 pr-5 text-right align-middle tabular-nums text-ink">
                  {formatCtr(a.clickRate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {benchmark && (
        <p className="border-t border-row-line px-5 py-3 text-[12px] text-muted">
          The sector averages are {formatPercent(benchmark.openRate)} opens and{' '}
          {formatCtr(benchmark.clickRate)} clicks. An automation reaches somebody
          who has just asked to hear from you, which is why these tend to beat
          both the benchmark and the broadcast campaigns above.
        </p>
      )}
    </div>
  )
}

/**
 * Live or not, as a dot with a text label beside it in the cell below — the
 * colour is never the only thing carrying the state.
 */
function StatusDot({ status }: { status: string }) {
  const live = status === 'sending'
  return (
    <span
      aria-hidden
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${live ? 'bg-pos' : 'bg-label'}`}
    />
  )
}
