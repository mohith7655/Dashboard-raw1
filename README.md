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

Use `.env.example` as the local template. Never prefix secrets with `VITE_`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run build` | Typecheck and produce a production build |
| `npm run lint` | Run Oxlint |
| `npm run dev` | Run the Vite UI only (does not serve functions) |
