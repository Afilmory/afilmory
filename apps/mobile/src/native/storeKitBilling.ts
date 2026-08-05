import { requireNativeModule } from 'expo'
import { Platform } from 'react-native'

export interface StoreKitProduct {
  displayName: string
  displayPrice: string
  id: string
  subscriptionPeriod?: {
    unit: 'day' | 'month' | 'unknown' | 'week' | 'year'
    value: number
  }
}

export interface StoreKitTransaction {
  productId: string
  signedTransactionInfo: string
  transactionId: string
}

export type StoreKitPurchaseResult = ({ status: 'success' } & StoreKitTransaction) | { status: 'cancelled' | 'pending' }

interface NativeSubscription {
  remove: () => void
}

interface StoreKitBillingNativeModule {
  addListener: (event: 'onTransaction', listener: (transaction: StoreKitTransaction) => void) => NativeSubscription
  finishTransaction: (transactionId: string) => Promise<boolean>
  loadProducts: (productIds: string[]) => Promise<StoreKitProduct[]>
  manageSubscriptions: () => Promise<void>
  purchase: (productId: string, appAccountToken: string) => Promise<StoreKitPurchaseResult>
  restoreTransactions: (productIds: string[]) => Promise<StoreKitTransaction[]>
  unfinishedTransactions: () => Promise<StoreKitTransaction[]>
}

const nativeBilling
  = Platform.OS === 'ios' ? (requireNativeModule('StoreKitBilling') as StoreKitBillingNativeModule) : null

export function isStoreKitAvailable(): boolean {
  return nativeBilling !== null
}

export async function loadStoreKitProducts(productIds: string[]): Promise<StoreKitProduct[]> {
  return (await nativeBilling?.loadProducts(productIds)) ?? []
}

export async function purchaseStoreKitProduct(
  productId: string,
  appAccountToken: string,
): Promise<StoreKitPurchaseResult> {
  if (!nativeBilling) {
    throw new Error('StoreKit is unavailable on this platform.')
  }
  return await nativeBilling.purchase(productId, appAccountToken)
}

export async function restoreStoreKitTransactions(productIds: string[]): Promise<StoreKitTransaction[]> {
  if (!nativeBilling) {
    throw new Error('StoreKit is unavailable on this platform.')
  }
  return await nativeBilling.restoreTransactions(productIds)
}

export async function loadUnfinishedStoreKitTransactions(): Promise<StoreKitTransaction[]> {
  return (await nativeBilling?.unfinishedTransactions()) ?? []
}

export async function finishStoreKitTransaction(transactionId: string): Promise<boolean> {
  return (await nativeBilling?.finishTransaction(transactionId)) ?? false
}

export async function openStoreKitSubscriptionManagement(): Promise<void> {
  if (!nativeBilling) {
    throw new Error('StoreKit is unavailable on this platform.')
  }
  await nativeBilling.manageSubscriptions()
}

export function addStoreKitTransactionListener(
  listener: (transaction: StoreKitTransaction) => void,
): NativeSubscription {
  return nativeBilling?.addListener('onTransaction', listener) ?? { remove() {} }
}
