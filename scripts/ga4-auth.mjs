/**
 * Mints one Google refresh token carrying every scope this dashboard needs, so
 * a single token serves the GA4 breakdowns, the Google Ads connector, the
 * Search Console report and the Merchant Center feed.
 *
 * Each Google flow only ever consents its own scope, which is why a token that
 * works for Ads gets a 403 ACCESS_TOKEN_SCOPE_INSUFFICIENT from the GA4 Data
 * API, and a token that works for both still gets one from Search Console.
 * Re-consenting the same OAuth client for all four is the fix.
 *
 *   npm run google:auth
 *
 * Reads the client id and secret from `.env` (GA4_CLIENT_ID / GA4_CLIENT_SECRET,
 * falling back to the GOOGLE_ADS_* pair). Prints the refresh token; nothing is
 * written back, so you stay in control of where it lands.
 */
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 8976
const REDIRECT = `http://localhost:${PORT}/oauth2callback`

/**
 * Ordered so the two the dashboard cannot work without come first — the check
 * below refuses on those and only warns about the rest, because a store with no
 * Merchant Center account should still be able to mint a usable token.
 */
const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/adwords',
]
const OPTIONAL_SCOPES = [
  // Search & Feed tab: organic search, then the Shopping feed behind it.
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/content',
]
const SCOPES = [...REQUIRED_SCOPES, ...OPTIONAL_SCOPES]

const SCOPE_USES = {
  'https://www.googleapis.com/auth/analytics.readonly': 'GA4 breakdowns',
  'https://www.googleapis.com/auth/adwords': 'Google Ads',
  'https://www.googleapis.com/auth/webmasters.readonly': 'Search Console',
  'https://www.googleapis.com/auth/content': 'Merchant Center',
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function readEnvFile() {
  try {
    return Object.fromEntries(
      readFileSync(join(root, '.env'), 'utf8')
        .split(/\r?\n/)
        .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
        .map((line) => {
          const i = line.indexOf('=')
          return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
        }),
    )
  } catch {
    return {}
  }
}

const env = { ...readEnvFile(), ...process.env }
const clientId = env.GA4_CLIENT_ID || env.GOOGLE_ADS_CLIENT_ID
const clientSecret = env.GA4_CLIENT_SECRET || env.GOOGLE_ADS_CLIENT_SECRET

if (!clientId || !clientSecret) {
  console.error(
    'No OAuth client found. Set GA4_CLIENT_ID/GA4_CLIENT_SECRET (or the\n' +
      'GOOGLE_ADS_* pair) in .env first.',
  )
  process.exit(1)
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: REDIRECT,
  response_type: 'code',
  scope: SCOPES.join(' '),
  access_type: 'offline',
  // Without this Google reuses the existing grant and returns no refresh token.
  prompt: 'consent',
  include_granted_scopes: 'true',
}).toString()

/** Serves one request, then resolves with the `code` query parameter. */
function waitForCode() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`)
      if (url.pathname !== '/oauth2callback') {
        res.writeHead(404).end()
        return
      }
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        `<title>GA4 authorisation</title><body style="font:16px system-ui;padding:3rem">` +
          (code
            ? '<h1>Done.</h1><p>Return to the terminal for the refresh token.</p>'
            : `<h1>Authorisation failed</h1><p>${error ?? 'no code returned'}</p>`) +
          '</body>',
      )
      server.close()
      if (code) resolve(code)
      else reject(new Error(error ?? 'no code returned'))
    })
    server.listen(PORT, () => {
      console.log(`Listening on ${REDIRECT}\n`)
      console.log('Opening the consent screen. If it does not open, visit:\n')
      console.log(authUrl.toString() + '\n')
      openBrowser(authUrl.toString())
    })
    server.on('error', reject)
  })
}

function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]]
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
  } catch {
    /* the printed URL is the fallback */
  }
}

const code = await waitForCode()

const res = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT,
    grant_type: 'authorization_code',
  }),
})
const body = await res.json()

if (!res.ok || !body.refresh_token) {
  console.error('\nToken exchange failed:', JSON.stringify(body, null, 2))
  if (res.ok) {
    console.error(
      '\nGoogle returned no refresh token. That happens when the grant already\n' +
        'exists — revoke it at https://myaccount.google.com/permissions and retry.',
    )
  }
  process.exit(1)
}

const grantedList = String(body.scope ?? '')
  .split(' ')
  .filter(Boolean)
const has = (scope) => grantedList.includes(scope)

console.log('\nGranted scopes:')
for (const scope of SCOPES) {
  console.log(`  ${has(scope) ? '✓' : '✗'} ${scope}  — ${SCOPE_USES[scope]}`)
}
// Anything Google threw in beyond what was asked for; listed rather than
// hidden, since `include_granted_scopes` can widen the grant.
for (const scope of grantedList.filter((s) => !SCOPES.includes(s))) {
  console.log(`  · ${scope}`)
}

if (!has(REQUIRED_SCOPES[0])) {
  console.error(
    '\nanalytics.readonly was NOT granted, so this token still cannot read GA4.\n' +
      'Make sure the Google Analytics Data API is enabled for this project and\n' +
      'that you ticked the Analytics permission on the consent screen.',
  )
  process.exit(1)
}

console.log('\nRefresh token:\n')
console.log(body.refresh_token)
console.log('\nSet it as GA4_REFRESH_TOKEN in .env and in Netlify')
console.log('(Project configuration → Environment variables), then redeploy.')
console.log('Every connector falls back to it, so one variable covers all four.')

if (has(REQUIRED_SCOPES[1])) {
  console.log('It also carries `adwords`, so it can replace GOOGLE_ADS_REFRESH_TOKEN.')
}

// Named individually, because each missing scope disables a specific thing and
// has its own reason for not being granted.
const missingOptional = OPTIONAL_SCOPES.filter((s) => !has(s))
if (missingOptional.length > 0) {
  console.warn('\nNot granted:')
  for (const scope of missingOptional) {
    console.warn(`  ${SCOPE_USES[scope]} (${scope})`)
  }
  console.warn(
    '\nThe Search & Feed tab needs these. The usual cause is the API not being\n' +
      'enabled in the Google Cloud project — "Google Search Console API" and\n' +
      '"Content API for Shopping" — or the permission not being ticked on the\n' +
      'consent screen. Enable them, revoke the grant at\n' +
      'https://myaccount.google.com/permissions, and run this again.',
  )
}
