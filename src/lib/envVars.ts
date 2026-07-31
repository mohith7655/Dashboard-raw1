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
