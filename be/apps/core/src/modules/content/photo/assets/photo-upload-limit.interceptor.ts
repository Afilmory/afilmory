import type { CallHandler, ExecutionContext, FrameworkResponse, Interceptor } from '@tsuki/framework'
import { BizException, ErrorCode } from 'core/errors'
import { injectable } from 'tsyringe'

import { PhotoAssetService } from './photo-asset.service'
import { PhotoUploadParser } from './photo-upload.parser'
import {
  resolveBatchSizeLimitBytes,
  resolveFileSizeLimitBytes,
  setPhotoUploadInputsOnContext,
  setPhotoUploadLimitsOnContext,
} from './photo-upload-limits'

@injectable()
export class PhotoUploadLimitInterceptor implements Interceptor {
  constructor(
    private readonly photoAssetService: PhotoAssetService,
    private readonly photoUploadParser: PhotoUploadParser,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<FrameworkResponse> {
    const { hono } = context.getContext()
    const uploadSizeLimitBytes = await this.photoAssetService.getUploadSizeLimitBytes()
    const fileSizeLimitBytes = resolveFileSizeLimitBytes(uploadSizeLimitBytes)
    const totalSizeLimitBytes = resolveBatchSizeLimitBytes(fileSizeLimitBytes)

    const inputs = await this.photoUploadParser.parse(hono, {
      fileSizeLimitBytes,
      totalSizeLimitBytes,
    })

    if (inputs.length === 0) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: '未找到可上传的文件',
      })
    }

    setPhotoUploadLimitsOnContext(hono, {
      fileSizeLimitBytes,
      totalSizeLimitBytes,
    })
    setPhotoUploadInputsOnContext(hono, inputs)

    return await next.handle()
  }
}
