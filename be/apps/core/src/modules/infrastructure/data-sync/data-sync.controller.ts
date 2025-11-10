import type { BuilderConfig, StorageConfig } from '@afilmory/builder'
import { Body, ContextParam, Controller, createLogger, Get, Param, Post } from '@afilmory/framework'
import { Roles } from 'core/guards/roles.decorator'
import type { Context } from 'hono'

import type { ResolveConflictInput, RunDataSyncInput } from './data-sync.dto'
import { ResolveConflictDto, RunDataSyncDto } from './data-sync.dto'
import { DataSyncService } from './data-sync.service'
import type {
  DataSyncAction,
  DataSyncConflict,
  DataSyncProgressEmitter,
  DataSyncProgressEvent,
} from './data-sync.types'

@Controller('data-sync')
@Roles('admin')
export class DataSyncController {
  private readonly logger = createLogger('DataSyncController')
  constructor(private readonly dataSyncService: DataSyncService) {}

  @Post('run')
  async run(@Body() body: RunDataSyncDto, @ContextParam() context: Context): Promise<Response> {
    const payload = body as unknown as RunDataSyncInput
    const encoder = new TextEncoder()
    let cleanup: (() => void) | undefined

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        let closed = false
        const rawRequest = context.req.raw
        const abortSignal = rawRequest.signal

        let heartbeat: ReturnType<typeof setInterval> | undefined
        let abortHandler: (() => void) | undefined

        const cleanupInternal = () => {
          if (heartbeat) {
            clearInterval(heartbeat)
            heartbeat = undefined
          }

          if (abortHandler) {
            abortSignal.removeEventListener('abort', abortHandler)
            abortHandler = undefined
          }

          if (!closed) {
            closed = true
            try {
              controller.close()
            } catch {
              /* ignore close errors */
            }
          }
        }

        const sendChunk = (chunk: string) => {
          if (closed) {
            return
          }

          try {
            controller.enqueue(encoder.encode(chunk))
          } catch {
            cleanupInternal()
            cleanup = undefined
          }
        }

        const sendEvent = (event: DataSyncProgressEvent) => {
          sendChunk(`event: progress\ndata: ${JSON.stringify(event)}\n\n`)
        }

        heartbeat = setInterval(() => {
          sendChunk(`: keep-alive ${new Date().toISOString()}\n\n`)
        }, 15000)

        abortHandler = () => {
          const currentCleanup = cleanup
          cleanup = undefined
          currentCleanup?.()
        }

        abortSignal.addEventListener('abort', abortHandler)

        cleanup = () => {
          cleanupInternal()
          cleanup = undefined
        }

        sendChunk(': connected\n\n')

        const progressHandler: DataSyncProgressEmitter = async (event) => {
          sendEvent(event)
        }

        ;(async () => {
          try {
            await this.dataSyncService.runSync(
              {
                builderConfig: payload.builderConfig as BuilderConfig | undefined,
                storageConfig: payload.storageConfig as StorageConfig | undefined,
                dryRun: payload.dryRun ?? false,
              },
              progressHandler,
            )
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'

            this.logger.error('Failed to run data sync', error)
            sendEvent({ type: 'error', payload: { message } })
          } finally {
            const currentCleanup = cleanup
            cleanup = undefined
            currentCleanup?.()
          }
        })().catch((error) => {
          const message = error instanceof Error ? error.message : 'Unknown error'
          sendEvent({ type: 'error', payload: { message } })
          const currentCleanup = cleanup
          cleanup = undefined
          currentCleanup?.()
        })
      },
      cancel() {
        const currentCleanup = cleanup
        cleanup = undefined
        currentCleanup?.()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
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
