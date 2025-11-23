import { Readable } from 'node:stream'

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
} from '@afilmory/framework'
import type { FileInfo } from 'busboy'
import Busboy from 'busboy'
import { BizException, ErrorCode } from 'core/errors'
import { Roles } from 'core/guards/roles.decorator'
import { BypassResponseTransform } from 'core/interceptors/response-transform.decorator'
import type { DataSyncProgressEvent } from 'core/modules/infrastructure/data-sync/data-sync.types'
import { createProgressSseResponse } from 'core/modules/shared/http/sse'
import type { Context } from 'hono'
import { inject } from 'tsyringe'

import { UpdatePhotoTagsDto } from './photo-asset.dto'
import { PhotoAssetService } from './photo-asset.service'
import type { PhotoAssetListItem, PhotoAssetSummary, UploadAssetInput } from './photo-asset.types'

const ABSOLUTE_MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024 // 30 MB
const ABSOLUTE_MAX_REQUEST_SIZE_BYTES = 200 * 1024 * 1024 // 200MB
const MAX_UPLOAD_FILES_PER_BATCH = 32
const MAX_TEXT_FIELDS_PER_REQUEST = 64
const BYTES_PER_MB = 1024 * 1024

type MultipartParseOptions = {
  fileSizeLimitBytes: number
  totalSizeLimitBytes: number
  abortSignal: AbortSignal
}

function formatBytesToMb(bytes: number): number {
  return Number((bytes / BYTES_PER_MB).toFixed(2))
}

function formatBytesForDisplay(bytes: number): string {
  return `${formatBytesToMb(bytes)} MB`
}

type DeleteAssetsDto = {
  ids?: string[]
  deleteFromStorage?: boolean
}

