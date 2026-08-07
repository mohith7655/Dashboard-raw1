# Sales Dashboard

React + TypeScript sales dashboard backed by Netlify Functions. Browser requests
are sent to `/.netlify/functions/*`; API credentials remain server-side.

## Local development

```bash
npm install
npx netlify dev
```

`npm run dev` starts Netlify Dev, which serves both the Vite app and the Netlify Functions on one origin. Open the URL printed in the terminal (normally `http://localhost:8888`), not a Vite-only port such as `5173` or `5174`.
The dashboard does not use fixture or mock data. If a connector is unavailable,
the affected section shows its API error instead of invented values.

## Environment variables

Add these as Netlify Function environment variables, then redeploy:

| Variable | Used by |
| --- | --- |
| `METORIK_API_KEY` | WooCommerce, orders, customers, products, coupons, and costs |
| `META_ACCESS_TOKEN` | Meta Ads |
| `META_AD_ACCOUNT_ID` | Meta Ads |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads |
| `GOOGLE_ADS_CLIENT_ID` | Google Ads OAuth |
| `GOOGLE_ADS_CLIENT_SECRET` | Google Ads OAuth |
| `GOOGLE_ADS_REFRESH_TOKEN` | Google Ads OAuth |
| `GOOGLE_ADS_CUSTOMER_ID` | Google Ads |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Google Ads — optional, only for manager (MCC) accounts |
| `OPENAI_API_KEY` | Insights |
| `OPENAI_MODEL` | Insights — optional, defaults to `gpt-5.4` |

Use `.env.example` as the local template. Never prefix secrets with `VITE_`.

## Traffic

The Traffic tab shows visitors, conversion rate, revenue per visitor and
converting orders, plus visitors and conversion rate over time.

This data originates in Google Analytics — Metorik relays it via
`/reports/visitors-by-date` rather than measuring it, so the tab is only
populated once the GA4 integration is connected in Metorik. When it is not, the
API still answers `200` with every figure zero and a `visitor_data_available:
false` flag; the tab reads that flag and says so rather than showing a 0%
conversion rate beside a page of live orders.

Visitors are GA4's `totalUsers` — distinct people, not sessions or pageviews.
Orders here are counted on Metorik's own conversion basis, so they can differ
slightly from the paid-order total on the Overview.

Per-product views and conversion rates are **not** available from Metorik: it
pulls those directly from GA when its own pages load and excludes them from both
the API and exports.

### GA4 breakdowns

Metorik's visitor report carries **no dimensions at all** — its only options are
`group_by=day|week|month|year`. Country, landing page, page, source and device
therefore come from the GA4 Data API directly, via `netlify/functions/ga4.ts`,
and appear in the breakdown table on the Traffic tab.

This needs its own credentials, because the scopes differ: a Google Ads refresh
token carries `adwords` only and the Data API rejects it.

| Variable | Notes |
| --- | --- |
| `GA4_PROPERTY_ID` | Numeric property id — **not** the `G-XXXXXXX` measurement id. GA4 → Admin → Property settings |
| `GA4_REFRESH_TOKEN` | Must carry `analytics.readonly`. Falls back to `GOOGLE_ADS_REFRESH_TOKEN`, which works only if that token was consented for both scopes |
| `GA4_CLIENT_ID` / `GA4_CLIENT_SECRET` | Optional; fall back to the `GOOGLE_ADS_*` pair |

#### Minting the refresh token

The Google Ads OAuth flow consents `adwords` and nothing else, so pasting the
Ads refresh token into `GA4_REFRESH_TOKEN` authenticates but then fails every
Data API call with `403 ACCESS_TOKEN_SCOPE_INSUFFICIENT`. The function checks
the grant's scope list up front and names the mismatch rather than passing that
error through.

To get a token that carries both scopes:

```bash
npm run ga4:auth
```

It reads the OAuth client from `.env`, opens the consent screen, and prints a
refresh token. Set it as `GA4_REFRESH_TOKEN` in `.env` and in Netlify, then
redeploy. It can replace `GOOGLE_ADS_REFRESH_TOKEN` too.

Two prerequisites on the Google side:

- The **Google Analytics Data API** must be enabled for the Cloud project that
  owns the OAuth client.
- `http://localhost:8976/oauth2callback` must be an authorised redirect URI on
  that client — required for Web application clients, automatic for Desktop
  ones.

The Google account you consent with also needs at least Viewer on the GA4
property; API access does not inherit from the Ads link.

GA4 has renamed API fields more than once — conversions became key events,
landing page gained a query-string variant — and not every property offers every
metric. Rather than hardcode one spelling, the function resolves each field
against the property's own `metadata` endpoint from a preference list, and
reports anything unmatched to the UI instead of failing the whole report.

## Insights

