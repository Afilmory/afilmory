import { createAuthClient } from 'better-auth/react'
import { FetchError } from 'ofetch'

const apiBase = import.meta.env.VITE_APP_API_BASE?.replace(/\/$/, '') || '/api'

const authBase = resolveUrl(`${apiBase}/auth`)

const commonOptions = {
  fetchOptions: {
    credentials: 'include' as const,
  },
}

export const authClient = createAuthClient({
  baseURL: authBase,
  ...commonOptions,
})

const { useSession } = authClient
const { signIn, signOut } = authClient

export { useSession }

export const signInAuth = signIn
export const signOutAuth = signOut

export interface SocialSignInOptions {
  provider: string
  requestSignUp?: boolean
  callbackURL?: string
  errorCallbackURL?: string
  newUserCallbackURL?: string
  disableRedirect?: boolean
}

export async function signInSocial(options: SocialSignInOptions): Promise<unknown> {
  const socialSignIn = (signIn as unknown as { social?: (opts: SocialSignInOptions) => Promise<unknown> }).social
  if (!socialSignIn) {
    throw new Error('Social sign-in is not available in this build.')
  }
  return await socialSignIn(options)
}

export async function signOutBySource() {
  try {
    await signOutAuth()
  } catch (error) {
    if (error instanceof FetchError) {
      const status = error.statusCode ?? error.response?.status ?? null
      const recoverableStatuses = new Set([401, 403, 404])
      if (status && recoverableStatuses.has(status)) {
        return
      }
    }
    throw error
  }
}

function resolveUrl(url: string): string {
  if (url.startsWith('/')) {
    const { origin } = window.location
    return `${origin}${url}`
  }
  return url
}
