import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'

export interface AppleAuthorizationResult {
  authorizationCode: string
  email: string | null
  identityToken: string
  name: {
    firstName?: string
    lastName?: string
  }
  nonce: string
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function isAppleAuthenticationAvailable(): Promise<boolean> {
  return await AppleAuthentication.isAvailableAsync().catch(() => false)
}

export async function requestAppleAuthorization(): Promise<AppleAuthorizationResult> {
  const nonce = bytesToHex(await Crypto.getRandomBytesAsync(32))
  const state = Crypto.randomUUID()
  const credential = await AppleAuthentication.signInAsync({
    nonce,
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    state,
  })

  if (credential.state !== state) {
    throw new Error('Apple authorization state did not match the request.')
  }
  if (!credential.identityToken || !credential.authorizationCode) {
    throw new Error('Apple did not return the credentials required to sign in.')
  }

  return {
    authorizationCode: credential.authorizationCode,
    email: credential.email,
    identityToken: credential.identityToken,
    name: {
      firstName: credential.fullName?.givenName ?? undefined,
      lastName: credential.fullName?.familyName ?? undefined,
    },
    nonce,
  }
}

export function addAppleCredentialRevokeListener(listener: () => void) {
  return AppleAuthentication.addRevokeListener(listener)
}