@Controller('photos')
@Roles('admin')
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

  @Post('assets/upload')
  async uploadAssets(@ContextParam() context: Context): Promise<Response> {
    return createProgressSseResponse<DataSyncProgressEvent>({
      context,
      handler: async ({ sendEvent, abortSignal }) => {
        try {
          const uploadSizeLimitBytes = await this.photoAssetService.getUploadSizeLimitBytes()
          const fileSizeLimitBytes = this.resolveFileSizeLimitBytes(uploadSizeLimitBytes)
          const totalSizeLimitBytes = this.resolveBatchSizeLimitBytes(fileSizeLimitBytes)
          this.assertRequestSizeWithinLimit(context, totalSizeLimitBytes)

          const inputs = await this.parseUploadPayload(context, {
            fileSizeLimitBytes,
            totalSizeLimitBytes,
            abortSignal,
          })

          if (inputs.length === 0) {
            throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
              message: '未找到可上传的文件',
            })
          }

          await this.photoAssetService.uploadAssets(inputs, {
            progress: async (event) => {
              await sendEvent(event)
            },
            abortSignal,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : '上传失败'

          this.logger.error(error)
          await sendEvent({ type: 'error', payload: { message } })
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

  private resolveFileSizeLimitBytes(limitFromPlan: number | null): number {
    const resolved = limitFromPlan ?? ABSOLUTE_MAX_FILE_SIZE_BYTES
    return Math.min(Math.max(resolved, 1), ABSOLUTE_MAX_FILE_SIZE_BYTES)
  }

  private resolveBatchSizeLimitBytes(fileSizeLimitBytes: number): number {
    const normalizedFileLimit = Math.max(fileSizeLimitBytes, 1)
    const theoreticalBatchLimit = normalizedFileLimit * MAX_UPLOAD_FILES_PER_BATCH
    return Math.min(theoreticalBatchLimit, ABSOLUTE_MAX_REQUEST_SIZE_BYTES)
  }

  private assertRequestSizeWithinLimit(context: Context, limitBytes: number): void {
    const contentLengthHeader = context.req.header('content-length')
    if (!contentLengthHeader) {
      return
    }

    const contentLength = Number(contentLengthHeader)
    if (!Number.isFinite(contentLength) || contentLength <= limitBytes) {
      return
    }

    throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
      message: `单次上传大小不能超过 ${formatBytesForDisplay(limitBytes)}`,
    })
  }

  private async parseUploadPayload(context: Context, options: MultipartParseOptions): Promise<UploadAssetInput[]> {
    const headers = this.normalizeRequestHeaders(context.req.raw.headers)
    if (!headers['content-type']) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '缺少 Content-Type 头' })
    }

    const normalizedFileSizeLimit = Math.max(1, Math.floor(options.fileSizeLimitBytes))
    const normalizedBatchLimit = Math.max(normalizedFileSizeLimit, Math.floor(options.totalSizeLimitBytes))
    const busboy = Busboy({
      headers,
      limits: {
        fileSize: normalizedFileSizeLimit,
        files: MAX_UPLOAD_FILES_PER_BATCH,
        fields: MAX_TEXT_FIELDS_PER_REQUEST,
      },
    })

    const requestStream = this.createReadableFromRequest(context.req.raw)

    return await new Promise<UploadAssetInput[]>((resolve, reject) => {
      const files: UploadAssetInput[] = []
      let directory: string | null = null
      let totalBytes = 0
      let settled = false

      const cleanup = () => {
        options.abortSignal.removeEventListener('abort', onAbort)
        requestStream.removeListener('error', onStreamError)
      }

      const fail = (error: Error) => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        requestStream.destroy(error)
        busboy.destroy(error)
        reject(error)
      }

      const finish = () => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        resolve(files)
      }

      const onAbort = () => {
        fail(new DOMException('Upload aborted', 'AbortError'))
      }

      const onStreamError = (error: Error) => {
        fail(error)
      }

      options.abortSignal.addEventListener('abort', onAbort)
      requestStream.on('error', onStreamError)

      busboy.on('field', (name, value) => {
        if (name !== 'directory') {
          return
        }

        if (directory !== null) {
          return
        }

        if (typeof value === 'string') {
          directory = this.normalizeDirectoryValue(value)
        }
      })

      busboy.on('file', (fieldName: string, stream, info: FileInfo) => {
        if (fieldName !== 'files') {
          stream.resume()
          return
        }

        const chunks: Buffer[] = []

        const handleChunk = (chunk: Buffer) => {
          if (settled) {
            return
          }

          totalBytes += chunk.length
          if (totalBytes > normalizedBatchLimit) {
            stream.removeListener('data', handleChunk)
            fail(
              new BizException(ErrorCode.COMMON_BAD_REQUEST, {
                message: `单次上传大小不能超过 ${formatBytesForDisplay(normalizedBatchLimit)}`,
              }),
            )
            return
          }

          chunks.push(chunk)
        }

        stream.on('data', handleChunk)
        stream.once('limit', () => {
          fail(
            new BizException(ErrorCode.COMMON_BAD_REQUEST, {
              message: `文件 ${info.filename} 超出大小限制 ${formatBytesForDisplay(normalizedFileSizeLimit)}`,
            }),
          )
        })
        stream.once('error', (error) => {
          fail(error instanceof Error ? error : new Error('文件上传失败'))
        })
        stream.once('end', () => {
          if (settled) {
            return
          }

          const buffer = Buffer.concat(chunks)
          files.push({
            filename: info.filename,
            buffer,
            contentType: info.mimeType || undefined,
            directory,
          })
        })
      })

      busboy.once('error', (error) => {
        fail(error instanceof Error ? error : new Error('上传解析失败'))
      })
      busboy.once('filesLimit', () => {
        fail(
          new BizException(ErrorCode.COMMON_BAD_REQUEST, {
            message: `单次最多支持上传 ${MAX_UPLOAD_FILES_PER_BATCH} 个文件`,
          }),
        )
      })
      busboy.once('fieldsLimit', () => {
        fail(new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '附带字段数量超出限制' }))
      })
      busboy.once('partsLimit', () => {
        fail(new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '上传内容分片数量超出限制' }))
      })
      busboy.once('finish', finish)

      requestStream.pipe(busboy)
    })
  }

  private normalizeDirectoryValue(value: string | null): string | null {
    if (!value) {
      return null
    }
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  private normalizeRequestHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {}
    headers.forEach((value, key) => {
      result[key.toLowerCase()] = value
    })
    return result
  }

  private createReadableFromRequest(request: Request): Readable {
    if (request.bodyUsed) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '请求体已被消费' })
    }
    if (!request.body) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '上传请求缺少内容' })
    }

    return Readable.fromWeb(request.body as any)
  }
}
