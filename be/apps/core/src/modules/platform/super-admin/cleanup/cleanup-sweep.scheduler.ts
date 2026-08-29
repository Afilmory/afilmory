import { createLogger } from '@tsuki-hono/common'
import { injectable } from 'tsyringe'

import { SuperAdminCleanupService } from '../super-admin-cleanup.service'

const SWEEP_INTERVAL_MS = 60 * 60 * 1000

// ponytail: every instance sweeps; fine for single-node deploys. Move the tick onto the
// redis task queue if this ever runs multi-instance.

@injectable()
export class CleanupSweepScheduler {
  private readonly logger = createLogger('CleanupSweep')
  private timer?: ReturnType<typeof setInterval>

  constructor(private readonly cleanup: SuperAdminCleanupService) {}

  async onModuleInit(): Promise<void> {
    await this.run()
    this.timer = setInterval(() => {
      void this.run()
    }, SWEEP_INTERVAL_MS)
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer)
    }
  }

  private async run(): Promise<void> {
    try {
      const result = await this.cleanup.sweep()
      if (result.deleted > 0 || result.reactivated > 0 || result.failed > 0) {
        this.logger.info(
          `Cleanup sweep: deleted=${result.deleted} reactivated=${result.reactivated} failed=${result.failed}`,
        )
      }
    }
    catch (error) {
      this.logger.error('Cleanup sweep failed', error)
    }
  }
}
