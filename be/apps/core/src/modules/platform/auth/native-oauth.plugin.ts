import { oneTimeToken } from 'better-auth/plugins/one-time-token'

export function nativeOAuthSessionBridge() {
  return oneTimeToken({
    disableClientRequest: true,
    expiresIn: 1,
    storeToken: 'hashed',
  })
}
