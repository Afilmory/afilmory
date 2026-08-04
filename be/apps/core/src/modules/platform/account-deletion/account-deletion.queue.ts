import { accountDeletionRequests } from '@afilmory/db'
import { RedisQueueDriver, TaskQueue, TaskQueueManager } from '@afilmory/task-queue'
import { DbAccessor } from '@core/database/database.provider'
import { RedisAccessor } from '@core/redis/redis.provider'
import { createLogger } from '@tsuki-hono/common'
import { and, inArray, isNull, lte, or } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { AccountDeletionExecutor } from './account-deletion-executor.service'

const QUEUE_NAME = 'account-deletion'
const TASK_NAME = 'process-account-deletion'
const RECOVERY_INTERVAL_MS = 30_000

@injectable()
export class AccountDeletionQueue {
  private readonly logger = createLogger('AccountDeletionQueue')
  private readonly queue: TaskQueue
  private readonly workerRedis: ReturnType<RedisAccessor['get']>
  private recoveryTimer?: ReturnType<typeof setInterval>

  constructor(
    queueManager: TaskQueueManager,
    redisAccessor: RedisAccessor,
    private readonly dbAccessor: DbAccessor,
    private readonly executor: AccountDeletionExecutor,
  ) {
    this.workerRedis = redisAccessor.get().duplicate()
    this.queue = queueManager.createQueue(QUEUE_NAME, {
      concurrency: 2,
      driver: new RedisQueueDriver({
        queueName: QUEUE_NAME,
        redis: this.workerRedis,
        visibilityTimeoutMs: 6 * 60 * 1000,
      }),
      start: false,
      visibilityTimeoutMs: 6 * 60 * 1000,
    })
  }

  async onModuleInit(): Promise<void> {
    this.queue.registerHandler<{ requestId: string }>(TASK_NAME, async ({ requestId }) => {
      await this.executor.process(requestId)
    })
    await this.queue.start({ pollIntervalMs: 1_000 })
    await this.recoverDueRequests()
    this.recoveryTimer = setInterval(() => {
      void this.recoverDueRequests().catch((error) => {
        this.logger.error('Failed to recover account deletion requests', error)
      })
    }, RECOVERY_INTERVAL_MS)
  }

  async onModuleDestroy(): Promise<void> {
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer)
    }
    await this.queue.shutdown()
    await this.workerRedis.quit()
  }

  async enqueue(requestId: string): Promise<void> {
    await this.queue.enqueue({
      name: TASK_NAME,
      payload: { requestId },
    })
  }

  private async recoverDueRequests(): Promise<void> {
    const db = this.dbAccessor.get()
    const now = new Date().toISOString()
    const requests = await db
      .select({ id: accountDeletionRequests.id })
      .from(accountDeletionRequests)
      .where(
        and(
          inArray(accountDeletionRequests.status, ['requested', 'processing', 'retryable_failure']),
          or(isNull(accountDeletionRequests.nextAttemptAt), lte(accountDeletionRequests.nextAttemptAt, now)),
        ),
      )
    await Promise.all(requests.map(request => this.enqueue(request.id)))
  }
}