The **Insights** tab reads the period's figures and writes up what changed and
what to do about it, via OpenAI's Chat Completions API in
`netlify/functions/insights.ts`.

It runs on click, never on render. Each analysis is a paid API call, and a
report that silently regenerated whenever the range changed would be both
expensive and impossible to compare against. The button stays disabled until
every connector has settled, so the model never describes a half-loaded period.

The browser posts the aggregates it is **already displaying** rather than
having the function re-fetch each connector. Two consequences worth knowing:

- The commentary describes exactly what is on screen, and a broken connector
  degrades it instead of failing it — the snapshot records that source as
  unavailable with its error, so absence is never read as zero.
- **Only aggregates leave the browser.** Totals, breakdowns and campaign names —
  no orders, customers, emails or addresses. See `buildSnapshot` in
  `src/lib/insightsSnapshot.ts`; that boundary is the reason it exists.

Output is constrained to a JSON schema — a headline, a summary, findings with
the evidence behind them, and ranked actions each carrying impact, effort and
the metric that says whether it worked. Nothing enforces that shape on the
model's side, so every field is coerced before it reaches the UI: unknown
severities fall back rather than rendering as a blank badge.

`OPENAI_MODEL` overrides the default of `gpt-5.4`. A run measures around 1.9k
prompt and 1.7k completion tokens and takes roughly 20 seconds, which is why the
button shows a spinner rather than blocking the tab. Reasoning models can spend
their whole token budget thinking and return empty content; the function reports
that as `finish_reason: length` rather than as a blank report.

> **Note:** the model is quoting figures it was handed, not recomputing them.
> Treat the findings as a reading of the dashboard, not an audit of it.

The section is mounted twice — at the head of the **Overview**, above the CEO
Dashboard, and on its own **Insights** tab. One element rendered in two places,
not two copies of the wiring.

### Scheduled reports

**Schedule** on the Insights header sets a report to be written with nobody
looking: daily, weekly or monthly, at an hour on the store's calendar, over a
named period (`yesterday`, `last 7 days`, `this month so far`…). The period is
named rather than dated so each run covers the days before *it*.

Three pieces, because the platform's limits divide it that way:

| File | Role |
| --- | --- |
| `netlify/functions/insights-cron.ts` | `@hourly` sweep. Reads the schedule, decides whether a run is owed, claims the slot and hands off. Scheduled functions are cut off at **30 seconds**. |
| `netlify/functions/insights-run-background.ts` | Does the work. Background functions get **15 minutes**, which five connectors plus a 20-second model call need. |
| `netlify/lib/insightsRun.ts` | Reads each connector over the site's own function URLs and feeds them through the same `buildSnapshot` the browser uses. |

The schedule and the last report live in one Netlify Blob
(`dashboard/insights-automation`), so a report written overnight is on screen
when someone opens the dashboard, and a report generated by hand survives a
reload.

Two consequences worth knowing:

- **Hourly granularity.** The sweep is fixed deployed configuration; the
  schedule is stored data. A report set for 08:30 is written in the 09:00 sweep.
- **Production only.** Scheduled functions run on published deploys — nothing
  fires on a deploy preview or under `netlify dev`. The settings save and the
  stored report display fine locally.

One attempt per calendar day, successful or not: each run is a paid call, and a
failing connector retried hourly would spend a day's budget by lunchtime. The
reason the last run failed is shown under the Insights header rather than left
in the function log.

## Search & Feed

Two Google surfaces the store appears on *before* anybody clicks, on one tab
because they answer halves of the same question.

**Search Console** (`netlify/functions/search-console.ts`) is the channel the
dashboard was otherwise blind to. GA4 counts the visit once somebody arrives;
only Search Console counts the impression that never became one, the query
behind it, and the average rank that decided the difference. Clicks,
impressions, CTR and average position, with deltas against the comparison
window, then broken down by query, landing page, country or device.

Two things about it worth knowing:

- **Average position is the one figure on the dashboard where down is good.**
  Rank 3 beats rank 8, so that card carries an inverted polarity and a fall
  reads green.
- **The data finalises two to three days late.** The report requests
  `dataState: all` so the recent days are present rather than missing, and
  reports `freshestDate` so the tail can be labelled. Without that, the end of
  every range reads as a traffic collapse.

**Merchant Center** (`netlify/functions/merchant-center.ts`) answers whether the
catalogue behind the Shopping ads is eligible to serve at all — item counts
(active, pending, disapproved, expiring) and every item-level issue with the
number of products it affects. Google Ads reports what the Shopping campaigns
spent; it does not report that a hundred items went disapproved on Tuesday over
a price mismatch, which is the fact that explains impressions falling while the
budget did not. One `accountstatuses` call carries all of it, so the catalogue
is never walked product by product.

