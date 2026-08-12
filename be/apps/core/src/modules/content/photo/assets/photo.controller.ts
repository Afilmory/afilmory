import { getOptionalDbContext } from '@core/database/database.provider'
import { BizException, ErrorCode } from '@core/errors'
import { TenantRoles } from '@core/guards/roles.decorator'
import { BypassResponseTransform } from '@core/interceptors/response-transform.decorator'
import type { DataSyncProgressEvent } from '@core/modules/infrastructure/data-sync/data-sync.types'
import { createProgressSseResponse } from '@core/modules/shared/http/sse'
import { describeStreamError } from '@core/modules/shared/http/sse-error'
import {
  Body,
  ContextParam,
  Controller,
  createLogger,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@tsuki-hono/common'
import type { Context } from 'hono'
import { inject } from 'tsyringe'

import { UpdatePhotoTagsDto } from './photo-asset.dto'
import { PhotoAssetService } from './photo-asset.service'
import type { PhotoAssetListItem, PhotoAssetSummary } from './photo-asset.types'
import { PhotoUploadLimitInterceptor } from './photo-upload-limit.interceptor'
import { getPhotoUploadInputsFromContext } from './photo-upload-limits'

type DeleteAssetsDto = {
  ids?: string[]
  deleteFromStorage?: boolean
}

@Controller('photos')
@TenantRoles('admin')
export class PhotoController {
  constructor(@inject(PhotoAssetService) private readonly photoAssetService: PhotoAssetService) {}

  private readonly logger = createLogger(this.constructor.name)

  @Get('assets')
  @BypassResponseTransform()
  async listAssets(): Promise<PhotoAssetListItem[]> {
    return await this.photoAssetService.listAssets()
  }

  @Get('assets/summary')
  async getSummary(): Promise<PhotoAssetSummary> {
    return await this.photoAssetService.getSummary()
  }

  @Delete('assets')
  async deleteAssets(@Body() body: DeleteAssetsDto) {
    const ids = Array.isArray(body?.ids) ? body.ids : []
    const deleteFromStorageRequested = body?.deleteFromStorage === true
    const isManagedStorage = await this.photoAssetService.isManagedStorage()
    // managed storage always delete from storage
    const deleteFromStorage = isManagedStorage ? true : deleteFromStorageRequested

    await this.photoAssetService.deleteAssets(ids, { deleteFromStorage })
    return { ids, deleted: true, deleteFromStorage }
  }

  @UseInterceptors(PhotoUploadLimitInterceptor)
  @Post('assets/upload')
  async uploadAssets(@ContextParam() context: Context): Promise<Response> {
    return createProgressSseResponse<DataSyncProgressEvent>({
      context,
      handler: async ({ sendEvent, abortSignal }) => {
        try {
          const inputs = getPhotoUploadInputsFromContext(context)
          // clear the AsyncLocal DB store (transaction and cached db) at the start of the SSE handler so the subsequent service call falls back to the shared pool
          // instead of the soon-to-be-released client. This mirrors the implicit timing you had before (the handler didn’t touch the DB until after the transaction was
          // gone) and prevents Drizzle from binding to a dead connection.
          const dbContext = getOptionalDbContext()
          if (dbContext) {
            dbContext.transaction = undefined
            dbContext.db = undefined
          }

          await this.photoAssetService.uploadAssets(inputs, {
            progress: async (event) => {
              await sendEvent(event)
            },
            abortSignal,
          })
        }
        catch (error) {
          this.logger.error(error)
          await sendEvent({ type: 'error', payload: describeStreamError(error) })
        }
      },
    })
  }

  @Get('storage-url')
  async getStorageUrl(@Query() query: { key?: string }) {
    const key = query?.key?.trim()
    if (!key) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '缺少 storage key 参数' })
    }

    const url = await this.photoAssetService.generatePublicUrl(key)
    return { url }
  }

  @Patch('assets/:id/tags')
  async updateAssetTags(@Param('id') id: string, @Body() body: UpdatePhotoTagsDto): Promise<PhotoAssetListItem> {
    return await this.photoAssetService.updateAssetTags(id, body.tags ?? [])
  }
}
