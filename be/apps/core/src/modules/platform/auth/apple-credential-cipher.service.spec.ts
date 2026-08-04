import 'reflect-metadata'

import { Buffer } from 'node:buffer'

import { describe, expect, it, vi } from 'vitest'

import { AppleCredentialCipher } from './apple-credential-cipher.service'

vi.mock('@afilmory/env', () => ({
  env: { CONFIG_ENCRYPTION_KEY: 'unit-test-encryption-key' },
}))

describe('apple credential cipher', () => {
  it('round-trips refresh tokens without deterministic ciphertext', () => {
    const cipher = new AppleCredentialCipher()

    const first = cipher.encrypt('refresh-token')
    const second = cipher.encrypt('refresh-token')

    expect(first).not.toBe(second)
    expect(cipher.decrypt(first)).toBe('refresh-token')
    expect(cipher.decrypt(second)).toBe('refresh-token')
  })

  it('rejects tampered authenticated ciphertext', () => {
    const cipher = new AppleCredentialCipher()
    const segments = cipher.encrypt('refresh-token').split('.')
    const encrypted = segments[3]
    if (!encrypted) {
      throw new Error('Expected an encrypted credential segment.')
    }

    const tamperedBytes = Buffer.from(encrypted, 'base64url')
    tamperedBytes[0] = tamperedBytes[0]! ^ 1
    segments[3] = tamperedBytes.toString('base64url')

    expect(() => cipher.decrypt(segments.join('.'))).toThrow()
  })
})
