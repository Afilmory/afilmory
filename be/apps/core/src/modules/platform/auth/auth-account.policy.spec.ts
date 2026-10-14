import { getTestInstance } from 'better-auth/test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AUTH_ACCOUNT_POLICY } from './auth-account.policy'

describe('explicit OAuth account linking', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('links a verified provider identity whose email differs from the signed-in user', async () => {
    const providerAccountId = 'github-different-email'
    const { auth, signInWithTestUser } = await getTestInstance({
      account: AUTH_ACCOUNT_POLICY,
      socialProviders: {
        github: {
          clientId: 'test-client',
          clientSecret: 'test-secret',
          getUserInfo: async () => ({
            data: { id: providerAccountId } as any,
            user: {
              email: 'alternate@example.com',
              emailVerified: true,
              name: 'Alternate Identity',
            },
          }),
        },
      },
    })
    const { headers } = await signInWithTestUser()
    const callbackURL = 'http://localhost:3000/settings/account'
    const linkResponse = await auth.api.linkSocialAccount({
      asResponse: true,
      body: {
        callbackURL,
        disableRedirect: true,
        provider: 'github',
      },
      headers,
    })
    const linkPayload = (await linkResponse.json()) as { url: string }
    const state = new URL(linkPayload.url).searchParams.get('state')
    expect(state).toBeTruthy()

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url === 'https://github.com/login/oauth/access_token') {
        return Response.json({ access_token: 'github-token', token_type: 'bearer' })
      }
      throw new Error(`Unexpected OAuth request: ${url}`)
    })

    const callbackResponse = await auth.handler(
      new Request(`http://localhost:3000/api/auth/callback/github?code=test-code&state=${state}`),
    )
    expect(callbackResponse.status).toBe(302)
    expect(callbackResponse.headers.get('location')).toBe(callbackURL)

    const accounts = await auth.api.listUserAccounts({ headers })
    expect(accounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: providerAccountId,
          providerId: 'github',
        }),
      ]),
    )
  })
})
