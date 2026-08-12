import { describe, expect, it } from 'vitest'

import { describeTerminalClientBillingError } from './app-store-billing.policy'

describe('app store client billing errors', () => {
  it('tells a customer whose Apple ID already subscribes elsewhere what to do', () => {
    expect(describeTerminalClientBillingError('APP_STORE_TRANSACTION_TENANT_MISMATCH')).toContain('another workspace')
    expect(describeTerminalClientBillingError('BILLING_ORIGINAL_TRANSACTION_CONFLICT')).toContain('another workspace')
  })

  it('keeps retryable reconciliation failures opaque so the device retries them', () => {
    expect(describeTerminalClientBillingError('BILLING_SUBSCRIPTION_UPSERT_FAILED')).toBeNull()
    expect(describeTerminalClientBillingError('BILLING_PROVIDER_EVENT_RECEIPT_FAILED')).toBeNull()
    expect(describeTerminalClientBillingError('APP_STORE_ROOT_CERTIFICATES_NOT_CONFIGURED')).toBeNull()
  })
})
