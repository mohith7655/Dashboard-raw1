const ENDPOINT = '/.netlify/functions/auth'

interface SessionBody {
  email?: string | null
  error?: { message?: string }
}

/** Resolves to the signed-in email, or null when nobody is signed in. */
async function request(init?: RequestInit): Promise<string | null> {
  const res = await fetch(ENDPOINT, init)
  const text = await res.text()

  if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
    throw new Error(
      'Netlify Functions are unavailable. Start local development with `npm run dev` and open the Netlify URL it prints.',
    )
  }

  let body: SessionBody = {}
  try {
    body = JSON.parse(text) as SessionBody
  } catch {
    throw new Error('The sign-in service returned invalid JSON.')
  }

  if (!res.ok) {
    throw new Error(body.error?.message ?? `Request failed with status ${res.status}`)
  }
  return body.email ?? null
}

export const fetchSession = (): Promise<string | null> => request()

export const signIn = (email: string, password: string): Promise<string | null> =>
  request({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

export const signOut = (): Promise<string | null> => request({ method: 'DELETE' })
