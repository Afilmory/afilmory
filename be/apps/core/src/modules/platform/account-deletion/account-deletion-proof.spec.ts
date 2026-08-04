import { describe, expect, it } from 'vitest'

import { parseAccountDeletionProof } from './account-deletion-proof'

describe('account deletion proof parsing', () => {
  it('accepts complete supported proof variants', () => {
    expect(parseAccountDeletionProof({ password: 'secret', type: 'password' })).toEqual({
      password: 'secret',
      type: 'password',
    })
    expect(parseAccountDeletionProof({ identityToken: 'token', nonce: 'nonce', type: 'apple' })).toEqual({
      identityToken: 'token',
      nonce: 'nonce',
      type: 'apple',
    })
    expect(parseAccountDeletionProof({ type: 'recent-session' })).toEqual({ type: 'recent-session' })
  })

  it('rejects incomplete or unknown proofs', () => {
    expect(parseAccountDeletionProof(null)).toBeNull()
    expect(parseAccountDeletionProof({ password: '', type: 'password' })).toBeNull()
    expect(parseAccountDeletionProof({ identityToken: 'token', type: 'apple' })).toBeNull()
    expect(parseAccountDeletionProof({ type: 'github' })).toBeNull()
  })
})
