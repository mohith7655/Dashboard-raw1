import { Activity, Coins, Plug } from 'lucide-react'
import type { MarkifactAccount, MarkifactLog } from '../../lib/types'
import { formatInteger, formatPercent } from '../../lib/format'
import { DataTable, type Column } from '../DataTable'
import { Pill, PILL_COLORS } from '../Pill'
import { SectionLabel } from '../SectionLabel'
import { StatRows, type StatRowData } from '../StatRows'
import { Skeleton } from '../Skeleton'

interface MarkifactSectionProps {
  account: MarkifactAccount | undefined
  loading: boolean
  error: string | null
}

/** Platform slugs as Markifact names them, in the words the rest of the dashboard uses. */
const PLATFORM_LABELS: Record<string, string> = {
  gads: 'Google Ads',
  ga4: 'Google Analytics 4',
  gsc: 'Search Console',
  gmc: 'Merchant Center',
  gtm: 'Tag Manager',
  meta_ads: 'Meta Ads',
  openai_ads: 'OpenAI Ads',
  ai_openai: 'OpenAI',
  drive: 'Google Drive',
  sheets: 'Google Sheets',
  hubspot: 'HubSpot',
  slack: 'Slack',
}

const platformLabel = (type: string): string => PLATFORM_LABELS[type] ?? type

/** Unix seconds to a readable local moment. */
const at = (seconds: number): string =>
  seconds ? new Date(seconds * 1000).toLocaleString() : '—'

/**
 * The automation running beside the dashboard, not the marketing it manages.
 *
 * Worth saying plainly, because the name invites the other reading: Markifact's
 * REST API carries no marketing metrics at all. Its 500+ operations are reachable
 * only over MCP, which authenticates with OAuth and refuses the API key a
 * function can hold. What the key does reach is the workspace — which platforms
 * are still authorised, what the credit allowance has left, and which operations
 * the agents have been running.
 *
 * That is worth a panel on its own terms. An agent that quietly started failing,
 * or one operation burning the month's credits, is invisible until somebody
 * adds up the log.
 */
