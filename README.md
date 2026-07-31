# Sales Dashboard

A dark-theme sales dashboard over three connectors — **Metorik** (WooCommerce),
**Facebook Meta Ads**, and **Google Ads** — built with Vite + React +
TypeScript + Tailwind CSS, charted with Recharts, and deployed to Netlify.

Every upstream call is proxied through a Netlify Function so no API credential
is ever bundled into the browser.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173 — renders fixture data, no credentials needed
```

The app ships with `VITE_USE_FIXTURES` defaulting to `true`, so `npm run dev`
renders the complete layout against typed fixture data immediately. Fixtures are
a pure function of the selected date range, so the date picker, sorting, and
pagination are all fully exercised offline.

### Exercising the error states

Fixture mode can force any connector to fail, which is the fastest way to review
the error banner and per-section degradation:

| URL | Effect |
| --- | --- |
| `http://localhost:5173/?fail=meta` | Facebook session-expired banner; Meta KPIs show `—`, everything else still renders |
| `http://localhost:5173/?fail=google-ads` | Google Ads auth failure |
| `http://localhost:5173/?fail=metorik` | WooCommerce section, all three charts, and the orders table degrade together |
| `?fail=meta&fail=google-ads` | Two banners stacked |

A source failing never blanks the dashboard — each section subscribes to its own
query, and **Retry** on a banner refetches only that source.

### Running against the live APIs

```bash
cp .env.example .env      # fill in the secrets, then:
# set VITE_USE_FIXTURES=false in .env
npx netlify dev           # serves the app AND the functions on one origin
```

`npm run dev` alone cannot serve `/.netlify/functions/*` — use `netlify dev`
(from `netlify-cli`) whenever `VITE_USE_FIXTURES=false`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typechecks (`tsc -b`, strict) then builds to `dist/` |
| `npm run preview` | Serves the production build |
| `npm run lint` | Oxlint |

---

## Environment variables

All secrets are read by the Netlify Functions from `process.env`. **None may be
prefixed `VITE_`** — Vite inlines `VITE_*` variables into the public JavaScript
bundle, which would publish your credentials to every visitor.

| Variable | Used by | What it is |
| --- | --- | --- |
| `METORIK_API_KEY` | `netlify/functions/metorik.ts` | Metorik API key (Metorik → Account → API). Bearer-authenticates the orders and customers endpoints. |
| `META_ACCESS_TOKEN` | `netlify/functions/meta.ts` | Long-lived Facebook access token with `ads_read`. This is the token whose expiry produces the `(190)` banner. |
| `META_AD_ACCOUNT_ID` | `netlify/functions/meta.ts` | Ad account ID, with or without the `act_` prefix — the function normalises it. |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | `netlify/functions/google-ads.ts` | Developer token from your Google Ads manager account. |
| `GOOGLE_ADS_CLIENT_ID` | `netlify/functions/google-ads.ts` | OAuth 2.0 client ID. |
| `GOOGLE_ADS_CLIENT_SECRET` | `netlify/functions/google-ads.ts` | OAuth 2.0 client secret. |
| `GOOGLE_ADS_REFRESH_TOKEN` | `netlify/functions/google-ads.ts` | Refresh token; exchanged for a short-lived access token on each invocation. |
| `GOOGLE_ADS_CUSTOMER_ID` | `netlify/functions/google-ads.ts` | Target customer ID. Dashes are stripped automatically. |
| `VITE_USE_FIXTURES` | client | **Not a secret.** `true` (default) renders fixtures; `false` calls the functions. |

### Where to add them in Netlify

1. Open your site → **Project configuration → Environment variables**.
2. **Add a variable** for each row above.
3. Set the **scope** to **Functions** (the secrets are never needed at build
   time or in the browser). `VITE_USE_FIXTURES` is the one exception — it must
   be scoped to **Builds**, since Vite inlines it at build time.
4. **Redeploy** — environment variable changes only take effect on a new deploy.

---

## Architecture

```
src/
  lib/
    types.ts          Shared domain types (Metric, WooMetrics, AdsMetrics, Order…)
    derive.ts         Every derived figure — cost totals, margin, AOV, CTR, ROAS, deltas
    dateRange.ts      Presets, previous-period logic, day enumeration
    format.ts         All Intl.NumberFormat / Intl.DateTimeFormat instances
    fixtures.ts       Deterministic offline data, anchored to the reference figures
    queries.ts        TanStack Query hooks — one per source
    adapters/
      client.ts       Function calls, the fixture switch, error normalisation
      metorik.ts      fetchMetrics(range), fetchOrders(range, query)
      meta.ts         fetchMetrics(range)
      googleAds.ts    fetchMetrics(range)
  components/         Header, KPI cards, charts, orders table, error banner
netlify/
  functions/          metorik.ts · meta.ts · google-ads.ts  (secrets live here)
  lib/http.ts         Request parsing, env guards, error-body contract
```

**Data flow.** The client calls
`/.netlify/functions/<name>?start=…&end=…`. Each adapter returns
`{ data, error }` and never throws; `queries.ts` rethrows the error so TanStack
Query can retry that source in isolation, then surfaces it to the banner with
the **raw upstream message preserved**. Sections read only their own query, so a
Meta outage leaves WooCommerce and Google Ads fully rendered.

**Derivations** (`derive.ts`) — computed, never trusted from upstream:

- Total Cost = Product + Shipping + Transaction
- Gross Profit = Total Revenue − Total Cost
- Gross Margin = Gross Profit / Total Revenue
- AOV = Total Revenue / Total Orders
- CTR = Clicks / Impressions, CPC = Spend / Clicks, CPM = Spend / Impressions × 1000, ROAS = Conversion Value / Spend

**Deltas** compare the selected range against the immediately preceding period
of equal length. A whole-month selection compares against the previous whole
month rather than an N-day offset, which is what "previous period" means to
someone looking at a calendar month.

**Two order counts, on purpose.** `Total Orders` (415 in the reference month)
counts revenue-producing orders — `completed` and `processing`, the same basis
as the revenue chart. `Recent Orders` (450) lists *every* order in the period,
including cancelled, failed, refunded, and on-hold. The pie chart uses the
second basis.

### Notes on the connectors

- **Metorik** paginates orders; the metrics endpoint aggregates up to 40 pages
  of 100, while the table requests exactly one page from upstream (true
  server-side pagination). Cost fields are read with fallbacks
  (`cost_of_goods` → `cogs` → `cost_total`, etc.) because the available fields
  depend on your Metorik plan — confirm the field names against your account.
- **Meta** conversions and conversion value are summed from the purchase action
  types (`purchase`, `omni_purchase`, `offsite_conversion.fb_pixel_purchase`).
- **Google Ads** cost arrives in micros and is converted to currency units.

### Accessibility note on the status palette

The status → colour map (completed green / failed red / …) is fixed by spec and
mirrors WooCommerce's own status colours. Red and green sit close enough under
deuteranopia that colour alone is not a safe encoding, so every status is also
carried as text — legend labels under the pie, the status name in the tooltip,
and a text pill in the table. No status is ever communicated by colour alone.
