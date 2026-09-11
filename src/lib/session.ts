import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as auth from './adapters/auth'

const SESSION_KEY = ['session'] as const

/**
 * Who is signed in: an email, or null.
 *
 * Rechecked on returning to the tab and every few minutes, so a session that
 * ends mid-visit — expired, or the account removed — sends the reader back to
 * the sign-in form rather than leaving them on a page of failed connectors.
 */
export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: auth.fetchSession,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60_000,
    retry: 1,
  })
}

export interface SignIn {
  signIn: (email: string, password: string) => void
  signingIn: boolean
  error: string | null
}

export function useSignIn(): SignIn {
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      auth.signIn(email, password),
    onSuccess: (email) => client.setQueryData(SESSION_KEY, email),
  })

  return {
    signIn: (email, password) => mutation.mutate({ email, password }),
    signingIn: mutation.isPending,
    error: mutation.error ? mutation.error.message : null,
  }
}

export interface SignOut {
  signOut: () => void
  signingOut: boolean
}

export function useSignOut(): SignOut {
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: auth.signOut,
    onSuccess: () => {
      client.setQueryData(SESSION_KEY, null)
      // Every cached figure goes with the session. It was fetched for the
      // person leaving, and must not be on screen for whoever signs in next.
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== SESSION_KEY[0] })
    },
  })

  return {
    signOut: () => mutation.mutate(),
    signingOut: mutation.isPending,
  }
}
