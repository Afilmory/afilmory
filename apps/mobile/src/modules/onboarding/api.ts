import { apiClient, tenantApiClient } from '@/api/client'
import { camelCaseKeys } from '@/modules/auth/case'

import type { AppStorePurchaseContext, AppStoreTransactionAcknowledgement, MobileOnboardingReadiness } from './types'

export async function fetchMobileOnboardingReadiness(): Promise<MobileOnboardingReadiness> {
  return camelCaseKeys(await apiClient('/mobile/onboarding'))
}

export async function createMobileStorageHandoff(): Promise<{ expiresAt: string, setupUrl: string }> {
  return camelCaseKeys(await apiClient('/mobile/storage-handoffs', { method: 'POST' }))
}

export async function createAppStorePurchaseContext(offerId: string): Promise<AppStorePurchaseContext> {
  return camelCaseKeys(
    await tenantApiClient('/billing/app-store/purchase-context', {
      body: { offerId },
      method: 'POST',
    }),
  )
}

export async function acknowledgeAppStoreTransaction(
  signedTransactionInfo: string,
): Promise<AppStoreTransactionAcknowledgement> {
  return camelCaseKeys(
    await tenantApiClient('/billing/app-store/transactions', {
      body: { signedTransactionInfo },
      method: 'POST',
    }),
  )
}

export async function restoreAppStoreTransactions(
  signedTransactions: string[],
): Promise<{ restored: number, results: AppStoreTransactionAcknowledgement[] }> {
  return camelCaseKeys(
    await tenantApiClient('/billing/app-store/restore', {
      body: { signedTransactions },
      method: 'POST',
    }),
  )
}