> **Note:** the Content API renders int64 fields as JSON **strings** — `active`
> arrives as `"412"`. Added together untouched they concatenate, which is how a
> feed of four hundred items reports forty thousand. Every count is coerced.

Issue counts are the worst single destination rather than a sum across them: the
same issue is reported once per destination and country, and adding those up
counts the same product several times over.

### Scopes

Both need Google scopes the GA4 token does not carry. One token can serve
everything:

```bash
npm run google:auth
```

It consents `analytics.readonly`, `adwords`, `webmasters.readonly` and `content`
in a single pass, and prints which were granted. Set the result as
`GA4_REFRESH_TOKEN` — every connector falls back to it, so one variable covers
all four. The `GSC_*` and `GMC_*` credential variables exist for a deliberately
narrower token and are otherwise left blank.

A missing scope is caught at the token exchange rather than at the first API
call: Google answers a mismatch with a bare "Request had insufficient
authentication scopes", which names neither the token nor the scope. See
`netlify/lib/google.ts`.

## Markifact

The **Markifact** tab reports the automation workspace — *not* the marketing in
it, which the name invites you to expect.

Markifact's REST API carries no marketing metrics. Its 500+ operations are
reachable only over MCP, which authenticates with OAuth 2.1 + PKCE and refuses
the `mk_live_` API key a Netlify Function can hold; the REST surface is nine
endpoints covering connections, credits and operation logs. Organic search and
feed metrics therefore come from Google directly, as above.

What the key does reach is worth a panel on its own terms: which platforms are
still authorised, how much of the credit allowance is left, and which operations
the agents have been running — ranked by credits spent, with failures counted.
An agent that quietly started failing, or one operation burning the month's
allowance, is invisible until the log is added up.

Set `MARKIFACT_API_KEY`. The tab loads only when opened.

## Operating costs

The Profit & Loss tab has an editable **Operating costs** table for costs the
store itself never sees — payroll, software subscriptions, rent, contractors.
Each row carries an amount and a cadence (weekly, monthly, yearly, or a dated
one-off), and is prorated onto whichever range is selected before it reaches the
statement.

Proration follows the calendar rather than an average month, so a monthly salary
reads as exactly one month's charge over any full calendar month — February as
much as August — and a part-month range gets the matching fraction. One-off
costs count in full on their date and not at all outside it.

### Active dates

Recurring rows carry an optional **from** and **until**. A cost only applies
inside that window, so a subscription taken out on the 16th charges for sixteen
days of an August range rather than the whole month, and a cancelled one stops
counting on the day it ended. Either side can be left blank for open-ended, which
is what every existing row does.

An end before its start can never match. Rather than showing an ordinary $0.00 —
indistinguishable from a cost that simply did not run — the card names those rows
and says they never apply.

### Charge date

Every cadence takes an optional **charged** date, which switches that cost from
prorated to discrete: the range either contains a charge or it does not. A salary
paid on the 1st charges in full over `Aug 1 – Aug 15` and nothing at all over
`Aug 2 – Aug 31`, where the prorated reading would have said roughly half in both
cases.

The date is read as a point on the recurring schedule, not as a start date:

| Cadence | What the date contributes | Example |
| --- | --- | --- |
| Weekly | Its weekday | `2026-08-03` → every Monday |
| Monthly | Its day of the month | `2026-08-01` → the 1st |
| Yearly | Its month and day | `2026-04-06` → 6 April |
| One-off | The whole date; required | `2026-08-10` → that day only |

So **any** date on the schedule will do, past or future — a Monday anchor dated
next December still means every Monday, including ones already gone. Bounding
when a cost actually ran is what the active dates above are for, and the two
compose: an anchor on the 15th with an end date of 20 August charges once across
an August–September range, not twice.

The card shows the derived phrase — `every Monday`, `the 1st`, `6 Apr`,
`prorated` — beside each date, because a single calendar day is a misleading way
to display a repeating charge.

Days that not every month has fall back to month end rather than being skipped,
so the 31st still counts once in February and once in September, and a 29
February yearly anchor charges on the 28th in common years.

Leave the date blank for costs that accrue continuously — rent thought of as a
monthly rate — which stays the default and the older behaviour.

The list is stored in [Netlify Blobs](https://docs.netlify.com/blobs/overview/)
via `netlify/functions/costs.ts`, so it is shared across every browser and
device rather than living in one machine's local storage. No environment
variable is needed; Blobs is configured automatically for the site.

> **Note:** the dashboard has no authentication, so anyone who can reach the
> site URL can read and edit this list. Put the site behind Netlify's password
> protection or Identity before entering real payroll figures.

## Scripts

| Command | Description |
| --- | --- |
| `npm run build` | Typecheck and produce a production build |
| `npm run lint` | Run Oxlint |
| `npm run dev` | Run the Vite UI only (does not serve functions) |
