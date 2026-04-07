import { randomUUID } from 'node:crypto'

import type { PrettyLogger } from '@tsuki/framework'
import { createLogger } from '@tsuki/framework'

import { InMemoryQueueDriver } from './drivers/in-memory.driver'
import type {
  DriverTask,
  EnqueueTaskOptions,
  RegisteredTaskHandler,
  RetryDecision,
  TaskContext,
  TaskHandler,
  TaskHandlerOptions,
  TaskMiddleware,
  TaskQueueDriver,
  TaskQueueOptions,
  TaskQueueStats,
} from './types'
import { TaskDropError, TaskRetryError } from './types'

const DEFAULT_TIMEOUT = 1000

function defaultHandlerOptions(): Required<TaskHandlerOptions> {
  return {
    maxAttempts: 5,
    backoffStrategy: (attempt) => Math.min(60_000, 2 ** (attempt - 1) * 1000),
    retryableFilter: () => true,
  }
}

function normalizeHandlerOptions(options?: TaskHandlerOptions): Required<TaskHandlerOptions> {
  const base = defaultHandlerOptions()
  return {
    maxAttempts: options?.maxAttempts ?? base.maxAttempts,
    backoffStrategy: options?.backoffStrategy ?? base.backoffStrategy,
    retryableFilter: options?.retryableFilter ?? base.retryableFilter,
  }
}

function compose<TPayload>(middlewares: Array<TaskMiddleware<TPayload>>, handler: TaskMiddleware<TPayload>) {
  const stack = [...middlewares, handler]
  return async (context: TaskContext<TPayload>) => {
    let index = -1
    const dispatch = async (i: number): Promise<void> => {
      /* c8 ignore next 3 */
      if (i <= index) {
        throw new Error('next() called multiple times in task middleware')
      }
      index = i
      const middleware = stack[i]
      /* c8 ignore next 3 */
      if (!middleware) {
        return
      }
      await middleware(context, () => dispatch(i + 1))
    }

    await dispatch(0)
  }
}

export interface TaskQueueStartOptions {
  pollIntervalMs?: number
}

export class TaskQueue {
  private readonly handlers = new Map<string, RegisteredTaskHandler>()
  private readonly middlewares: TaskMiddleware[] = []
  private readonly driver: TaskQueueDriver
  private readonly logger: PrettyLogger
  private running = false
  private pollAbort?: AbortController
  private readonly visibilityTimeout: number

  constructor(private readonly options: TaskQueueOptions = {}) {
    this.driver = options.driver ?? new InMemoryQueueDriver({ name: options.name })
    this.logger = options.logger ?? createLogger(`TaskQueue${options.name ? `:${options.name}` : ''}`)
    this.visibilityTimeout = Math.max(5_000, options.visibilityTimeoutMs ?? 30_000)

    if (options.middlewares) {
      for (const middleware of options.middlewares) {
        this.use(middleware)
      }
    }
  }

  get name(): string {
    return this.options.name ?? 'default'
  }

  use(middleware: TaskMiddleware): this {
    this.middlewares.push(middleware)
    return this
  }

  registerHandler<TPayload>(name: string, handler: TaskHandler<TPayload>, options?: TaskHandlerOptions): void {
    if (this.handlers.has(name)) {
      throw new Error(`Handler for task "${name}" already exists`)
    }

    this.handlers.set(name, {
      name,
      handler: handler as TaskHandler,
      options: normalizeHandlerOptions(options),
    })
  }

  async enqueue<TPayload>(options: EnqueueTaskOptions<TPayload>): Promise<DriverTask<TPayload>> {
    const handler = this.handlers.get(options.name)
    if (!handler) {
      throw new Error(`Handler for task "${options.name}" is not registered`)
    }

    const now = Date.now()
    const task: DriverTask<TPayload> = {
      id: options.id ?? randomUUID(),
      name: options.name,
      payload: options.payload,
      attempts: 0,
      runAt: options.runAt ?? now,
      priority: options.priority ?? 0,
      enqueueTime: now,
    }

    await this.driver.enqueue(task)
    return task
  }

  async getStats(): Promise<TaskQueueStats> {
    return await this.driver.stats()
  }

  async start(options: TaskQueueStartOptions = {}): Promise<void> {
    if (this.running) {
      return
    }

    this.running = true
    this.pollAbort = new AbortController()
    const pollInterval = Math.max(100, options.pollIntervalMs ?? DEFAULT_TIMEOUT)

    const loop = async () => {
      const { signal } = this.pollAbort!
      while (this.running && !signal.aborted) {
        try {
          const task = await this.driver.poll({
            timeoutMs: pollInterval,
            visibilityTimeoutMs: this.visibilityTimeout,
            signal,
          })

          if (!task) {
            continue
          }

          void this.execute(task)
        } catch (error) {
          if (signal.aborted) {
            return
          }
          this.logger.error('Polling loop error', error)
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      }
    }

    void loop()
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return
    }

    this.running = false
    this.pollAbort?.abort()
    this.pollAbort = undefined
  }

  async shutdown(): Promise<void> {
    await this.stop()
    await this.driver.shutdown()
  }

  private async execute(task: DriverTask): Promise<void> {
    const handler = this.handlers.get(task.name)
    if (!handler) {
      this.logger.error(`No handler registered for task ${task.name}`)
      await this.driver.acknowledge(task)
      return
    }

    const taskLogger = this.logger.extend(task.name)
    const context: TaskContext = {
      taskId: task.id,
      name: task.name,
      payload: task.payload,
      metadata: {
        attempts: task.attempts + 1,
        enqueueTime: task.enqueueTime,
        runAt: task.runAt,
        priority: task.priority,
      },
      logger: taskLogger,
      setRetry: (decision: RetryDecision) => {
        retryDecision = decision
      },
    }

    let retryDecision: RetryDecision | undefined
    let error: unknown

    const handlerMiddleware: TaskMiddleware = async (ctx) => {
      context.result = await handler.handler(ctx.payload, ctx)
    }

    try {
      await compose(this.middlewares, handlerMiddleware)(context)
      await this.driver.acknowledge(task)
      taskLogger.info('Task completed', {
        taskId: task.id,
        attempts: context.metadata.attempts,
      })
      return
    } catch (caught) {
      error = caught
    }

    const decision = this.evaluateRetryDecision(task, handler, error, retryDecision)
    if (!decision.retry) {
      taskLogger.warn('Task dropped', { taskId: task.id, error })
      await this.driver.fail(task, error)
      return
    }

    const delay = decision.delayMs ?? handler.options.backoffStrategy(task.attempts + 1)
    const runAt = Date.now() + Math.max(0, delay)

    const retryTask: DriverTask = {
      ...task,
      attempts: task.attempts + 1,
      runAt,
      enqueueTime: task.enqueueTime,
    }

    taskLogger.warn('Task scheduled for retry', {
      taskId: task.id,
      delay,
      attempts: retryTask.attempts,
    })

    await this.driver.reschedule(retryTask, runAt)
    await this.driver.fail(task, error)
  }

  private evaluateRetryDecision(
    task: DriverTask,
    handler: RegisteredTaskHandler,
    error: unknown,
    explicit?: RetryDecision,
  ): RetryDecision {
    const attempts = task.attempts + 1
    if (attempts >= handler.options.maxAttempts) {
      return { retry: false }
    }

    if (explicit) {
      return explicit
    }

    if (error instanceof TaskDropError) {
      return { retry: false }
    }

    if (error instanceof TaskRetryError) {
      return { retry: true, delayMs: error.delayMs }
    }

    const retryable = handler.options.retryableFilter(error)
    return {
      retry: retryable,
    }
  }
}
