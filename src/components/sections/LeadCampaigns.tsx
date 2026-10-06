import { useMemo, useState } from 'react'
import type { Column } from '../DataTable'
import { DataTable, paginateRows } from '../DataTable'
import { formatCurrency, formatInteger, formatPercent } from '../../lib/format'
import type { LeadCampaignOutcome } from '../../lib/types'

const PER_PAGE = 15

/** Meta leads in the range by campaign: what each cost, and what the leads went on to buy. */
export function LeadCampaigns({ rows }: { rows: LeadCampaignOutcome[] }) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(rows.length / PER_PAGE))
  const currentPage = Math.min(page, pageCount)
  const visibleRows = useMemo(() => paginateRows(rows, currentPage, PER_PAGE), [rows, currentPage])

  const columns = useMemo<Column<LeadCampaignOutcome>[]>(() => {
    // Order columns only mean something for a campaign with leads in Mailchimp.
    const ofLeads = (row: LeadCampaignOutcome, value: number) => (row.formLeads ? formatInteger(value) : '—')
    return [
      {
        key: 'campaign',
        header: 'Campaign',
        width: 'min-w-[240px]',
        render: (row) => <span className={row.spend === null ? 'text-muted' : 'text-ink'}>{row.campaign}</span>,
      },
      {
        key: 'spend',
        header: 'Spend',
        align: 'right',
        render: (row) => (row.spend === null ? '—' : formatCurrency(row.spend)),
      },
      {
        key: 'metaLeads',
        header: 'Meta leads',
        align: 'right',
        render: (row) => (row.metaLeads === null ? '—' : formatInteger(row.metaLeads)),
      },
      {
        key: 'costPerLead',
        header: 'Cost per lead',
        align: 'right',
        render: (row) => (row.spend !== null && row.metaLeads ? formatCurrency(row.spend / row.metaLeads) : '—'),
      },
      {
        key: 'formLeads',
        header: 'In Mailchimp',
        align: 'right',
        render: (row) => formatInteger(row.formLeads),
      },
      {
        key: 'noOrders',
        header: 'No orders',
        align: 'right',
        render: (row) => ofLeads(row, row.noOrders),
      },
      {
        key: 'boughtBefore',
        header: 'Bought before',
        align: 'right',
        render: (row) => ofLeads(row, row.boughtBefore),
      },
      {
        key: 'boughtAfter',
        header: 'Bought after',
        align: 'right',
        render: (row) => <span className={row.boughtAfter > 0 ? 'text-pos' : undefined}>{ofLeads(row, row.boughtAfter)}</span>,
      },
      {
        key: 'conversion',
        header: 'Conversion',
        align: 'right',
        render: (row) => (row.formLeads ? formatPercent(row.boughtAfter / row.formLeads) : '—'),
      },
    ]
  }, [])

  return (
    <section className="flex flex-col gap-2">
      <DataTable
        title="Meta leads by campaign"
        subtitle="Every Meta campaign that spent in the selected dates. Meta leads and cost per lead are Meta's own count, instant forms and website leads together; the order columns follow the instant-form leads that reached Mailchimp."
        columns={columns}
        rows={visibleRows}
        rowKey={(row) => row.campaign}
        total={rows.length}
        page={currentPage}
        perPage={PER_PAGE}
        onPageChange={setPage}
        noun="campaigns"
        unavailable={rows.length === 0 ? 'No Meta campaign spent or brought a lead in this period.' : undefined}
      />
      <p className="px-1 text-[11px] leading-relaxed text-muted">
        Conversion is a WooCommerce order dated after the lead, divided by the campaign's leads in Mailchimp. Website leads reach Meta through the pixel without an email, so sales campaigns show Meta's lead count but no order columns. Meta attributes a form lead to its campaign for 90 days; leads older than that when first read are listed as “No campaign on record”.
      </p>
    </section>
  )
}
