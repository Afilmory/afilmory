import { describe, expect, it } from 'vitest'

import {
  buildNativeOAuthCallbackUrl,
  parseNativeOAuthCallbackTarget,
  readNativeOAuthError,
} from './native-oauth.callback'

const STATE = 'a'.repeat(43)

describe('native OAuth callback', () => {
  it.each(['afilmory', 'afilmory-local'] as const)('accepts the supported %s scheme', (scheme) => {
    const target = parseNativeOAuthCallbackTarget(
      new URL(`https://api.example.com/api/auth/native/oauth/complete?scheme=${scheme}&state=${STATE}`),
    )

    expect(target).toEqual({ scheme, state: STATE })
  })

  it('rejects untrusted schemes and weak client state', () => {
    expect(
      parseNativeOAuthCallbackTarget(
        new URL(`https://api.example.com/api/auth/native/oauth/complete?scheme=attacker&state=${STATE}`),
      ),
    ).toBeNull()
    expect(
      parseNativeOAuthCallbackTarget(
        new URL('https://api.example.com/api/auth/native/oauth/complete?scheme=afilmory&state=predictable'),
      ),
    ).toBeNull()
  })

  it('returns only the one-time code and client state to the application', () => {
    const callback = new URL(
      buildNativeOAuthCallbackUrl(
        { scheme: 'afilmory', state: STATE },
        { code: 'single-use-code' },
      ),
    )

    expect(callback.protocol).toBe('afilmory:')
    expect(callback.pathname).toBe('/auth/callback')
    expect(callback.searchParams.get('state')).toBe(STATE)
    expect(callback.searchParams.get('code')).toBe('single-use-code')
    expect(callback.searchParams.has('cookie')).toBe(false)
  })

  it('preserves a bounded provider reason without allowing an arbitrary error code', () => {
    const source = new URL(
      `https://api.example.com/error?error=invalid error&error_description=${encodeURIComponent('Provider denied the request.\nPlease retry.')}`,
    )
    const error = readNativeOAuthError(source)
    const callback = new URL(
      buildNativeOAuthCallbackUrl(
        { scheme: 'afilmory-local', state: STATE },
        error,
      ),
    )

    expect(callback.searchParams.get('error')).toBe('oauth_error')
    expect(callback.searchParams.get('error_description')).toBe('Provider denied the request. Please retry.')
  })
})
