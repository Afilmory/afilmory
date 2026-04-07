import type { PrettyLogger } from '@tsuki/framework'

export interface TaskMetadata {
  attempts: number
  enqueueTime: number
  runAt: number
  priority: number
}

export interface TaskContext<TPayload = unknown> {
  taskId: string
  name: string
  payload: TPayload
  metadata: TaskMetadata
  logger: PrettyLogger
  result?: unknown
  setRetry: (options: RetryDecision) => void
}

export type TaskHandler<TPayload = unknown, TResult = void> = (
  payload: TPayload,
  context: TaskContext<TPayload>,
) => Promise<TResult> | TResult

export interface RetryDecision {
  retry: boolean
  delayMs?: number
}

export interface TaskHandlerOptions {
  maxAttempts?: number
  backoffStrategy?: (attempt: number) => number
  retryableFilter?: (error: unknown) => boolean
}

export type TaskMiddleware<TPayload = unknown> = (
  context: TaskContext<TPayload>,
  next: () => Promise<void>,
) => Promise<void>

export interface TaskQueueOptions {
  name?: string
  concurrency?: number
  logger?: PrettyLogger
  driver?: TaskQueueDriver
  middlewares?: TaskMiddleware[]
  visibilityTimeoutMs?: number
}

export interface EnqueueTaskOptions<TPayload = unknown> {
  name: string
  payload: TPayload
  id?: string
  runAt?: number
  priority?: number
}

export interface TaskDescriptor<TPayload = unknown> {
  id: string
  name: string
  payload: TPayload
  attempts: number
  runAt: number
  priority: number
  enqueueTime: number
}

export interface DriverTask<TPayload = unknown> extends TaskDescriptor<TPayload> {
  driverMetadata?: Record<string, unknown>
}

export interface PollOptions {
  timeoutMs: number
  visibilityTimeoutMs: number
  signal?: AbortSignal
}

export interface TaskQueueDriver {
  enqueue: <TPayload = unknown>(task: DriverTask<TPayload>) => Promise<void>
  reschedule: <TPayload = unknown>(task: DriverTask<TPayload>, runAt: number) => Promise<void>
  poll: (options: PollOptions) => Promise<DriverTask | null>
  acknowledge: (task: DriverTask) => Promise<void>
  fail: (task: DriverTask, error: unknown) => Promise<void>
  stats: () => Promise<TaskQueueStats>
  shutdown: () => Promise<void>
}

export interface TaskQueueStats {
  queued: number
  inFlight: number
  scheduled: number
}

export class TaskRetryError extends Error {
  constructor(
    message: string,
    public readonly delayMs?: number,
  ) {
    super(message)
    this.name = 'TaskRetryError'
  }
}

export class TaskDropError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TaskDropError'
  }
}

export interface RegisteredTaskHandler<TPayload = unknown> {
  name: string
  handler: TaskHandler<TPayload>
  options: Required<TaskHandlerOptions>
}