export function MarkifactSection({ account, loading, error }: MarkifactSectionProps) {
  if (loading) {
    return (
      <section className="flex flex-col gap-4">
        <SectionLabel>Markifact</SectionLabel>
        <div className="card">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-2/3" />
        </div>
      </section>
    )
  }

  if (error || !account) {
    return (
      <section className="flex flex-col gap-4">
        <SectionLabel>Markifact</SectionLabel>
        <div className="card">
          <p className="text-[13px] text-muted">{error ?? 'Markifact unavailable.'}</p>
        </div>
      </section>
    )
  }

  const { credits, connections, operations, logs } = account
  const failures = logs.filter((log) => log.status !== 'success').length
  const totalLoggedCredits = operations.reduce((sum, row) => sum + row.credits, 0)

  const creditRows: StatRowData[] = [
    {
      label: 'Allowance',
      value: formatInteger(credits.limit),
      kind: 'total',
      share: null,
      change: null,
    },
    {
      label: 'Used',
      value: formatInteger(credits.used),
      kind: 'part',
      share: credits.limit ? credits.used / credits.limit : 0,
      change: null,
      polarity: 'down-good',
    },
    {
      label: 'Remaining',
      value: formatInteger(credits.remaining),
      kind: 'part',
      share: credits.limit ? credits.remaining / credits.limit : 0,
      change: null,
    },
  ]

  return (
    <section className="flex flex-col gap-4">
      <div>
        <SectionLabel>Markifact</SectionLabel>
        <p className="mt-1 max-w-prose text-[12px] leading-relaxed text-muted">
          The automation workspace, not the marketing in it. Markifact&apos;s API
          key reaches connections, credits and the operation log; the report
          operations themselves are MCP-only and are not readable from here.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="kpi-label truncate">Credits</div>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
                <span className="kpi-value">{formatInteger(credits.remaining)}</span>
                <span className="text-[12px] text-muted">
                  left of {formatInteger(credits.limit)} · {credits.tier} tier
                </span>
              </div>
              <p className="mt-1 text-[12px] text-muted">
                Resets {at(credits.periodEnd)}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-icon-btn text-muted">
              <Coins size={15} strokeWidth={2} />
            </span>
          </div>
          <StatRows rows={creditRows} />
        </div>

        <div className="card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="kpi-label truncate">Connections</div>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
                <span className="kpi-value">{connections.length}</span>
                <span className="text-[12px] text-muted">platforms authorised</span>
              </div>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-icon-btn text-muted">
              <Plug size={15} strokeWidth={2} />
            </span>
          </div>

          <ul className="mt-3 flex flex-col border-t border-row-line pt-1">
            {connections.map((connection) => (
              <li
                key={connection.id}
                className="flex items-baseline justify-between gap-3 py-1"
              >
                <span className="truncate text-[12px] font-medium text-ink">
                  {platformLabel(connection.type)}
                </span>
                <span
                  className="shrink-0 truncate text-[11px] text-muted"
                  title={connection.displayName}
                >
                  {connection.displayName}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="kpi-label truncate">Operations run</div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
              <span className="kpi-value">{formatInteger(logs.length)}</span>
              <span className="text-[12px] text-muted">
                most recent
                {failures > 0 && (
                  <span className="text-neg">
                    {' '}
                    · {failures} failed ({formatPercent(failures / logs.length)})
                  </span>
                )}
              </span>
            </div>
            <p className="mt-1 max-w-prose text-[12px] leading-relaxed text-muted">
              Ranked by credits spent. One operation quietly consuming the
              month&apos;s allowance, or an agent that started failing, is
              invisible until the log is added up.
            </p>
          </div>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-icon-btn text-muted">
            <Activity size={15} strokeWidth={2} />
          </span>
        </div>

        <StatRows
          rows={operations.slice(0, 12).map<StatRowData>((row) => ({
            // The failure count rides on the label rather than the figure
            // column, which is spoken for by the credits this is ranked on.
            label: row.failures > 0
              ? `${row.operationId} · ${row.failures} failed`
              : row.operationId,
            value: `${formatInteger(row.credits)} cr`,
            kind: 'total',
            // Share of the credits actually accounted for by these logs, not of
            // the month's allowance — the log is one page, not the whole period.
            share: totalLoggedCredits ? row.credits / totalLoggedCredits : null,
            change: null,
            polarity: 'down-good',
          }))}
        />
      </div>

      <DataTable
        title="Recent operations"
        subtitle="Newest first, as Markifact logged them. A cached run costs nothing and is marked as such."
        columns={LOG_COLUMNS}
        rows={logs.slice(0, 25)}
        rowKey={(row) => row.id}
        total={Math.min(logs.length, 25)}
        page={1}
        perPage={25}
        onPageChange={() => {}}
        loading={false}
        noun="operations"
      />
    </section>
  )
}

const LOG_COLUMNS: Column<MarkifactLog>[] = [
  {
    key: 'operationId',
    header: 'Operation',
    width: 'min-w-[220px]',
    skeletonWidth: 'w-44',
    render: (row) => (
      <span className="block max-w-[300px] truncate text-ink" title={row.operationId}>
        {row.operationId}
      </span>
    ),
  },
  {
    key: 'source',
    header: 'Run by',
    skeletonWidth: 'w-28',
    render: (row) => (
      <span className="block max-w-[200px] truncate text-muted" title={row.source}>
        {row.source}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    skeletonWidth: 'w-16',
    render: (row) => (
      <Pill color={row.status === 'success' ? PILL_COLORS.green : PILL_COLORS.red}>
        {row.status}
      </Pill>
    ),
  },
  {
    key: 'startedAt',
    header: 'When',
    skeletonWidth: 'w-32',
    render: (row) => <span className="text-muted">{at(row.startedAt)}</span>,
  },
  {
    key: 'creditsUsed',
    header: 'Credits',
    align: 'right',
    skeletonWidth: 'w-10',
    render: (row) => (
      <span className="tabular-nums text-ink">
        {row.cacheHit ? 'cached' : formatInteger(row.creditsUsed)}
      </span>
    ),
  },
]
