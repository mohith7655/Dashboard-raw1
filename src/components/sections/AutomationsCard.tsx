import { useState, type ReactNode } from 'react'
import { ChevronDown, Clock, GitBranch, Mail } from 'lucide-react'
import type {
  MailchimpAutomation,
  MailchimpAutomationTotals,
  MailchimpJourney,
  MailchimpStage,
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
  /** The email line above the flows — see `MailchimpAutomationTotals`. */
  totals: MailchimpAutomationTotals
}

/**
 * The automations, opened at the ones still running.
 *
 * This was two tables of every flow the account has ever had, live and paused
 * together, ranked by lifetime volume — which put a series switched off in
 * 2024 at the top on the strength of a quarter of a million old sends and
 * buried the two sending today. Nothing on it answered what a running
 * automation is actually read for: where people are right now. A lifetime
 * total cannot answer that.
 *
 * So the live flows lead, and they lead in full — stage by stage, with the
 * contacts queued at each and the email each stage sends. Everything paused
 * is one click away as the summary rows it was before: a paused flow's queue
 * is where people stopped rather than where they are heading, so a summary is
 * the honest shape for it and the stage view is not.
 */
export function AutomationsCard({
  automations,
  journeys,
  totals,
}: AutomationsCardProps) {
  const [showAll, setShowAll] = useState(false)

  if (automations.length === 0 && journeys.length === 0) return null

  const liveJourneys = journeys.filter((j) => j.status === 'sending')
  const liveAutomations = automations.filter((a) => a.status === 'sending')
  const restJourneys = journeys.filter((j) => j.status !== 'sending')
  const restAutomations = automations.filter((a) => a.status !== 'sending')
  const rest = restJourneys.length + restAutomations.length
  const nothingLive = liveJourneys.length === 0 && liveAutomations.length === 0

  return (
    <div className="card p-0">
      <EmailHeader totals={totals} />

      {nothingLive ? (
        <p className="px-5 py-4 text-[13px] text-muted">
          Nothing is sending. Every flow on the account is paused.
        </p>
      ) : (
        <div className="flex flex-col">
          {liveJourneys.map((j) => (
            <Flow
              key={`journey-${j.id}`}
              name={j.name}
              meta={[j.listName, since(j.startedAt)]}
              stages={j.stages}
              inFlow={j.inProgress}
              entered={j.started}
            />
          ))}
          {liveAutomations.map((a) => (
            <Flow
              key={`automation-${a.id}`}
              name={a.title}
              meta={[since(a.startedAt)]}
              stages={a.stages}
              /*
               * Left off for a classic series rather than filled in. The
               * classic API reports emails and never contacts — there is no
               * figure on it for how many people are inside the series, and
               * putting the send count under a heading that says "in flow"
               * would answer the question with a different quantity.
               */
              inFlow={null}
              entered={null}
            />
          ))}
        </div>
      )}

      {rest > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowAll((open) => !open)}
            aria-expanded={showAll}
            className="flex w-full items-center justify-between gap-3 border-t border-line px-5 py-3 text-left transition-colors hover:bg-btn/40"
          >
            <span className="min-w-0">
              <span className="block text-[12px] font-medium text-ink">
                {showAll ? 'Hide the rest' : 'View all other automations'}
              </span>
              <span className="mt-0.5 block text-[11.5px] text-muted">
                {formatInteger(rest)} paused, with their lifetime figures
              </span>
            </span>
            <ChevronDown
              size={16}
              className={`shrink-0 text-muted transition-transform ${
                showAll ? 'rotate-180' : ''
              }`}
            />
          </button>

          {showAll && (
            <div className="border-t border-line">
              {restJourneys.length > 0 && (
                <>
                  <Subhead label="Automation flows" note="Contacts, since each started" />
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] border-collapse text-[13px]">
                      <thead>
                        <tr className="border-b border-line text-left">
                          <Th className="pl-5">Journey</Th>
                          <Th align="right">Entered</Th>
                          <Th align="right">Stopped inside</Th>
                          <Th align="right" className="pr-5">
                            Completed
                          </Th>
                        </tr>
                      </thead>
                      <tbody>
                        {restJourneys.map((j) => (
                          <tr key={j.id} className="border-b border-row-line last:border-0">
                            <Td className="pl-5">
                              <Name
                                title={j.name}
                                sub={[j.listName, since(j.startedAt)]
                                  .filter(Boolean)
                                  .join(' · ')}
                              />
                            </Td>
                            <Td align="right" className="tabular-nums text-ink">
                              {formatInteger(j.started)}
                            </Td>
                            {/* Named for what it is on a flow that has been
                                switched off. These contacts are not in
                                progress — the thing they were progressing
                                through stopped moving. */}
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

              {restAutomations.length > 0 && (
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
                        {restAutomations.map((a) => {
                          const rate = perDay(a)
                          return (
                            <tr key={a.id} className="border-b border-row-line last:border-0">
                              <Td className="pl-5">
                                <Name title={a.title} sub={since(a.startedAt)} />
                              </Td>
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
            </div>
          )}
        </>
      )}
    </div>
  )
}

/**
 * The card's headline, which is about email rather than about flows.
 *
 * Sends lead because that is the quantity the rest divide: the two rates
 * beside it are struck from that number, and the contacts waiting are the ones
 * it has not reached yet.
 */
function EmailHeader({ totals }: { totals: MailchimpAutomationTotals }) {
  return (
    <div className="border-b border-line px-5 pb-4 pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[15px] font-semibold text-ink">Automations</h3>
        <span className="text-[12px] text-muted">
          {totals.live > 0 ? `${formatInteger(totals.live)} sending` : 'None sending'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Figure label="Emails sent" value={formatInteger(totals.emailsSent)} note="lifetime" />
        <Figure label="Open rate" value={formatPercent(totals.openRate)} note="lifetime" />
        <Figure label="Click rate" value={formatCtr(totals.clickRate)} note="lifetime" />
        {/* The one figure here that is not a lifetime total, and the only one
            that can fall as well as rise. Labelled, because a reader who took
            it for a running sum would read a flow emptying as a loss. */}
        <Figure
          label="Waiting in a flow"
          value={formatInteger(totals.waiting)}
          note="right now"
        />
      </div>
    </div>
  )
}

function Figure({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note: string
}) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10.5px] uppercase tracking-wide text-label">
        {label}
      </div>
      <div className="mt-0.5 truncate text-[19px] font-semibold leading-tight tabular-nums text-ink">
        {value}
      </div>
      <div className="truncate text-[11px] text-label">{note}</div>
    </div>
  )
}

/**
 * One running flow, stage by stage.
 *
 * Drawn as a column threaded on a rule rather than as table rows, because the
 * stages are a sequence and not a set: a contact meets them in this order, and
 * the shape should say so before any number is read.
 */
function Flow({
  name,
  meta,
  stages,
  inFlow,
  entered,
}: {
  name: string
  meta: (string | null)[]
  stages: MailchimpStage[]
  inFlow: number | null
  entered: number | null
}) {
  const sub = meta.filter(Boolean).join(' · ')

  return (
    <div className="border-b border-row-line px-5 py-4 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-pos" />
            <span className="truncate text-[13.5px] text-ink" title={name}>
              {name}
            </span>
          </div>
          {sub && <div className="truncate pl-[14px] text-[11.5px] text-label">{sub}</div>}
        </div>

        {inFlow !== null && (
          <div className="flex shrink-0 items-baseline gap-4 text-[12px] tabular-nums">
            <span className="text-muted">
              <span className="text-ink">{formatInteger(inFlow)}</span> in journey
            </span>
            {entered !== null && (
              <span className="text-label">{formatInteger(entered)} entered</span>
            )}
          </div>
        )}
      </div>

      {stages.length === 0 ? (
        <p className="mt-2 pl-[14px] text-[12px] text-label">
          Mailchimp returned no stages for this flow.
        </p>
      ) : (
        <ol className="mt-3 flex flex-col border-l border-line pl-5">
          {stages.map((stage) => (
            <Stage key={stage.id} stage={stage} />
          ))}
        </ol>
      )}
    </div>
  )
}

/** The glyph per kind, so the sequence reads as a shape before it reads as words. */
const GLYPH = {
  email: Mail,
  delay: Clock,
  condition: GitBranch,
  trigger: GitBranch,
  other: GitBranch,
} as const

function Stage({ stage }: { stage: MailchimpStage }) {
  const Icon = GLYPH[stage.kind]

  return (
    <li className="relative py-2">
      {/* Sat on the rule rather than beside it, so the column reads as one
          thread with stops on it rather than as a list with a border. */}
      <span
        aria-hidden
        className="absolute -left-[26px] top-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-card text-label"
      >
        <Icon size={11} />
      </span>

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="min-w-0 truncate text-[13px] text-ink" title={stage.label}>
          {stage.label}
        </span>

        {/* The figure the stage view exists for. Shown only where somebody is
            actually there: a nought on every stage but one is furniture, and
            the stage that matters should be the only thing wearing this. */}
        {stage.waiting > 0 && (
          <span className="shrink-0 rounded-full bg-[#eda100]/12 px-2 py-0.5 text-[11.5px] tabular-nums text-[#eda100]">
            {formatInteger(stage.waiting)} scheduled
          </span>
        )}
      </div>

      {stage.detail && (
        <div className="truncate text-[11.5px] text-label" title={stage.detail}>
          {stage.detail}
        </div>
      )}

      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 text-[11.5px] tabular-nums text-muted">
        {stage.email && stage.email.sent > 0 && (
          <>
            <span>{formatInteger(stage.email.sent)} sent</span>
            <span>{formatPercent(stage.email.openRate)} opened</span>
            <span>{formatCtr(stage.email.clickRate)} clicked</span>
          </>
        )}
        {stage.completed !== null && stage.completed > 0 && (
          <span className="text-label">{formatInteger(stage.completed)} through</span>
        )}
      </div>
    </li>
  )
}

/** "since 12 May", or nothing where Mailchimp reported no start date. */
function since(date: string | null): string | null {
  return date ? `since ${formatDay(date.slice(0, 10))}` : null
}

/**
 * Mail a day, averaged across every day since the series was switched on.
 *
 * Null where Mailchimp reported no start date, since there is then no span to
 * divide by. For a paused series the span still runs to today — the API says
 * when an automation started but never when it stopped, so the average covers
 * days it was not sending and reads low. Not corrected for, because correcting
 * for it would need a date Mailchimp does not publish.
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
    <div className="bg-btn/40 px-5 py-2">
      <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-label">
        {label}
      </div>
      <div className="text-[11.5px] text-muted">{note}</div>
    </div>
  )
}

/** A row's name and where it came from. Every row under here is paused, so
 *  there is no state left for a dot to carry. */
function Name({ title, sub }: { title: string; sub: string | null }) {
  return (
    <div className="min-w-0 max-w-[400px]">
      <div className="truncate text-ink" title={title}>
        {title}
      </div>
      {sub && <div className="truncate text-[11.5px] text-label">{sub}</div>}
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
