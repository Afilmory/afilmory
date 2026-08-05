import type { StoreKitTransaction } from '@/native/storeKitBilling'
import {
  finishStoreKitTransaction,
  loadUnfinishedStoreKitTransactions,
  purchaseStoreKitProduct,
  restoreStoreKitTransactions,
} from '@/native/storeKitBilling'

import { acknowledgeAppStoreTransaction, createAppStorePurchaseContext, restoreAppStoreTransactions } from './api'
import type { StoreKitAcknowledgementPort } from './storeKitAcknowledgement'
import { acknowledgeTransaction } from './storeKitAcknowledgement'

const acknowledgementPort: StoreKitAcknowledgementPort = {
  acknowledge: acknowledgeAppStoreTransaction,
  finish: finishStoreKitTransaction,
}

export async function acknowledgeStoreKitTransaction(transaction: StoreKitTransaction): Promise<void> {
  return await acknowledgeTransaction(transaction, acknowledgementPort)
}

export async function purchaseAppStoreOffer(offerId: string): Promise<'cancelled' | 'completed' | 'pending'> {
  const context = await createAppStorePurchaseContext(offerId)
  const purchase = await purchaseStoreKitProduct(context.productId, context.appAccountToken)
  if (purchase.status !== 'success') {
    return purchase.status
  }
  await acknowledgeStoreKitTransaction(purchase)
  return 'completed'
}

export async function restoreAppStorePurchases(productIds: string[]): Promise<number> {
  const transactions = await restoreStoreKitTransactions(productIds)
  if (transactions.length === 0) {
    return 0
  }
  const response = await restoreAppStoreTransactions(
    transactions.map(transaction => transaction.signedTransactionInfo),
  )
  const acceptedIds = new Set(response.results.map(result => result.transactionId))
  for (const transaction of transactions) {
    if (acceptedIds.has(transaction.transactionId)) {
      await finishStoreKitTransaction(transaction.transactionId)
    }
  }
  return acceptedIds.size
}

export async function reconcileUnfinishedAppStoreTransactions(): Promise<number> {
  const transactions = await loadUnfinishedStoreKitTransactions()
  let reconciled = 0
  for (const transaction of transactions) {
    try {
      await acknowledgeStoreKitTransaction(transaction)
      reconciled += 1
    }
    catch {
      // StoreKit keeps the transaction unfinished. A later foreground refresh retries it.
    }
  }
  return reconciled
}
