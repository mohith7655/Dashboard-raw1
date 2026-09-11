import { readSession, sessionCookie, signIn } from '../lib/auth'
import { BadRequest, errorResponse, isRecord, toErrorResponse } from '../lib/http'

/** Longer than any real password, short enough that nobody can make scrypt chew a megabyte. */
const MAX_PASSWORD = 1024

/**
 * The session: `GET` says who is signed in, `POST` signs in with an email and
 * password, `DELETE` signs out.
 *
 * The one function that answers without a session, since it is how one is got.
 */
export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method === 'GET') {
      // Signed out is an answer rather than a failure, so the page can decide
      // what to show without reading an error.
      return reply({ email: readSession(request)?.email ?? null })
    }

    if (request.method === 'POST') {
      const body: unknown = await request.json().catch(() => {
        throw new BadRequest('Request body must be JSON')
      })
      if (!isRecord(body)) throw new BadRequest('Request body must be an object')

      const email = typeof body.email === 'string' ? body.email : ''
      const password = typeof body.password === 'string' ? body.password : ''
      if (!email.trim() || !password) throw new BadRequest('Enter your email and password.')
      if (password.length > MAX_PASSWORD) throw new BadRequest('That password is too long.')

      const session = signIn(email, password)
      // One message for both a wrong address and a wrong password, so the form
      // cannot be used to find out which addresses have accounts.
      if (!session) return errorResponse('That email and password do not match.', 401)

      return reply({ email: session.email }, 200, sessionCookie(session.token, request))
    }

    if (request.method === 'DELETE') {
      return reply({ email: null }, 200, sessionCookie('', request))
    }

    return reply({ error: { message: 'Method not allowed' } }, 405)
  } catch (err) {
    return toErrorResponse(err)
  }
}

function reply(body: unknown, status = 200, cookie?: string): Response {
  const headers = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' })
  if (cookie) headers.set('set-cookie', cookie)
  return new Response(JSON.stringify(body), { status, headers })
}
