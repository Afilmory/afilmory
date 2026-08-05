import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

import { acknowledgeTransaction } from './storeKitAcknowledgement.ts'

function transaction(transactionId) {
  return { productId: 'managed-5gb', signedTransactionInfo: `jws-${transactionId}`, transactionId }
}

function recordingPort({ acknowledge }) {
  const finished = []
  return {
    finished,
    port: {
      acknowledge,
      finish: async (transactionId) => {
        finished.push(transactionId)
        return true
      },
    },
  }
}

test('finishes only after the server acknowledges the same transaction', async () => {
  const { finished, port } = recordingPort({
    acknowledge: async () => ({ transactionId: '1001' }),
  })

  await acknowledgeTransaction(transaction('1001'), port)

  assert.deepEqual(finished, ['1001'])
})

test('never finishes when the server rejects the transaction', async () => {
  const { finished, port } = recordingPort({
    acknowledge: async () => {
      throw new Error('network down')
    },
  })

  await assert.rejects(acknowledgeTransaction(transaction('1002'), port))

  assert.deepEqual(finished, [])
})

test('never finishes when the acknowledgement is for a different transaction', async () => {
  const { finished, port } = recordingPort({
    acknowledge: async () => ({ transactionId: '9999' }),
  })

  await assert.rejects(acknowledgeTransaction(transaction('1003'), port))

  assert.deepEqual(finished, [])
})

test('acknowledges a concurrently retried transaction exactly once', async () => {
  let calls = 0
  const { finished, port } = recordingPort({
    acknowledge: async () => {
      calls += 1
      return { transactionId: '1004' }
    },
  })

  await Promise.all([
    acknowledgeTransaction(transaction('1004'), port),
    acknowledgeTransaction(transaction('1004'), port),
  ])

  assert.equal(calls, 1)
  assert.deepEqual(finished, ['1004'])
})
