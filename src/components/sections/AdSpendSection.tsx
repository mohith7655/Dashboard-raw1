import { useMemo, useState } from 'react'
import { Megaphone } from 'lucide-react'
import type { AdsMetrics, SortDirection, WooMetrics } from '../../lib/types'
import {
  blendedAds,
  campaignRows,
  type CampaignRow,
  type CampaignSortField,
} from '../../lib/pnl'
import {
  formatCtr,
  formatCurrency,
  formatInteger,
  formatPercent,
  formatRoas,
} from '../../lib/format'
import { DataTable, paginateRows, type Column } from '../DataTable'
import { RowsCard } from '../RowsCard'
import type { StatRowData } from '../StatRows'
import { SectionLabel } from '../SectionLabel'
import { Skeleton } from '../Skeleton'

interface AdSpendSectionProps {
  woo: WooMetrics | undefined
  /** Only platforms that answered — a failed one is absent, never zero. */
  reportedAds: { name: string; metrics: AdsMetrics }[]
  loading: boolean
  wooFailed: boolean
  /**
   * Each platform's own figures, folded behind its heading.
   *
   * Passed in rather than built from `reportedAds`: a platform that failed is
   * absent from that list by design, and these sections say so out loud
   * instead of quietly disappearing. They live on this tab because it is the
   * one about ad spend — on the overview they were three collapsed headings
   * between the store's figures and its charts.
   */
  platformSections?: React.ReactNode
}

const PER_PAGE = 10

