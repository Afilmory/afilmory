import { getTestInstance } from 'better-auth/test'
import { describe, expect, it } from 'vitest'

import { nativeOAuthSessionBridge } from './native-oauth.plugin'

describe('native OAuth session bridge', () => {
  it('exchanges a single-use code for a normal Better Auth session cookie', async () => {
    const { auth, signInWithTestUser } = await getTestInstance({
      plugins: [nativeOAuthSessionBridge()],
    })
    const signedIn = await signInWithTestUser()
    const generated = await auth.api.generateOneTimeToken({ headers: signedIn.headers })

    const response = await auth.api.verifyOneTimeToken({
      asResponse: true,
      body: { token: generated.token },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('session_token=')
    await expect(
      auth.api.verifyOneTimeToken({ body: { token: generated.token } }),
    ).rejects.toMatchObject({ status: 'BAD_REQUEST' })
  })
})
