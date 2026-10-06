import { useId, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Megaphone, UserPlus } from 'lucide-react'
import type { AdsMetrics, LeadReport } from '../../lib/types'
import { formatDeltaPercent, formatInteger, formatPercent } from '../../lib/format'
import { RowsCard } from '../RowsCard'
import { SectionLabel } from '../SectionLabel'
import {
  AnalyseButton,
  SectionAnalysis,
  type SectionAnalysisWiring,
} from '../SectionAnalysis'
import type { StatRowData } from '../StatRows'
import { Skeleton } from '../Skeleton'
import { LeadsOverTime } from '../charts/LeadsOverTime'
import { LeadCampaigns } from './LeadCampaigns'
import { LeadPurchases } from './LeadPurchases'

interface LeadsSectionProps {
  report: LeadReport | undefined
  loading: boolean
  failed: boolean
  range: { start: string; end: string }
  against: { start: string; end: string } | null
  meta: AdsMetrics | undefined
  analysis: SectionAnalysisWiring
}

/** Meta and Gravity Forms leads, both from Mailchimp Raww Gym Tips. */
export function LeadsSection({
  report,
  loading,
  failed,
  range,
  against,
  meta,
  analysis,
}: LeadsSectionProps) {
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const analysisId = useId()
  const leadCount = report?.sources.facebook.count
  const gravityCount = report?.sources.gravity.count
  const contactsWithoutOrders = report?.uniqueContacts.count
  const gravityWithoutOrders = report?.gravityWithoutOrders.count
  const costPerLead = useMemo(() => {
    const spend = meta?.spend.value ?? null
    if (!leadCount?.value || spend === null) return null
    return spend / leadCount.value
  }, [leadCount, meta])

  const formRows = useMemo((): StatRowData[] => {
    if (!report) return []
    return report.campaigns.map((row) => ({
        label: row.name,
        value: formatInteger(row.leads),
        kind: 'part' as const,
        share: null,
        change: null,
        polarity: 'up-good' as const,
      }))
  }, [report])

  const snapshotOf = (): Record<string, unknown> => ({
    range,
    comparison: against,
    currency: 'USD',
    mailchimpTaggedMetaLeads: leadCount?.value ?? null,
    gravityFormsLeads: gravityCount?.value ?? null,
    gravityFormsContactsWithZeroWooOrders: gravityWithoutOrders?.value ?? null,
    uniqueLeadContactsWithZeroWooOrders: contactsWithoutOrders?.value ?? null,
    costPerMetaLead: costPerLead,
    metaSpend: meta?.spend.value ?? null,
    // The lead list is every email in the range; an analysis needs the totals,
    // not hundreds of addresses.
    report: report
      ? {
          ...report,
          leadPurchases: {
            facebook: { ...report.leadPurchases.facebook, contacts: [] },
            gravity: { ...report.leadPurchases.gravity, contacts: [] },
          },
        }
      : null,
  })

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel size="lg" glyph={<UserPlus size={16} className="text-muted" />}>
          Leads
        </SectionLabel>
        <div className="mb-3 flex shrink-0 items-center gap-1">
          <AnalyseButton
            open={analysisOpen}
            onRun={() => analysis.onAnalyse(analysis.prompt ?? '', snapshotOf())}
            hasResult={!!analysis.result}
            panelId={analysisId}
            label="Leads"
            onToggle={() => setAnalysisOpen((current) => !current)}
            running={analysis.running}
            disabled={loading}
          />
        </div>
      </div>

      <SectionAnalysis
        onToggle={() => setAnalysisOpen((current) => !current)}
        section="leads"
        label="Leads"
        open={analysisOpen}
        panelId={analysisId}
        prompt={analysis.prompt}
        onSavePrompt={analysis.onSavePrompt}
        savingPrompt={analysis.savingPrompt}
        promptError={analysis.promptError}
        onAnalyse={(prompt) => analysis.onAnalyse(prompt, snapshotOf())}
        running={analysis.running}
        result={analysis.result}
        analysisError={analysis.analysisError}
      />

      {loading ? (
        <div className="card">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-3/5" />
        </div>
      ) : failed ? (
        <RowsCard
          title="Leads unavailable"
          icon={Megaphone}
          rows={[]}
          unavailable="Leads unavailable"
        />
      ) : (
        <>
          {report && !report.orderHistory.ready && (
            <p className="rounded-lg border border-btn-border px-3 py-2 text-[11px] leading-relaxed text-label">
              Reading the WooCommerce order history, newest first ({formatPercent(report.orderHistory.progress)} done). Recent orders are in; older ones are still loading, so "Previously purchased" can rise until it finishes. Reload to update.
            </p>
          )}
          {report && (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Headline
                label="Meta leads"
                value={formatInteger(leadCount?.value ?? 0)}
                change={leadCount?.deltaPct ?? null}
                note="FB lead contacts Make.com added to Mailchimp"
              />
              <Headline
                label="Gravity Forms leads"
                value={formatInteger(gravityCount?.value ?? 0)}
                change={gravityCount?.deltaPct ?? null}
                note="Learn Barehand and Barehand popup form entries"
              />
              <Headline
                label="Gravity Forms · 0 orders"
                value={formatInteger(gravityWithoutOrders?.value ?? 0)}
                change={gravityWithoutOrders?.deltaPct ?? null}
                note="Gravity Forms emails with no Woo order"
              />
              <Headline
                label="Unique contacts · 0 orders"
                value={formatInteger(contactsWithoutOrders?.value ?? 0)}
                change={contactsWithoutOrders?.deltaPct ?? null}
                note="Distinct Meta and form emails with no Woo order"
              />
            </div>
          )}

          <LeadsOverTime data={report?.series ?? []} />

          {report && report.campaigns.length > 0 && (
            <RowsCard
              title="Lead source tags"
              icon={Megaphone}
              rows={formRows}
              subtitle="Each contact counted once. Meta leads carry Make.com's FB lead tags in Mailchimp Raww Gym Tips; Gravity Forms leads are form entries, dated when they were submitted, by form."
            />
          )}
          {report && <LeadCampaigns rows={report.metaCampaigns} />}
          {report && <LeadPurchases reports={report.leadPurchases} />}
        </>
      )}
    </section>
  )
}

function Headline({
  label,
  value,
  note,
  change = null,
}: {
  label: string
  value: string
  note: string
  change?: number | null
}) {
  return (
    <div className="min-w-0 rounded-lg border border-btn-border px-3 py-2.5">
      <div className="truncate text-[10.5px] uppercase tracking-wide text-label">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="truncate text-[24px] font-semibold leading-tight tabular-nums text-ink">
          {value}
        </span>
        {change !== null && (
          <span
            className={`flex items-center gap-0.5 text-[11px] tabular-nums ${
              change === 0 ? 'text-muted' : change > 0 ? 'text-pos' : 'text-neg'
            }`}
          >
            {change < 0 ? <ArrowDown size={10} strokeWidth={3} /> : <ArrowUp size={10} strokeWidth={3} />}
            {formatDeltaPercent(change)}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-[11px] text-label">{note}</div>
    </div>
  )
}

export type { StatRowData }
