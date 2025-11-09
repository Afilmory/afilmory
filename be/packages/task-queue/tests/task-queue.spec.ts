import { randomUUID } from 'node:crypto'

import { createApplication, Module } from '@afilmory/framework'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InMemoryQueueDriver } from '../src/drivers/in-memory.driver'
import { TaskQueue } from '../src/task-queue'
import { TaskQueueManager } from '../src/task-queue.manager'
import { TaskQueueModule } from '../src/task-queue.module'
import type { DriverTask, PollOptions, TaskContext, TaskQueueDriver } from '../src/types'
import { TaskDropError, TaskRetryError } from '../src/types'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('TaskQueue', () => {
  let queue: TaskQueue

  beforeEach(() => {
    queue = new TaskQueue({
      name: 'emails',
      driver: new InMemoryQueueDriver({ name: 'emails' }),
      concurrency: 2,
    })
  })

  it('allows middleware to override retry logic explicitly', async () => {
    queue.use(async (ctx, next) => {
      ctx.setRetry({ retry: false })
      await next()
    })

    const handler = vi.fn(async () => {
      throw new Error('boom')
    })

    queue.registerHandler('no-retry', handler, { maxAttempts: 3 })

    await queue.start()
    await queue.enqueue({ name: 'no-retry', payload: {} })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(handler).toHaveBeenCalledTimes(1)
    const stats = await queue.getStats()
    expect(stats.queued).toBe(0)
    await queue.shutdown()
  })

  it('executes registered handlers with middleware pipeline', async () => {
    const middleware = vi.fn(async (ctx: TaskContext, next) => {
      ctx.logger.info('middleware before', { taskId: ctx.taskId })
      await next()
      ctx.logger.info('middleware after', { taskId: ctx.taskId })
    })

    queue.use(middleware)

    const handler = vi.fn(async (payload: { to: string }, ctx: TaskContext) => {
      ctx.result = `sent:${payload.to}`
    })

    queue.registerHandler('send-email', handler)

    await queue.start()
    await queue.enqueue({ name: 'send-email', payload: { to: 'user@example.com' } })

    await flush()
    await flush()

    expect(middleware).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledTimes(1)
    const [payload, ctx] = handler.mock.calls[0]
    expect(payload.to).toBe('user@example.com')
    expect(ctx.metadata.attempts).toBe(1)
    await queue.shutdown()
  })

  it('retries handler failures with exponential backoff', async () => {
    const attempts: number[] = []

    queue.registerHandler(
      'unstable-task',
      async (_payload, ctx) => {
        attempts.push(ctx.metadata.attempts)
        if (ctx.metadata.attempts < 3) {
          throw new Error('temporary')
        }
      },
      {
        maxAttempts: 5,
        backoffStrategy: (attempt) => attempt * 10,
      },
    )

    await queue.start()
    await queue.enqueue({ name: 'unstable-task', payload: {} })

    await new Promise((resolve) => setTimeout(resolve, 120))

    expect(attempts).toEqual([1, 2, 3])
    await queue.shutdown()
  })

  it('prevents duplicate handler registration and missing handler enqueue', async () => {
    queue.registerHandler('dup', async () => {})
    expect(() => queue.registerHandler('dup', async () => {})).toThrow(/already exists/)
    await expect(queue.enqueue({ name: 'unknown', payload: {} })).rejects.toThrow(/not registered/)
  })

  it('allows handlers to opt-out of retries via special errors', async () => {
    const dropHandler = vi.fn(async () => {
      throw new TaskDropError('drop')
    })
    queue.registerHandler('drop-task', dropHandler)

    const retryHandler = vi.fn(async () => {
      throw new TaskRetryError('retry', 5)
    })

    queue.registerHandler('retry-task', retryHandler, { maxAttempts: 2 })

    await queue.start()
    await queue.enqueue({ name: 'drop-task', payload: {} })
    await queue.enqueue({ name: 'retry-task', payload: {} })

    await new Promise((resolve) => setTimeout(resolve, 80))

    expect(dropHandler).toHaveBeenCalledTimes(1)
    expect(retryHandler).toHaveBeenCalledTimes(2)
    await queue.shutdown()
  })

  it('reports stats from the driver', async () => {
    queue.registerHandler('noop', async () => {})
    await queue.start()

    await queue.enqueue({ name: 'noop', payload: {}, runAt: Date.now() + 50 })
    const statsBefore = await queue.getStats()
    expect(statsBefore.scheduled).toBe(1)

    await flush()
    await queue.shutdown()
  })

  it('stops polling when requested', async () => {
    queue.registerHandler('noop', async () => {})
    await queue.start()
    await queue.stop()
    expect(await queue.getStats()).toMatchObject({ queued: 0 })
    await queue.shutdown()
  })

  it('ignores subsequent start invocations when already running', async () => {
    queue.registerHandler('noop', async () => {})
    await queue.start()
    await queue.start()
    await queue.shutdown()
  })

  it('derives queue name and accepts middlewares via options', () => {
    const fn = vi.fn(async (_ctx: TaskContext, next: () => Promise<void>) => {
      await next()
    })
    const customQueue = new TaskQueue({ name: 'custom', middlewares: [fn] })
    expect(customQueue.name).toBe('custom')
  })

  it('acknowledges tasks with missing handlers gracefully', async () => {
    const driver = new InMemoryQueueDriver({ name: 'missing' })
    const orphanQueue = new TaskQueue({ name: 'missing', driver })
    orphanQueue.registerHandler('ephemeral', async () => {})
    await orphanQueue.start()

    const task = {
      id: randomUUID(),
      name: 'ephemeral',
      payload: {},
      attempts: 0,
      runAt: Date.now(),
      priority: 0,
      enqueueTime: Date.now(),
    }

    // Simulate handler removal after enqueue to test defensive path
    ;(orphanQueue as any).handlers.delete('ephemeral')
    await driver.enqueue(task)

    await new Promise((resolve) => setTimeout(resolve, 25))
    const stats = await orphanQueue.getStats()
    expect(stats.inFlight).toBe(0)
    await orphanQueue.shutdown()
  })

  it('logs polling failures without terminating the loop', async () => {
    const pollError = new Error('driver failure')
    const driver: TaskQueueDriver = {
      enqueue: vi.fn().mockResolvedValue(),
      reschedule: vi.fn().mockResolvedValue(),
      poll: vi.fn().mockRejectedValue(pollError),
      acknowledge: vi.fn().mockResolvedValue(),
      fail: vi.fn().mockResolvedValue(),
      stats: vi.fn().mockResolvedValue({ queued: 0, inFlight: 0, scheduled: 0 }),
      shutdown: vi.fn().mockResolvedValue(),
    }

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const resilientQueue = new TaskQueue({ name: 'faulty', driver })
    resilientQueue.registerHandler('noop', async () => {})
    await resilientQueue.start({ pollIntervalMs: 10 })
    await new Promise((resolve) => setTimeout(resolve, 25))
    await resilientQueue.shutdown()
    errorSpy.mockRestore()
    expect(driver.poll).toHaveBeenCalled()
  })

  it('handles abort-aware drivers gracefully', async () => {
    class AbortDriver implements TaskQueueDriver {
      enqueue = vi.fn().mockResolvedValue()
      reschedule = vi.fn().mockResolvedValue()
      acknowledge = vi.fn().mockResolvedValue()
      fail = vi.fn().mockResolvedValue()
      stats = vi.fn().mockResolvedValue({ queued: 0, inFlight: 0, scheduled: 0 })
      shutdown = vi.fn().mockResolvedValue()
      poll = vi.fn(
        ({ signal }: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              reject(new Error('aborted'))
            })
          }),
      ) as unknown as (options: PollOptions) => Promise<DriverTask | null>
    }

    const driver = new AbortDriver()
    const queue = new TaskQueue({ name: 'abort-aware', driver })
    queue.registerHandler('noop', async () => {})
    await queue.start({ pollIntervalMs: 5 })
    await queue.stop()
    await queue.shutdown()
    expect(driver.poll).toHaveBeenCalled()
  })
})

