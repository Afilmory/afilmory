import { describe, expect, it } from 'vitest'

import { isByoStorageActive } from './storage-provider.utils'

describe('storage provider utils', () => {
  it('preserves the selected BYO provider when managed storage becomes entitled', () => {
    const providerIds = new Set(['customer-s3'])

    expect(isByoStorageActive('customer-s3', providerIds)).toBe(true)
    expect(isByoStorageActive('managed', providerIds)).toBe(false)
    expect(isByoStorageActive('missing-provider', providerIds)).toBe(false)
  })
})