export function AdSpendSection({
  woo,
  reportedAds,
  loading,
  wooFailed,
  platformSections,
}: AdSpendSectionProps) {
  const blended = blendedAds(woo, reportedAds)
  const shared = { loading, unavailable: wooFailed || !blended }

  const [sort, setSort] = useState<CampaignSortField>('spend')
  const [direction, setDirection] = useState<SortDirection>('desc')
  const [page, setPage] = useState(1)

  const campaigns = useMemo(
    () => campaignRows(reportedAds, sort, direction),
    [reportedAds, sort, direction],
  )

  // The range can change under a page that no longer exists.
  const pageCount = Math.max(1, Math.ceil(campaigns.length / PER_PAGE))
  const safePage = Math.min(page, pageCount)

  const onSortChange = (key: string) => {
    const field = key as CampaignSortField
    if (field === sort) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSort(field)
      setDirection('desc')
    }
    setPage(1)
  }

  /**
   * The blended four as rows.
   *
   * Spend heads them: the three below are all that same figure divided by
   * something — by revenue, into a share of revenue, and per order. Set as rows
   * that descent is visible; as four tiles they read as four separate facts
   * that happen to be about advertising.
   */
  const summary: StatRowData[] = blended
    ? [
        {
          label: 'Total ad spend',
          value: formatCurrency(blended.spend),
          kind: 'total',
          share: null,
          change: null,
          polarity: 'down-good',
        },
        {
          label: 'Blended ROAS',
          value: formatRoas(blended.blendedRoas),
          kind: 'part',
          share: null,
          change: null,
        },
        {
          label: 'Spend % of revenue',
          value: formatPercent(blended.shareOfRevenue),
          kind: 'part',
          share: null,
          change: null,
          polarity: 'down-good',
        },
        {
          label: 'Ad cost per order',
          value: formatCurrency(blended.costPerOrder),
          kind: 'part',
          share: null,
          change: null,
          polarity: 'down-good',
        },
      ]
    : []

  return (
    <section className="flex flex-col gap-4">
      <div>
        <SectionLabel>Ad Spend</SectionLabel>

        <RowsCard
          title="All ads, blended"
          icon={Megaphone}
          rows={summary}
          loading={shared.loading}
          unavailable={
            shared.unavailable ? 'Blended figures need the store\u2019s own revenue, which did not load.' : null
          }
        />
      </div>

      <div className="card p-0">
        <div className="px-5 pb-4 pt-5">
          <h3 className="text-[15px] font-semibold text-ink">By platform</h3>
          <p className="mt-0.5 text-[12px] text-muted">
            Blended ROAS divides store revenue by spend; the per-platform figure is
            each platform&apos;s own attribution.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col gap-3 px-5 pb-5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : !blended ? (
          <div className="px-5 pb-6 text-[13px] text-muted">
            No ad platform reported for this period. Connect Meta or Google Ads to
            see spend here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line text-left">
                  <Th className="pl-5">Platform</Th>
                  <Th align="right">Spend</Th>
                  <Th align="right">ROAS</Th>
                  <Th align="right" className="pr-5">
                    Conversions
                  </Th>
                </tr>
              </thead>
              <tbody>
                {blended.platforms.map((platform) => (
                  <tr
                    key={platform.name}
                    className="border-b border-row-line last:border-0"
                  >
                    <Td className="pl-5 text-ink">{platform.name}</Td>
                    <Td align="right" className="tabular-nums text-ink">
                      {formatCurrency(platform.spend)}
                    </Td>
                    <Td align="right" className="tabular-nums text-muted">
                      {formatRoas(platform.roas)}
                    </Td>
                    <Td align="right" className="pr-5 tabular-nums text-muted">
                      {formatInteger(platform.conversions)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Between the platform table and the campaigns: the same platforms, one
          step further in, and one step short of the campaigns inside them. */}
      {platformSections && <div className="flex flex-col gap-4">{platformSections}</div>}

      <DataTable
        title="Campaigns"
        subtitle="Every campaign that spent or served in this period, ranked across both platforms. Each figure is its own platform's attribution."
        columns={CAMPAIGN_COLUMNS}
        rows={paginateRows(campaigns, safePage, PER_PAGE)}
        rowKey={(row) => `${row.platform}:${row.id}`}
        total={campaigns.length}
        page={safePage}
        perPage={PER_PAGE}
        onPageChange={setPage}
        sort={sort}
        direction={direction}
        onSortChange={onSortChange}
        loading={loading}
        noun="campaigns"
        unavailable={
          !loading && reportedAds.length === 0
            ? 'No ad platform reported for this period.'
            : undefined
        }
      />
    </section>
  )
}

const CAMPAIGN_COLUMNS: Column<CampaignRow>[] = [
  {
    key: 'name',
    header: 'Campaign',
    width: 'min-w-[220px]',
    skeletonWidth: 'w-44',
    render: (row) => <span className="text-ink">{row.name}</span>,
  },
  {
    key: 'platform',
    header: 'Platform',
    skeletonWidth: 'w-20',
    render: (row) => <span className="text-muted">{row.platform}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    skeletonWidth: 'w-14',
    render: (row) => <CampaignStatus status={row.status} />,
  },
  {
    key: 'spend',
    header: 'Spend',
    align: 'right',
    sortable: true,
    skeletonWidth: 'w-16',
    render: (row) => (
      <span className="tabular-nums text-ink">{formatCurrency(row.spend)}</span>
    ),
  },
  {
    key: 'impressions',
    header: 'Impressions',
    align: 'right',
    sortable: true,
    skeletonWidth: 'w-16',
    render: (row) => (
      <span className="tabular-nums text-muted">
        {formatInteger(row.impressions)}
      </span>
    ),
  },
  {
    key: 'clicks',
    header: 'Clicks',
    align: 'right',
    sortable: true,
    skeletonWidth: 'w-12',
    render: (row) => (
      <span className="tabular-nums text-muted">{formatInteger(row.clicks)}</span>
    ),
  },
  {
    key: 'ctr',
    header: 'CTR',
    align: 'right',
    sortable: true,
    skeletonWidth: 'w-12',
    render: (row) => (
      <span className="tabular-nums text-muted">{formatCtr(row.ctr)}</span>
    ),
  },
  {
    key: 'conversions',
    header: 'Conversions',
    align: 'right',
    sortable: true,
    skeletonWidth: 'w-12',
    render: (row) => (
      <span className="tabular-nums text-muted">
        {formatInteger(row.conversions)}
      </span>
    ),
  },
  {
    key: 'roas',
    header: 'ROAS',
    align: 'right',
    sortable: true,
    skeletonWidth: 'w-12',
    render: (row) => (
      <span className="tabular-nums text-ink">{formatRoas(row.roas)}</span>
    ),
  },
]

/** Colour is a second cue here; the word itself always carries the meaning. */
function CampaignStatus({ status }: { status: string }) {
  if (!status) return <span className="text-muted">—</span>

  const tone =
    status === 'Active'
      ? 'text-emerald-400'
      : status === 'Paused'
        ? 'text-amber-400'
        : 'text-muted'

  return <span className={tone}>{status}</span>
}

function Th({
  children,
  align = 'left',
  className = '',
}: {
  children: React.ReactNode
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
  children: React.ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  return (
    <td
      className={`h-11 px-3 align-middle ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </td>
  )
}
