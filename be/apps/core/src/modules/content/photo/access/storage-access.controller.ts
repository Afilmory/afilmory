import { ContextParam, Controller, Get, Query } from '@tsuki/framework'
import { getClientIp } from 'core/context/http-context.helper'
import { BizException, ErrorCode } from 'core/errors'
import { BypassResponseTransform } from 'core/interceptors/response-transform.decorator'
import type { Context } from 'hono'

import { StorageSignQueryDto } from './storage-access.dto'
import { StorageAccessService } from './storage-access.service'

@Controller('storage')
export class StorageAccessController {
  constructor(private readonly storageAccessService: StorageAccessService) {}

  @Get('sign')
  @BypassResponseTransform()
  async sign(@ContextParam() context: Context, @Query() query: StorageSignQueryDto) {
    if (!(await this.storageAccessService.isSecureAccessEnabled())) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '安全访问尚未启用' })
    }
    const storageKey = query.objectKey?.trim() || query.key?.trim() || ''
    const { url, expiresAt } = await this.storageAccessService.issueSignedUrl({
      storageKey,
      intent: query.intent?.trim() || undefined,
      ttlSeconds: query.ttl,
      clientIp: getClientIp(),
      userAgent: context.req.header('user-agent') ?? null,
      referer: context.req.header('referer') ?? context.req.header('referrer') ?? null,
    })

    if (this.shouldReturnJson(context, query.format)) {
      return { url, expiresAt }
    }

    return context.redirect(url, 302)
  }

  private shouldReturnJson(context: Context, format?: string | null): boolean {
    if (format === 'json') {
      return true
    }
    const accept = context.req.header('accept')?.toLowerCase() ?? ''
    return accept.includes('application/json')
  }
}
