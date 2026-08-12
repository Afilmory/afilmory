import type { BuilderConfig, StorageConfig } from '@afilmory/builder'
import { TenantRoles } from '@core/guards/roles.decorator'
import { createProgressSseResponse } from '@core/modules/shared/http/sse'
import { describeStreamError } from '@core/modules/shared/http/sse-error'
import { Body, ContextParam, Controller, createLogger, Get, Param, Post } from '@tsuki-hono/common'
import type { Context } from 'hono'

import { runWithBuilderLogRelay } from './builder-log-relay'
import type { ResolveConflictInput, RunDataSyncInput } from './data-sync.dto'
import { ResolveConflictDto, RunDataSyncDto } from './data-sync.dto'
import { DataSyncService } from './data-sync.service'
import type {
  DataSyncAction,
  DataSyncConflict,
  DataSyncProgressEmitter,
  DataSyncProgressEvent,
  DataSyncStatus,
} from './data-sync.types'

@Controller('data-sync')
@TenantRoles('admin')
export class DataSyncController {
  private readonly logger = createLogger('DataSyncController')
  constructor(private readonly dataSyncService: DataSyncService) {}

  @Post('run')
  async run(@Body() body: RunDataSyncDto, @ContextParam() context: Context): Promise<Response> {
    const payload = body as unknown as RunDataSyncInput
    return createProgressSseResponse<DataSyncProgressEvent>({
      context,
      handler: async ({ sendEvent }) => {
        const progressHandler: DataSyncProgressEmitter = async (event) => {
          await sendEvent(event)
        }

        try {
          await runWithBuilderLogRelay(progressHandler, () =>
            this.dataSyncService.runSync(
              {
                builderConfig: payload.builderConfig as BuilderConfig | undefined,
                storageConfig: payload.storageConfig as StorageConfig | undefined,
                dryRun: payload.dryRun ?? false,
              },
              progressHandler,
            ))
        }
        catch (error) {
          this.logger.error('Failed to run data sync', error)
          await sendEvent({ type: 'error', payload: describeStreamError(error) })
        }
      },
    })
  }

  @Get('status')
  async status(): Promise<DataSyncStatus> {
    return await this.dataSyncService.getStatus()
  }

  @Get('conflicts')
  async listConflicts(): Promise<DataSyncConflict[]> {
    return await this.dataSyncService.listConflicts()
  }

  @Post('conflicts/:id/resolve')
  async resolve(@Param('id') id: string, @Body() body: ResolveConflictDto): Promise<DataSyncAction> {
    const payload = body as unknown as ResolveConflictInput
    return await this.dataSyncService.resolveConflict(id, {
      strategy: payload.strategy,
      builderConfig: payload.builderConfig as BuilderConfig | undefined,
      storageConfig: payload.storageConfig as StorageConfig | undefined,
      dryRun: payload.dryRun ?? false,
    })
  }
}
