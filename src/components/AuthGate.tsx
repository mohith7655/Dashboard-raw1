import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Loader2, LogIn } from 'lucide-react'
import { useSession, useSignIn } from '../lib/session'

/**
 * The dashboard, or the sign-in form in front of it.
 *
 * The form is a convenience rather than the lock. Every function refuses a
 * request without a session whatever the page shows, so nothing behind this
 * gate is reachable by skipping it.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const session = useSession()

  // The bare ground while the first check is in flight, rather than a form
  // that flashes up and vanishes for a reader who is already signed in.
  if (session.isPending) return <div className="min-h-screen bg-bg" />
  if (session.data) return children

  return <SignInForm problem={session.error ? session.error.message : null} />
}

function SignInForm({ problem }: { problem: string | null }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { signIn, signingIn, error } = useSignIn()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!email.trim() || !password || signingIn) return
    signIn(email.trim(), password)
  }

  // A failed attempt says more than a failed check: it is the answer to what
  // the reader just did.
  const message = error ?? problem

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-[360px]">
        {/* The same lockup as the header, so the form reads as this
            dashboard's door rather than as a generic page. */}
        <div className="mb-6 text-center">
          <h1 className="text-[19px] font-semibold leading-none tracking-[-0.01em] text-ink">
            RA1
          </h1>
          <p className="mt-1 text-[11px] leading-none text-muted">Dashboard</p>
        </div>

        <form onSubmit={submit} method="post" className="card flex flex-col gap-4">
          <h2 className="text-[15px] font-semibold text-ink">Sign in</h2>

          <label className="flex flex-col gap-1.5">
            <span className="kpi-label">Email</span>
            <input
              type="email"
              name="email"
              autoComplete="username"
              autoFocus
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="input-base w-full"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="kpi-label">Password</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="input-base w-full"
            />
          </label>

          {message && (
            <p role="alert" className="text-[12px] text-neg">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={signingIn}
            className="flex h-9 items-center justify-center gap-2 rounded-lg bg-[#5b9bd8] px-3 text-[13px] font-medium text-bg transition-colors hover:bg-[#6ca8e0] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {signingIn ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <LogIn size={14} aria-hidden />
            )}
            {signingIn ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-center text-[12px] text-label">
          No account? Ask whoever runs this dashboard to add you.
        </p>
      </div>
    </main>
  )
}
