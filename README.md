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

Per-product views and conversion rates are **not** available: Metorik pulls
those directly from GA when its own pages load and excludes them from both the
API and exports.

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
