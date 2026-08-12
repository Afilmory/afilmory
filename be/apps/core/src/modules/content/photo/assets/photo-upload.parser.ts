import { Buffer } from 'node:buffer'
import process from 'node:process'
import { Readable } from 'node:stream'

import { BizException, ErrorCode } from '@core/errors'
import { quotaExceeded } from '@core/modules/platform/billing/quota/billing-quota.error'
import type { FileInfo } from 'busboy'
import Busboy from 'busboy'
import type { Context } from 'hono'
import { injectable } from 'tsyringe'

import { formatBytesForDisplay, normalizeDirectoryValue, normalizeRequestHeaders } from '../storage/storage.utils'
import type { UploadAssetInput } from './photo-asset.types'
import { MAX_TEXT_FIELDS_PER_REQUEST, MAX_UPLOAD_FILES_PER_BATCH } from './photo-upload-limits'

type MultipartParseOptions = {
  fileSizeLimitBytes: number
  totalSizeLimitBytes: number
  abortSignal?: AbortSignal
}

@injectable()
export class PhotoUploadParser {
  async parse(context: Context, options: MultipartParseOptions): Promise<UploadAssetInput[]> {
    const headers = normalizeRequestHeaders(context.req.raw.headers)
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
    const abortSignal = options.abortSignal ?? context.req.raw.signal

    return await new Promise<UploadAssetInput[]>((resolve, reject) => {
      const files: UploadAssetInput[] = []
      let directory: string | null = null
      let totalBytes = 0
      let settled = false

      const cleanup = () => {
        if (abortSignal) {
          abortSignal.removeEventListener('abort', onAbort)
        }
        requestStream.removeListener('error', onStreamError)
      }

      const fail = (error: Error) => {
        if (settled) {
          return
        }
        settled = true
        busboy.destroy(error)
        requestStream.destroy()
        cleanup()
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

      function onAbort() {
        fail(new DOMException('Upload aborted', 'AbortError'))
      }

      function onStreamError(error: Error) {
        fail(error)
      }

      if (abortSignal) {
        abortSignal.addEventListener('abort', onAbort)
      }
      requestStream.on('error', onStreamError)

      busboy.on('field', (name, value) => {
        if (name !== 'directory') {
          return
        }

        if (directory !== null) {
          return
        }

        if (typeof value === 'string') {
          directory = normalizeDirectoryValue(value)
        }
      })

      busboy.on('file', (fieldName: string, stream, info: FileInfo) => {
        if (fieldName !== 'files') {
          stream.resume()
          return
        }

        const chunks: Buffer[] = []
        let streamFinished = false

        const handleChunk = (chunk: Buffer) => {
          if (settled || streamFinished) {
            return
          }

          totalBytes += chunk.length
          if (totalBytes > normalizedBatchLimit) {
            stream.removeListener('data', handleChunk)
            stream.resume()
            process.nextTick(() => {
              fail(
                quotaExceeded({
                  reason: 'upload_size',
                  message: `单次上传大小不能超过 ${formatBytesForDisplay(normalizedBatchLimit)}`,
                  details: {
                    limitMb: normalizedBatchLimit / 1024 / 1024,
                    actualMb: null,
                  },
                }),
              )
            })
            return
          }

          chunks.push(chunk)
        }

        stream.on('data', handleChunk)
        stream.once('limit', () => {
          streamFinished = true
          stream.removeListener('data', handleChunk)
          stream.resume()
          process.nextTick(() => {
            fail(
              quotaExceeded({
                reason: 'upload_size',
                message: `文件 ${info.filename} 超出大小限制 ${formatBytesForDisplay(normalizedFileSizeLimit)}`,
                details: {
                  limitMb: normalizedFileSizeLimit / 1024 / 1024,
                  actualMb: null,
                },
              }),
            )
          })
        })
        stream.once('error', (error) => {
          fail(error instanceof Error ? error : new Error('文件上传失败'))
        })
        stream.once('end', () => {
          streamFinished = true
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
