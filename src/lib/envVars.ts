/**
 * The single source of truth for every environment variable the app reads.
 *
 * Consumed by three places, so the list can never drift:
 *   - netlify/functions/config-status.ts reports which are set (never values)
 *   - the Store Settings page renders that status
 *   - the README documents them
 */

export type EnvScope = 'functions' | 'builds'

export interface EnvVarSpec {
  name: string
  service: string
  required: boolean
  scope: EnvScope
  description: string
  /** Sidebar pages that stop working without it. */
  powers: string[]
  /** Where to obtain the value. */
  where: string
}

export const ENV_VARS: EnvVarSpec[] = [
  /* ------------------------------ Metorik core ------------------------- */
  {
    name: 'METORIK_API_KEY',
    service: 'Metorik',
    required: true,
    scope: 'functions',
    description:
      'Bearer token for the Metorik API. Backs every WooCommerce-derived page.',
    powers: [
      'Dashboard', 'Orders', 'Customers', 'Products', 'Coupons', 'Carts',
      'Reports', 'Cohorts', 'Goals', 'Digests', 'Exports', 'Costs',
      'Custom Metrics',
    ],
    where: 'Metorik → Account → API → Create API key',
  },
  {
    name: 'METORIK_STORE_ID',
    service: 'Metorik',
    required: false,
    scope: 'functions',
    description:
      'Selects which store to query when the Metorik account has more than one. Omit for single-store accounts.',
    powers: ['All Metorik pages'],
    where: 'Metorik → Store Settings → the id in the dashboard URL',
  },

  /* ----------------------------- Metorik Engage ------------------------ */
  {
    name: 'METORIK_ENGAGE_API_KEY',
    service: 'Metorik Engage',
    required: false,
    scope: 'functions',
    description:
      'Separate key for the Engage (email) API. Falls back to METORIK_API_KEY when unset.',
    powers: ['Engage Home', 'Campaigns', 'Profiles', 'Sent Emails', 'Engage Stats'],
    where: 'Metorik → Engage → Settings → API',
  },

  /* ---------------------------- WooCommerce ---------------------------- */
  /*
   * Read directly from the store for one thing Metorik cannot answer: which
   * coupon took which money. A discount plugin can apply the money on a line
   * that is not a WooCommerce coupon at all, and only the order carries both.
   * All three are optional together — without them the coupon card falls back
   * to Metorik's own figures.
   */
  {
    name: 'WOO_STORE_URL',
    service: 'WooCommerce',
    required: false,
    scope: 'functions',
    description:
      'Store origin, e.g. https://example.com. Must be https — the API keys travel as basic auth.',
    powers: ['Coupon usage'],
    where: 'The storefront address itself',
  },
  {
    name: 'WOO_CONSUMER_KEY',
    service: 'WooCommerce',
    required: false,
    scope: 'functions',
    description: 'REST API consumer key, `ck_…`. Read permission is enough.',
    powers: ['Coupon usage'],
    where: 'WooCommerce → Settings → Advanced → REST API → Add key (Read)',
  },
  {
    name: 'WOO_CONSUMER_SECRET',
    service: 'WooCommerce',
    required: false,
    scope: 'functions',
    description: 'REST API consumer secret, `cs_…`, issued with the key above.',
    powers: ['Coupon usage'],
    where: 'WooCommerce → Settings → Advanced → REST API → Add key (Read)',
  },

  /* --------------------------------- Tori ------------------------------ */
  {
    name: 'ANTHROPIC_API_KEY',
    service: 'Anthropic',
    required: false,
    scope: 'functions',
    description:
      'Powers the Tori assistant, which answers questions against the metrics already loaded on the page.',
    powers: ['Tori'],
    where: 'console.anthropic.com → API keys',
  },
  {
    name: 'TORI_MODEL',
    service: 'Anthropic',
    required: false,
    scope: 'functions',
    description: 'Model id for Tori. Defaults to claude-sonnet-5 when unset.',
    powers: ['Tori'],
    where: 'Any current Claude model id',
  },

  /* ------------------------------ Meta Ads ----------------------------- */
  {
    name: 'META_ACCESS_TOKEN',
    service: 'Facebook Meta Ads',
    required: true,
    scope: 'functions',
    description:
      'Long-lived access token with the ads_read permission. Expiry here is what produces the (190) banner.',
    powers: ['Dashboard', 'Costs'],
    where: 'Meta Business → System user → Generate token',
  },
  {
    name: 'META_AD_ACCOUNT_ID',
    service: 'Facebook Meta Ads',
    required: true,
    scope: 'functions',
    description: 'Ad account id, with or without the act_ prefix.',
    powers: ['Dashboard', 'Costs'],
    where: 'Meta Ads Manager → Account overview',
  },

  /* ----------------------------- Google Ads ---------------------------- */
  {
    name: 'GOOGLE_ADS_DEVELOPER_TOKEN',
    service: 'Google Ads',
    required: true,
    scope: 'functions',
    description: 'Developer token from your Google Ads manager account.',
    powers: ['Dashboard', 'Costs'],
    where: 'Google Ads → Tools → API Center',
  },
  {
    name: 'GOOGLE_ADS_CLIENT_ID',
    service: 'Google Ads',
    required: true,
    scope: 'functions',
    description: 'OAuth 2.0 client id.',
    powers: ['Dashboard', 'Costs'],
    where: 'Google Cloud Console → Credentials',
  },
  {
    name: 'GOOGLE_ADS_CLIENT_SECRET',
    service: 'Google Ads',
    required: true,
    scope: 'functions',
    description: 'OAuth 2.0 client secret.',
    powers: ['Dashboard', 'Costs'],
    where: 'Google Cloud Console → Credentials',
  },
  {
    name: 'GOOGLE_ADS_REFRESH_TOKEN',
    service: 'Google Ads',
    required: true,
    scope: 'functions',
    description:
      'Refresh token, exchanged for a short-lived access token on each invocation.',
    powers: ['Dashboard', 'Costs'],
    where: 'OAuth playground or your own consent flow',
  },
  {
    name: 'GOOGLE_ADS_CUSTOMER_ID',
    service: 'Google Ads',
    required: true,
    scope: 'functions',
    description: 'Target customer id. Dashes are stripped automatically.',
    powers: ['Dashboard', 'Costs'],
    where: 'Google Ads → top-right account id',
  },
  {
    name: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
    service: 'Google Ads',
    required: false,
    scope: 'functions',
    description:
      'Manager (MCC) account id. Required only when the OAuth user reaches the target account through a manager — without it Google answers USER_PERMISSION_DENIED.',
    powers: ['Dashboard', 'Costs'],
    where: 'Google Ads → switch to the manager account → top-right account id',
  },

  /* ----------------------- Google Analytics 4 -------------------------- */
  {
    name: 'GA4_PROPERTY_ID',
    service: 'Google Analytics',
    required: false,
    scope: 'functions',
    description:
      'Numeric GA4 property id — not the G-XXXXXXX measurement id. Without it the GA4 breakdowns on the Traffic tab stay empty.',
    powers: ['Dashboard → Traffic'],
    where: 'GA4 → Admin → Property settings → Property ID (top right)',
  },
  {
    name: 'GA4_REFRESH_TOKEN',
    service: 'Google Analytics',
    required: false,
    scope: 'functions',
    description:
      'Refresh token carrying the analytics.readonly scope. Falls back to GOOGLE_ADS_REFRESH_TOKEN, which only works if that token was consented for both scopes — an Ads-only token is rejected by the Data API.',
    powers: ['Dashboard → Traffic'],
    where: 'OAuth playground or your own consent flow, scope analytics.readonly',
  },
  {
    name: 'GA4_CLIENT_ID',
    service: 'Google Analytics',
    required: false,
    scope: 'functions',
    description:
      'OAuth client id for the GA4 token. Falls back to GOOGLE_ADS_CLIENT_ID; reusing the same client is the simplest setup.',
    powers: ['Dashboard → Traffic'],
    where: 'Google Cloud Console → Credentials',
  },
  {
    name: 'GA4_CLIENT_SECRET',
    service: 'Google Analytics',
    required: false,
    scope: 'functions',
    description: 'Secret for the GA4 OAuth client. Falls back to GOOGLE_ADS_CLIENT_SECRET.',
    powers: ['Dashboard → Traffic'],
    where: 'Google Cloud Console → Credentials',
  },

  /* --------------------------- WooCommerce (opt) ----------------------- */
  {
    name: 'WOOCOMMERCE_STORE_URL',
    service: 'WooCommerce',
    required: false,
    scope: 'functions',
    description:
      'Direct store URL. Only needed for live stock levels, which the Metorik API does not expose.',
    powers: ['Products'],
    where: 'Your storefront origin, e.g. https://rawwgear.com',
  },
  {
    name: 'WOOCOMMERCE_CONSUMER_KEY',
    service: 'WooCommerce',
    required: false,
    scope: 'functions',
    description: 'REST API consumer key, read-only scope is sufficient.',
    powers: ['Products'],
    where: 'WooCommerce → Settings → Advanced → REST API',
  },
  {
    name: 'WOOCOMMERCE_CONSUMER_SECRET',
    service: 'WooCommerce',
    required: false,
    scope: 'functions',
    description: 'REST API consumer secret.',
    powers: ['Products'],
    where: 'WooCommerce → Settings → Advanced → REST API',
  },

]

/** Grouped for the settings page. */
export function envVarsByService(): { service: string; vars: EnvVarSpec[] }[] {
  const out: { service: string; vars: EnvVarSpec[] }[] = []
  for (const spec of ENV_VARS) {
    const found = out.find((g) => g.service === spec.service)
    if (found) found.vars.push(spec)
    else out.push({ service: spec.service, vars: [spec] })
  }
  return out
}

/** Reported by the config-status function — names and booleans only. */
export interface ConfigStatus {
  configured: Record<string, boolean>
  fixtureMode: boolean
}
