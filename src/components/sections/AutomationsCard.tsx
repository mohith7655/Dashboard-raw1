import type { ReactNode } from 'react'
import type {
  MailchimpAutomation,
  MailchimpBenchmark,
  MailchimpJourney,
} from '../../lib/types'
import { daysInRange, latestAvailableDate } from '../../lib/dateRange'
import {
  formatCtr,
  formatDay,
  formatDecimal,
  formatInteger,
  formatPercent,
} from '../../lib/format'

interface AutomationsCardProps {
  automations: MailchimpAutomation[]
  journeys: MailchimpJourney[]
  /** For marking a rate against Mailchimp's sector average, where one loaded. */
  benchmark: MailchimpBenchmark | null
}

/**
 * The whole Automations screen, which Mailchimp splits in two.
 *
 * Its UI has an Automation flows tab and a Classic Automations tab, and the
 * API keeps them as far apart as the interface does — journeys on
 * `/customer-journeys/journeys`, classic series on `/automations`, neither in
 * `/reports`. Both are shown here under the names Mailchimp gives them, so a
 * reader comparing this card against that screen can find every row.
 *
 * They are two tables rather than one because they do not measure the same
 * thing. A classic automation sends email and reports opens; a journey moves
 * contacts through steps and reports how many entered, how many are partway
 * through and how many came out the end. Forcing both into one set of columns
 * would mean three empty cells on every row of whichever lost.
 *
 * Nothing here moves with the date picker, and both tables say so — these are
 * running totals since each was switched on, and a reader who narrows the
 * range and sees them hold still would be right to distrust them otherwise.
 */
export function AutomationsCard({
  automations,
  journeys,
  benchmark,
}: AutomationsCardProps) {
  if (automations.length === 0 && journeys.length === 0) return null

  const liveJourneys = journeys.filter((j) => j.status === 'sending').length
  const liveAutomations = automations.filter((a) => a.status === 'sending').length

  return (
    <div className="card p-0">
      <div className="px-5 pb-4 pt-5">
        <h3 className="text-[15px] font-semibold text-ink">Automations</h3>
        <p className="mt-0.5 text-[12px] text-muted">
          {liveJourneys + liveAutomations > 0
            ? `${formatInteger(liveJourneys + liveAutomations)} still running`
            : 'None currently running'}
          {' · '}
          totals since each was switched on, not for the period on screen
        </p>
      </div>

      {journeys.length > 0 && (
        <>
          <Subhead
            label="Automation flows"
            note="Contacts moving through each journey"
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line text-left">
                  <Th className="pl-5">Journey</Th>
                  <Th align="right">Started</Th>
                  <Th align="right">In progress</Th>
                  <Th align="right" className="pr-5">
                    Completed
                  </Th>
                </tr>
              </thead>
              <tbody>
                {journeys.map((j) => (
                  <tr key={j.id} className="border-b border-row-line last:border-0">
                    <Td className="pl-5">
                      <Name
                        title={j.name}
                        status={j.status}
                        sub={[j.listName, j.startedAt && `since ${formatDay(j.startedAt.slice(0, 10))}`]
                          .filter(Boolean)
                          .join(' · ')}
                      />
                    </Td>
                    <Td align="right" className="tabular-nums text-ink">
                      {formatInteger(j.started)}
                    </Td>
                    <Td align="right" className="tabular-nums text-muted">
                      {formatInteger(j.inProgress)}
                    </Td>
                    <Td align="right" className="pr-5 tabular-nums text-ink">
                      {formatInteger(j.completed)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {automations.length > 0 && (
        <>
          <Subhead
            label="Classic automations"
            note="Email sent by each series, and how it was received"
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line text-left">
                  <Th className="pl-5">Automation</Th>
                  <Th align="right">Sent / day</Th>
                  <Th align="right">Sent</Th>
                  <Th align="right">Open rate</Th>
                  <Th align="right" className="pr-5">
                    Click rate
                  </Th>
                </tr>
              </thead>
              <tbody>
                {automations.map((a) => {
                  const rate = perDay(a)
                  return (
                  <tr key={a.id} className="border-b border-row-line last:border-0">
                    <Td className="pl-5">
                      <Name
                        title={a.title}
                        status={a.status}
                        sub={
                          a.startedAt ? `since ${formatDay(a.startedAt.slice(0, 10))}` : ''
                        }
                      />
                    </Td>
                    {/* The rate first, then the total it was struck from —
                        a lifetime count says how long a series has run as
                        much as how hard it works, and the two together say
                        which. */}
                    <Td align="right" className="tabular-nums text-ink">
                      {rate === null ? '—' : formatDecimal(rate)}
                    </Td>
                    <Td align="right" className="tabular-nums text-muted">
                      {formatInteger(a.emailsSent)}
                    </Td>
                    <Td align="right" className="tabular-nums text-ink">
                      {formatPercent(a.openRate)}
                    </Td>
                    <Td align="right" className="pr-5 tabular-nums text-ink">
                      {formatCtr(a.clickRate)}
                    </Td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {benchmark && automations.length > 0 && (
        <p className="border-t border-row-line px-5 py-3 text-[12px] text-muted">
          The sector averages are {formatPercent(benchmark.openRate)} opens and{' '}
          {formatCtr(benchmark.clickRate)} clicks. An automation reaches somebody
          who has just asked to hear from you, which is why these tend to beat
          both the benchmark and the broadcast campaigns above. The journeys have
          no rate to compare — they report contacts rather than email. Mail a day
          is averaged over every day since each series started; Mailchimp
          publishes no date for when a paused one stopped, so those averages
          cover days that sent nothing and read low.
        </p>
      )}
    </div>
  )
}

/**
 * Mail a day, averaged across every day since the series was switched on.
 *
 * Null where Mailchimp reported no start date, since there is then no span to
 * divide by. For a paused series the span still runs to today — the API says
 * when an automation started but never when it stopped, so the average covers
 * days it was not sending and reads low. That is said under the table rather
 * than corrected for, because correcting for it would need a date Mailchimp
 * does not publish.
 */
function perDay(a: MailchimpAutomation): number | null {
  if (!a.startedAt) return null
  const start = a.startedAt.slice(0, 10)
  const end = latestAvailableDate()
  if (start > end) return null
  return a.emailsSent / daysInRange({ start, end, preset: 'custom' })
}

/** Names one of the two halves, in Mailchimp's own words for it. */
function Subhead({ label, note }: { label: string; note: string }) {
  return (
    <div className="border-t border-line bg-btn/40 px-5 py-2">
      <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-label">
        {label}
      </div>
      <div className="text-[11.5px] text-muted">{note}</div>
    </div>
  )
}

/**
 * A row's name, its state, and where it came from.
 *
 * The dot is never the only thing carrying the state — the word sits directly
 * under it, so the colour is a convenience rather than the signal.
 */
function Name({
  title,
  status,
  sub,
}: {
  title: string
  status: string
  sub: string
}) {
  const live = status === 'sending'
  return (
    <div className="min-w-0 max-w-[320px]">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${live ? 'bg-pos' : 'bg-label'}`}
        />
        <span className="truncate text-ink" title={title}>
          {title}
        </span>
      </div>
      <div className="truncate pl-[14px] text-[11.5px] text-label">
        {live ? 'Running' : 'Paused'}
        {sub && ` · ${sub}`}
      </div>
    </div>
  )
}

function Th({
  children,
  align = 'left',
  className = '',
}: {
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-label ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align = 'left',
  className = '',
}: {
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  return (
    <td
      className={`h-12 px-3 align-middle ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </td>
  )
}
