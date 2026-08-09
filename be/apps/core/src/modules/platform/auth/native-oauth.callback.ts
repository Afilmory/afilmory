const NATIVE_OAUTH_CALLBACK_SCHEMES = new Set(['afilmory', 'afilmory-local'])
const NATIVE_OAUTH_STATE_PATTERN = /^[\w-]{43}$/
const NATIVE_OAUTH_ERROR_CODE_PATTERN = /^[\w.-]{1,64}$/
const NATIVE_OAUTH_ERROR_WHITESPACE_PATTERN = /[\r\n\t]+/g

export interface NativeOAuthCallbackTarget {
  scheme: 'afilmory' | 'afilmory-local'
  state: string
}

export type NativeOAuthCallbackResult
  = | { code: string }
    | { error: string, errorDescription: string }

export function parseNativeOAuthCallbackTarget(url: URL): NativeOAuthCallbackTarget | null {
  const scheme = url.searchParams.get('scheme')?.trim().toLowerCase() ?? ''
  const state = url.searchParams.get('state')?.trim() ?? ''
  if (!NATIVE_OAUTH_CALLBACK_SCHEMES.has(scheme) || !NATIVE_OAUTH_STATE_PATTERN.test(state)) {
    return null
  }

  return {
    scheme: scheme as NativeOAuthCallbackTarget['scheme'],
    state,
  }
}

export function buildNativeOAuthCallbackUrl(
  target: NativeOAuthCallbackTarget,
  result: NativeOAuthCallbackResult,
): string {
  const callback = new URL(`${target.scheme}:///auth/callback`)
  callback.searchParams.set('state', target.state)

  if ('code' in result) {
    callback.searchParams.set('code', result.code)
  }
  else {
    callback.searchParams.set('error', normalizeErrorCode(result.error))
    callback.searchParams.set('error_description', normalizeErrorDescription(result.errorDescription))
  }

  return callback.toString()
}

export function readNativeOAuthError(url: URL): { error: string, errorDescription: string } {
  const error = url.searchParams.get('error') ?? 'oauth_error'
  const errorDescription
    = url.searchParams.get('error_description')
      ?? url.searchParams.get('errorDescription')
      ?? url.searchParams.get('message')
      ?? 'The authentication provider did not complete sign-in.'

  return {
    error: normalizeErrorCode(error),
    errorDescription: normalizeErrorDescription(errorDescription),
  }
}

function normalizeErrorCode(value: string): string {
  const normalized = value.trim()
  return NATIVE_OAUTH_ERROR_CODE_PATTERN.test(normalized) ? normalized : 'oauth_error'
}

function normalizeErrorDescription(value: string): string {
  const normalized = value.trim().replaceAll(NATIVE_OAUTH_ERROR_WHITESPACE_PATTERN, ' ')
  return (normalized || 'Authentication could not be completed.').slice(0, 512)
}
