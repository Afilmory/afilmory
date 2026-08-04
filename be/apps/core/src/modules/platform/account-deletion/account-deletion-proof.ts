import type { AccountDeletionProof } from './account-deletion.types'

export function parseAccountDeletionProof(value: unknown): AccountDeletionProof | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const proof = value as Record<string, unknown>
  if (proof.type === 'password') {
    const password = typeof proof.password === 'string' ? proof.password : ''
    return password.length > 0 ? { password, type: 'password' } : null
  }
  if (proof.type === 'apple') {
    const identityToken = typeof proof.identityToken === 'string' ? proof.identityToken.trim() : ''
    const nonce = typeof proof.nonce === 'string' ? proof.nonce.trim() : ''
    return identityToken && nonce ? { identityToken, nonce, type: 'apple' } : null
  }
  return proof.type === 'recent-session' ? { type: 'recent-session' } : null
}
