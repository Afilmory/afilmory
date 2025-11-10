import { Body, ContextParam, Controller, Delete, Get, Post, Query } from '@afilmory/framework'
import { BizException, ErrorCode } from 'core/errors'
import { Roles } from 'core/guards/roles.decorator'
import type { Context } from 'hono'
import { inject } from 'tsyringe'

import type { PhotoAssetListItem, PhotoAssetSummary } from './photo-asset.service'
import { PhotoAssetService } from './photo-asset.service'

type DeleteAssetsDto = {
  ids: string[]
}

@Controller('photos')
@Roles('admin')
export class PhotoController {
  constructor(@inject(PhotoAssetService) private readonly photoAssetService: PhotoAssetService) {}

  @Get('assets')
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
    await this.photoAssetService.deleteAssets(ids)
    return { ids, deleted: true }
  }

  @Post('assets/upload')
  async uploadAssets(@ContextParam() context: Context) {
    const payload = await context.req.parseBody()

    const files: File[] = []
    for (const value of Object.values(payload)) {
      if (value instanceof File) {
        files.push(value)
      } else if (Array.isArray(value)) {
        for (const entry of value) {
          if (entry instanceof File) {
            files.push(entry)
          }
        }
      }
    }

    if (files.length === 0) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: '未找到可上传的文件',
      })
    }

    const inputs = await Promise.all(
      files.map(async (file) => ({
        filename: file.name,
        buffer: Buffer.from(await file.arrayBuffer()),
        contentType: file.type || undefined,
      })),
    )

    const assets = await this.photoAssetService.uploadAssets(inputs)
    return { assets }
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
}
