import { Module } from '@tsuki/framework'

import { TaskQueueManager } from './task-queue.manager'

@Module({
  providers: [TaskQueueManager],
})
export class TaskQueueModule {}