describe('TaskQueueManager', () => {
  it('creates, lists, and reuses queues', async () => {
    const manager = new TaskQueueManager()
    const first = manager.createQueue('jobs', { start: false })
    const second = manager.ensureQueue('jobs')

    expect(first).toBe(second)
    expect(manager.listQueues()).toHaveLength(1)
    expect(manager.getQueue('missing')).toBeUndefined()

    await manager.shutdownAll(false)
  })

  it('auto-starts queues by default', async () => {
    const manager = new TaskQueueManager()
    const queue = manager.createQueue('auto')
    queue.registerHandler('noop', async () => {})
    await queue.enqueue({ name: 'noop', payload: {} })
    await new Promise((resolve) => setTimeout(resolve, 20))
    await manager.shutdownAll()
  })
})

describe('InMemoryQueueDriver', () => {
  it('supports scheduling and poll timeout behavior', async () => {
    const driver = new InMemoryQueueDriver({ name: 'tests' })
    const future = Date.now() + 20
    await driver.enqueue({
      id: randomUUID(),
      name: 'job',
      payload: {},
      attempts: 0,
      runAt: future,
      priority: 0,
      enqueueTime: Date.now(),
    })

    const none = await driver.poll({ timeoutMs: 5, visibilityTimeoutMs: 1000 })
    expect(none).toBeNull()

    await new Promise((resolve) => setTimeout(resolve, 30))
    const task = await driver.poll({ timeoutMs: 5, visibilityTimeoutMs: 1000 })
    expect(task?.name).toBe('job')
    await driver.acknowledge(task!)
    await driver.shutdown()

    await expect(
      driver.enqueue({
        id: randomUUID(),
        name: 'job',
        payload: {},
        attempts: 0,
        runAt: Date.now(),
        priority: 0,
        enqueueTime: Date.now(),
      }),
    ).rejects.toThrow('Driver stopped')
  })

  it('returns immediately when polling with an aborted signal', async () => {
    const driver = new InMemoryQueueDriver({ name: 'abort' })
    const controller = new AbortController()
    controller.abort()
    const result = await driver.poll({ timeoutMs: 1000, visibilityTimeoutMs: 1000, signal: controller.signal })
    expect(result).toBeNull()
    await driver.shutdown()
  })

  it('resolves pending pollers during shutdown', async () => {
    const driver = new InMemoryQueueDriver({ name: 'shutdown' })
    const pending = driver.poll({ timeoutMs: 1000, visibilityTimeoutMs: 1000 })
    await new Promise((resolve) => setTimeout(resolve, 10))
    await driver.shutdown()
    expect(await pending).toBeNull()
    const after = await driver.poll({ timeoutMs: 10, visibilityTimeoutMs: 10 })
    expect(after).toBeNull()
  })

  it('cleans signal listeners on timeout', async () => {
    const driver = new InMemoryQueueDriver({ name: 'signal' })
    const controller = new AbortController()
    const result = await driver.poll({ timeoutMs: 10, visibilityTimeoutMs: 10, signal: controller.signal })
    expect(result).toBeNull()
    await driver.shutdown()
  })
})

describe('TaskQueueModule integration', () => {
  it('registers the TaskQueueManager provider', async () => {
    @Module({
      imports: [TaskQueueModule],
    })
    class RootModule {}

    const app = await createApplication(RootModule)
    const manager = app.getContainer().resolve(TaskQueueManager)
    expect(manager).toBeInstanceOf(TaskQueueManager)
  })
})
