export interface AcknowledgeableTransaction {
  signedTransactionInfo: string
  transactionId: string
}

export interface StoreKitAcknowledgementPort {
  acknowledge: (signedTransactionInfo: string) => Promise<{ transactionId: string }>
  finish: (transactionId: string) => Promise<boolean>
}

const inFlight = new Map<string, Promise<void>>()

/**
 * Finishing forfeits the transaction — StoreKit stops replaying it — so it must happen only after
 * the server has recorded this exact transaction id. A purchase finished without a server record
 * can no longer be restored.
 */
export async function acknowledgeTransaction(
  transaction: AcknowledgeableTransaction,
  port: StoreKitAcknowledgementPort,
): Promise<void> {
  const existing = inFlight.get(transaction.transactionId)
  if (existing) {
    return await existing
  }
  const operation = port
    .acknowledge(transaction.signedTransactionInfo)
    .then(async (acknowledgement) => {
      if (acknowledgement.transactionId !== transaction.transactionId) {
        throw new Error('The App Store transaction acknowledgement did not match the purchased transaction.')
      }
      await port.finish(transaction.transactionId)
    })
    .finally(() => inFlight.delete(transaction.transactionId))
  inFlight.set(transaction.transactionId, operation)
  return await operation
}
