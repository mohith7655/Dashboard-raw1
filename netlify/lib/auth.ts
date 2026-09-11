import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { MissingConfig, errorResponse, isRecord, requireEnv, toErrorResponse } from './http'

/**
 * Email and password sign-in, held entirely in the function environment.
 *
 * Accounts are an environment variable rather than a table. The dashboard has a
 * handful of readers and no sign-up, so a list the operator edits in Netlify is
 * the whole of the user management it needs — and there is no endpoint that
 * can add an account, because there is nothing for one to write to.
 *
 *   AUTH_USERS   `email:hash` entries, separated by commas or new lines. The
 *                hashes come from `npm run auth:user`; no password is stored.
 *   AUTH_SECRET  Signs the session cookie. 32 or more random characters.
 *
 * Both are read on every request, so removing an account or changing its
 * password ends that account's sessions on the next deploy.
 */

export const SESSION_COOKIE = 'ra1_session'

/** How long a sign-in lasts before the password is asked for again. */
const SESSION_SECONDS = 30 * 24 * 60 * 60

/** The scheduled report's pass: long enough for one run, useless soon after. */
const SERVICE_SECONDS = 15 * 60

/** The subject the scheduled report signs as. Never an email, so never an account. */
const SERVICE = 'scheduled-report'

/**
 * `scrypt.<salt>.<key>`, both base64url, at Node's default cost. Written by
 * `scripts/auth-user.mjs`; the two must agree on this shape.
 */
const KEY_LENGTH = 64

/**
 * Checked in place of a real hash when the address has no account, so a wrong
 * address costs the same scrypt run as a wrong password and the reply time
 * does not say which addresses exist. Random, so no password can match it.
 */
const DECOY = `scrypt.${randomBytes(16).toString('base64url')}.${randomBytes(KEY_LENGTH).toString('base64url')}`

export interface Session {
  email: string
}

interface Claims {
  sub: string
  /** Expiry, in seconds since the epoch. */
  exp: number
  /**
   * Derived from the account's password hash, so a session outlives neither
   * the account nor the password it was signed in with.
   */
  fp: string
}

const normaliseEmail = (email: string) => email.trim().toLowerCase()

function secret(): string {
  const value = requireEnv('AUTH_SECRET')
  if (value.length < 32) {
    throw new MissingConfig(
      'AUTH_SECRET must be at least 32 characters. `npm run auth:user` prints a random one.',
    )
  }
  return value
}

const sign = (value: string) => createHmac('sha256', secret()).update(value).digest('base64url')

const fingerprint = (hash: string) => sign(`fp:${hash}`).slice(0, 22)

function readUsers(): Map<string, string> {
  const users = new Map<string, string>()
  for (const entry of requireEnv('AUTH_USERS').split(/[\s,]+/)) {
    // The last colon, because the hash never contains one.
    const at = entry.lastIndexOf(':')
    if (at <= 0) continue
    users.set(normaliseEmail(entry.slice(0, at)), entry.slice(at + 1))
  }
  if (users.size === 0) {
    throw new MissingConfig(
      'AUTH_USERS has no `email:hash` entries. Run `npm run auth:user` to make one.',
    )
  }
  return users
}

function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, key] = stored.split('.')
  if (scheme !== 'scrypt' || !salt || !key) return false
  const expected = Buffer.from(key, 'base64url')
  if (expected.length !== KEY_LENGTH) return false
  return timingSafeEqual(scryptSync(password, Buffer.from(salt, 'base64url'), KEY_LENGTH), expected)
}

function mint(claims: Claims): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${body}.${sign(body)}`
}

/** The claims of a token this deployment signed and that has not expired, or null. */
function open(token: string): Claims | null {
  const [body, mac] = token.split('.')
  if (!body || !mac) return null

  const expected = Buffer.from(sign(body))
  const given = Buffer.from(mac)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  let claims: unknown
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (
    !isRecord(claims) ||
    typeof claims.sub !== 'string' ||
    typeof claims.exp !== 'number' ||
    typeof claims.fp !== 'string'
  ) {
    return null
  }
  if (claims.exp * 1000 <= Date.now()) return null
  return { sub: claims.sub, exp: claims.exp, fp: claims.fp }
}

/**
 * The token off a request: a bearer header first, which is how the scheduled
 * report calls in, then the cookie the browser carries.
 */
function tokenFrom(request: Request): string | null {
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)
  if (bearer) return bearer[1]

  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const at = part.indexOf('=')
    if (at > 0 && part.slice(0, at).trim() === SESSION_COOKIE) {
      return part.slice(at + 1).trim() || null
    }
  }
  return null
}

/** Who the request is signed in as, or null. Throws only on missing configuration. */
export function readSession(request: Request): Session | null {
  const token = tokenFrom(request)
  if (!token) return null

  const claims = open(token)
  if (!claims) return null
  if (claims.sub === SERVICE) return { email: SERVICE }

  const hash = readUsers().get(claims.sub)
  return hash && claims.fp === fingerprint(hash) ? { email: claims.sub } : null
}

/**
 * The gate every data function passes first: null to carry on, or the
 * response to send instead.
 *
 * Fails closed. With AUTH_USERS or AUTH_SECRET unset nothing is served — the
 * reply says which variable is missing rather than quietly opening the data up.
 */
export function denyWithoutSession(request: Request): Response | null {
  try {
    return readSession(request) ? null : errorResponse('Sign in to use the dashboard.', 401)
  } catch (err) {
    return toErrorResponse(err)
  }
}

/** A signed session for the account, or null when the email and password do not match. */
export function signIn(email: string, password: string): (Session & { token: string }) | null {
  const address = normaliseEmail(email)
  const stored = readUsers().get(address)

  // Run whether or not the account exists; see DECOY.
  const matches = verifyPassword(password, stored ?? DECOY)
  if (!stored || !matches) return null

  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS
  return { email: address, token: mint({ sub: address, exp, fp: fingerprint(stored) }) }
}

/**
 * The `Set-Cookie` value for a session, or for clearing one when `token` is
 * empty.
 *
 * HttpOnly so no script on the page can read it, and SameSite=Lax so another
 * site cannot post to the functions with it attached. Secure only over HTTPS,
 * which leaves `netlify dev` on plain localhost able to sign in.
 */
export function sessionCookie(token: string, request: Request): string {
  const maxAge = token ? SESSION_SECONDS : 0
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`
}

/**
 * Headers that let the scheduled report through the gate.
 *
 * It calls the site's own functions with nobody signed in, so it signs a short
 * pass of its own with the same secret. Only code holding AUTH_SECRET can make
 * one, which is to say only these functions.
 */
export function serviceHeaders(): Record<string, string> {
  const exp = Math.floor(Date.now() / 1000) + SERVICE_SECONDS
  return { authorization: `Bearer ${mint({ sub: SERVICE, exp, fp: '' })}` }
}
