import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Column } from '../DataTable'
import { DataTable, paginateRows } from '../DataTable'
import { formatDay, formatInteger, formatPercent } from '../../lib/format'
import type { MailchimpPushContact, MailchimpPushReport } from '../../lib/types'
import { ChartCard, TooltipCard } from '../charts/ChartCard'

const PER_PAGE = 25

export function MailchimpPushConversion({ report }: { report: MailchimpPushReport }) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(report.contacts.length / PER_PAGE))
  const currentPage = Math.min(page, pageCount)
  const visibleContacts = useMemo(
    () => paginateRows(report.contacts, currentPage, PER_PAGE),
    [report.contacts, currentPage],
  )
  const columns = useMemo<Column<MailchimpPushContact>[]>(() => [
    {
      key: 'email',
      header: 'Email',
      width: 'min-w-[250px]',
      render: (contact) => <span className="text-ink">{contact.email}</span>,
    },
    {
      key: 'addedAt',
      header: 'FB Lead-Ads tag date',
      render: (contact) => <span className="text-muted">{formatDay(contact.addedAt)}</span>,
    },
    {
      key: 'purchaseHistory',
      header: 'WooCommerce history',
      render: (contact) => {
        const label = contact.purchasedBefore && contact.purchasedAfter
          ? 'Repeat purchase after tag'
          : contact.purchasedBefore
            ? 'Bought before tag'
            : contact.orderCount === 0
            ? 'No orders'
            : contact.purchasedAfter
              ? 'Bought after tag'
              : 'Same-day / date unclear'
        const color = contact.purchasedBefore || contact.purchasedAfter
          ? 'text-pos'
          : contact.orderCount === 0
            ? 'text-muted'
            : 'text-label'
        return <span className={color}>{label}</span>
      },
    },
    {
      key: 'orders',
      header: 'Orders',
      align: 'right',
      width: 'w-24',
      render: (contact) => formatInteger(contact.orderCount),
    },
    {
      key: 'firstOrderDate',
      header: 'First order',
      render: (contact) => contact.firstOrderDate ? formatDay(contact.firstOrderDate) : '—',
    },
    {
      key: 'lastOrderDate',
      header: 'Last order',
      render: (contact) => contact.lastOrderDate ? formatDay(contact.lastOrderDate) : '—',
    },
  ], [])

  const chartData = [
    { outcome: 'Purchased after tag', contacts: report.purchasedAfter, fill: '#34d399' },
    { outcome: 'No later purchase', contacts: Math.max(0, report.total - report.purchasedAfter), fill: '#64748b' },
  ]

  return (
    <section className="flex flex-col gap-4">
      {report.pending > 0 && (
        <p className="rounded-lg border border-btn-border px-3 py-2 text-[11px] leading-relaxed text-label">
          Reading the FB Lead-Ads tag date for {formatInteger(report.pending)} contacts from Mailchimp. The figures below fill in over the next few minutes; reload to update.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <Metric label="FB Lead-Ads pushed" value={report.total} note="Mailchimp contacts in selected dates" />
        <Metric label="Purchased after tag" value={report.purchasedAfter} note="WooCommerce order after being tagged" />
        <Metric label="Previously purchased" value={report.previouslyPurchased} note="First Woo order was before the tag date" />
        <Metric label="No Woo orders" value={report.noPurchase} note="No purchase history found" />
        <div className="min-w-0 rounded-lg border border-btn-border px-3 py-2.5">
          <div className="truncate text-[10.5px] uppercase tracking-wide text-label">Conversion rate</div>
          <div className="mt-1 truncate text-[24px] font-semibold leading-tight tabular-nums text-ink">
            {formatPercent(report.conversionRate)}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-label">Purchased after tag ÷ tagged contacts</div>
        </div>
      </div>

      <ChartCard
        title="Mailchimp lead purchases"
        subtitle={`${report.tag} contacts · ${formatInteger(report.purchasedAfter)} of ${formatInteger(report.total)} purchased after the tag was added · ${formatPercent(report.conversionRate)} conversion`}
        height={250}
        unavailable={report.total === 0
          ? report.pending > 0
            ? 'Tag dates are still being read from Mailchimp.'
            : 'No FB Lead-Ads contacts were tagged in this date range.'
          : undefined}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid stroke="#232327" strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="outcome"
              tick={{ fill: '#8a8a92', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#262629' }}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: '#8a8a92', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={42}
            />
            <Tooltip
              cursor={{ fill: '#232327', opacity: 0.55 }}
              content={({ active, payload }) => {
                const point = payload?.[0]?.payload as typeof chartData[number] | undefined
                if (!active || !point) return null
                return (
                  <TooltipCard>
                    <p className="font-medium">{point.outcome}</p>
                    <p className="mt-1 tabular-nums">{formatInteger(point.contacts)} contacts</p>
                  </TooltipCard>
                )
              }}
            />
            <Bar dataKey="contacts" name="Contacts" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {chartData.map((point) => <Cell key={point.outcome} fill={point.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <DataTable
        title="FB Lead-Ads contacts"
        subtitle="Contacts tagged by Make.com in Mailchimp Raww Gym Tips, matched to WooCommerce customers by email. Purchase dates are compared with the tag date."
        columns={columns}
        rows={visibleContacts}
        rowKey={(contact) => contact.email}
        total={report.contacts.length}
        page={currentPage}
        perPage={PER_PAGE}
        onPageChange={setPage}
        noun="contacts"
        unavailable={report.contacts.length === 0 ? 'No contacts in this period.' : undefined}
      />
      <p className="px-1 text-[11px] leading-relaxed text-muted">
        Conversion counts a WooCommerce order dated after the FB Lead-Ads tag was added. Existing customers are identified separately; a same-day order cannot be reliably ordered against the tag with date-only timestamps. “No later purchase” can include someone who bought before the tag. Customer tags are not counted as leads.
      </p>
    </section>
  )
}

export function Metric({ label, value, note }: { label: string; value: number | string; note: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-btn-border px-3 py-2.5">
      <div className="truncate text-[10.5px] uppercase tracking-wide text-label">{label}</div>
      <div className="mt-1 truncate text-[24px] font-semibold leading-tight tabular-nums text-ink">
        {typeof value === 'number' ? formatInteger(value) : value}
      </div>
      <div className="mt-0.5 text-[11px] text-label">{note}</div>
    </div>
  )
}
