import assert from 'node:assert/strict'

import { it } from 'vitest'

import { TextureScheduler } from './scheduler'

interface Call {
  id: string
  tier: number
  signal: AbortSignal
  resolve: (value: string) => void
  reject: (error: Error) => void
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

const setup = (overrides: { concurrency?: number, budgetBytes?: number } = {}) => {
  const calls: Call[] = []
  const loaded: [string, number][] = []
  const evicted: string[] = []
  const scheduler = new TextureScheduler<string>({
    load: (id, tier, signal) =>
      new Promise<string>((resolve, reject) => {
        calls.push({ id, tier, signal, resolve, reject })
      }),
    onLoaded: (id, tier) => loaded.push([id, tier]),
    onEvict: id => evicted.push(id),
    concurrency: overrides.concurrency ?? 2,
    budgetBytes: overrides.budgetBytes ?? 10 * 128 * 128 * 4,
    maxRetries: 1,
  })
  return { scheduler, calls, loaded, evicted }
}

const want = (id: string, distance: number, tier = 128) => ({ id, tier, distance })

it('never runs more loads at once than the concurrency limit', () => {
  const { scheduler, calls } = setup({ concurrency: 2 })
  scheduler.update([want('a', 1), want('b', 2), want('c', 3), want('d', 4)], false)
  assert.equal(calls.length, 2)
})

it('starts the nearest photos first', () => {
  const { scheduler, calls } = setup({ concurrency: 2 })
  scheduler.update([want('far', 900), want('near', 5), want('mid', 300)], false)
  assert.deepEqual(
    calls.map(call => call.id),
    ['near', 'mid'],
  )
})

it('starts the next queued photo when a load finishes', async () => {
  const { scheduler, calls, loaded } = setup({ concurrency: 1 })
  scheduler.update([want('a', 1), want('b', 2)], false)
  calls[0].resolve('A')
  await flush()
  assert.deepEqual(loaded, [['a', 128]])
  assert.deepEqual(
    calls.map(call => call.id),
    ['a', 'b'],
  )
  assert.equal(scheduler.has('a'), 128)
})

it('aborts an in-flight load that is no longer wanted and drops its result', async () => {
  const { scheduler, calls, loaded } = setup()
  scheduler.update([want('a', 1)], false)
  scheduler.update([], false)
  assert.equal(calls[0].signal.aborted, true)
  calls[0].resolve('A')
  await flush()
  assert.deepEqual(loaded, [])
  assert.equal(scheduler.has('a'), 0)
})

it('starts no new loads while the camera is moving fast', () => {
  const { scheduler, calls } = setup()
  scheduler.update([want('a', 1)], true)
  assert.equal(calls.length, 0)
  scheduler.update([want('a', 1)], false)
  assert.equal(calls.length, 1)
})

it('does not reload a photo that is already loaded at the wanted tier', async () => {
  const { scheduler, calls } = setup()
  scheduler.update([want('a', 1)], false)
  calls[0].resolve('A')
  await flush()
  scheduler.update([want('a', 1)], false)
  assert.equal(calls.length, 1)
})

it('loads a higher tier when one is wanted and replaces the lower one', async () => {
  const { scheduler, calls, loaded } = setup()
  scheduler.update([want('a', 1, 128)], false)
  calls[0].resolve('small')
  await flush()
  scheduler.update([want('a', 1, 512)], false)
  assert.equal(calls[1].tier, 512)
  calls[1].resolve('large')
  await flush()
  assert.deepEqual(loaded, [
    ['a', 128],
    ['a', 512],
  ])
  assert.equal(scheduler.has('a'), 512)
})

it('keeps a loaded higher tier when a lower one is wanted', async () => {
  const { scheduler, calls } = setup()
  scheduler.update([want('a', 1, 512)], false)
  calls[0].resolve('large')
  await flush()
  scheduler.update([want('a', 1, 128)], false)
  assert.equal(calls.length, 1)
  assert.equal(scheduler.has('a'), 512)
})

it('evicts the least recently wanted photos once over budget', async () => {
  const { scheduler, calls, evicted } = setup({ concurrency: 4, budgetBytes: 2 * 128 * 128 * 4 })
  scheduler.update([want('old', 1)], false)
  calls[0].resolve('O')
  await flush()
  scheduler.update([want('mid', 1)], false)
  calls[1].resolve('M')
  await flush()
  scheduler.update([want('new', 1)], false)
  calls[2].resolve('N')
  await flush()
  assert.deepEqual(evicted, ['old'])
  assert.equal(scheduler.has('old'), 0)
  assert.equal(scheduler.has('mid'), 128)
})

it('never evicts photos that are wanted right now, even over budget', async () => {
  const { scheduler, calls, evicted } = setup({ concurrency: 4, budgetBytes: 128 * 128 * 4 })
  scheduler.update([want('a', 1), want('b', 2)], false)
  calls[0].resolve('A')
  calls[1].resolve('B')
  await flush()
  assert.deepEqual(evicted, [])
})

it('retries a failed load once and then leaves the photo on its placeholder', async () => {
  const { scheduler, calls, loaded } = setup()
  scheduler.update([want('a', 1)], false)
  calls[0].reject(new Error('cors'))
  await flush()
  scheduler.update([want('a', 1)], false)
  assert.equal(calls.length, 2)
  calls[1].reject(new Error('cors'))
  await flush()
  scheduler.update([want('a', 1)], false)
  assert.equal(calls.length, 2)
  assert.deepEqual(loaded, [])
})

it('dispose aborts everything in flight', () => {
  const { scheduler, calls } = setup()
  scheduler.update([want('a', 1), want('b', 2)], false)
  scheduler.dispose()
  assert.deepEqual(
    calls.map(call => call.signal.aborted),
    [true, true],
  )
})
