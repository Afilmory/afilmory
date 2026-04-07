import { createLogger } from '@tsuki/framework'
import { injectable } from 'tsyringe'

import { InMemoryQueueDriver } from './drivers/in-memory.driver'
import { TaskQueue } from './task-queue'
import type { TaskQueueDriver, TaskQueueOptions } from './types'

export interface CreateQueueOptions extends TaskQueueOptions {
  driver?: TaskQueueDriver
  start?: boolean
}

@injectable()
export class TaskQueueManager {
  private readonly queues = new Map<string, TaskQueue>()
  private readonly logger = createLogger('TaskQueueManager')

  getQueue(name = 'default'): TaskQueue | undefined {
    return this.queues.get(name)
  }

  listQueues(): TaskQueue[] {
    return [...this.queues.values()]
  }

  createQueue(name = 'default', options: CreateQueueOptions = {}): TaskQueue {
    if (this.queues.has(name)) {
      return this.queues.get(name) as TaskQueue
    }

    const queue = new TaskQueue({
      ...options,
      name,
      driver: options.driver ?? new InMemoryQueueDriver({ name }),
    })

    this.queues.set(name, queue)
    this.logger.info('Registered task queue', { name, concurrency: options.concurrency ?? 1 })

    if (options.start !== false) {
      void queue.start()
    }

    return queue
  }

  ensureQueue(name = 'default', options: CreateQueueOptions = {}): TaskQueue {
    return this.createQueue(name, options)
  }

  async shutdownAll(graceful = true): Promise<void> {
    const queues = [...this.queues.values()]
    await Promise.all(queues.map((queue) => (graceful ? queue.shutdown() : queue.stop())))
    this.queues.clear()
  }
}
