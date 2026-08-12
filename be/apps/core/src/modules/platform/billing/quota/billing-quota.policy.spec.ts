import { describe, expect, it } from 'vitest'

import { summarizeQuotas } from './billing-quota.policy'

const base = {
  customDomains: { limit: null, used: 0 },
  libraryItems: { limit: null, used: 0 },
  monthlyProcess: { limit: null, used: 0 },
  storage: { limit: null, used: 0 },
}

describe('summarizeQuotas', () => {
  it('warns from 80% and not before', () => {
    const under = summarizeQuotas({ ...base, storage: { limit: 100, used: 79 } })
    const at = summarizeQuotas({ ...base, storage: { limit: 100, used: 80 } })

    expect(under.find(d => d.reason === 'storage')?.nearingLimit).toBe(false)
    expect(at.find(d => d.reason === 'storage')?.nearingLimit).toBe(true)
  })

  it('still warns once a dimension is over its limit', () => {
    const over = summarizeQuotas({ ...base, monthlyProcess: { limit: 1000, used: 1200 } })
    expect(over.find(d => d.reason === 'monthly_process')?.nearingLimit).toBe(true)
  })

  it('never warns on an unlimited dimension', () => {
    const unlimited = summarizeQuotas({ ...base, libraryItems: { limit: null, used: 9_999_999 } })
    expect(unlimited.find(d => d.reason === 'library_items')?.nearingLimit).toBe(false)
  })

  it('never warns at zero usage', () => {
    const empty = summarizeQuotas({ ...base, storage: { limit: 0, used: 0 } })
    expect(empty.find(d => d.reason === 'storage')?.nearingLimit).toBe(false)
  })

  it('reports the unit each dimension is measured in', () => {
    const dimensions = summarizeQuotas({ ...base, storage: { limit: 100, used: 10 } })
    expect(dimensions.find(d => d.reason === 'storage')?.unit).toBe('bytes')
    expect(dimensions.find(d => d.reason === 'monthly_process')?.unit).toBe('count')
  })
})
