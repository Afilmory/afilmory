import { requireActiveTenantIdentity } from '@core/context/auth-identity'
import { isSecureRequest } from '@core/context/http-context.helper'
import { AllowPlaceholderTenant } from '@core/decorators/allow-placeholder.decorator'
import { SkipTenantGuard } from '@core/decorators/skip-tenant.decorator'
import { BizException, ErrorCode } from '@core/errors'
import { RequireAuth } from '@core/guards/roles.decorator'
import { STORAGE_SETTING_KEYS } from '@core/modules/configuration/setting/storage-provider.constants'
import { Body, ContextParam, Controller, createZodSchemaDto, Get, Post } from '@tsuki-hono/common'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'

import { MobileStorageHandoffService } from './mobile-storage-handoff.service'

const CAPABILITY_COOKIE = 'afilmory-storage-handoff'
const CAPABILITY_PATH = '/api/mobile/storage-handoff-capability'

class ExchangeDto extends createZodSchemaDto(z.object({ code: z.string().trim().min(32).max(200) })) {}
class SaveDto extends createZodSchemaDto(
  z.object({
    entries: z
      .array(
        z.object({
          key: z.enum(STORAGE_SETTING_KEYS),
          value: z.string(),
        }),
      )
      .min(1)
      .max(STORAGE_SETTING_KEYS.length),
  }),
) {}
class TestConnectionDto extends createZodSchemaDto(
  z.object({
    provider: z.object({
      config: z.record(z.string(), z.string()),
      id: z.string().trim().min(1).max(100),
      name: z.string().trim().min(1).max(100),
      type: z.enum(['s3', 'oss', 'cos', 'github', 'b2']),
    }),
  }),
) {}

@Controller('mobile/storage-handoffs')
@AllowPlaceholderTenant()
@RequireAuth()
@SkipTenantGuard()
export class MobileStorageHandoffController {
  constructor(private readonly handoffs: MobileStorageHandoffService) {}

  @Post('/')
  async create() {
    return await this.handoffs.create(requireActiveTenantIdentity())
  }
}

@Controller('mobile/storage-handoffs/exchange')
@AllowPlaceholderTenant()
@SkipTenantGuard()
export class MobileStorageHandoffExchangeController {
  constructor(private readonly handoffs: MobileStorageHandoffService) {}

  @Post('/')
  async exchange(@ContextParam() context: Context, @Body() body: ExchangeDto) {
    const result = await this.handoffs.exchange(body.code)
    setCookie(context, CAPABILITY_COOKIE, result.capabilityToken, {
      httpOnly: true,
      maxAge: 15 * 60,
      path: CAPABILITY_PATH,
      sameSite: 'Lax',
      secure: isSecureRequest(context),
    })
    return {
      capabilityExpiresAt: result.capabilityExpiresAt,
      returnUrl: result.returnUrl,
      workspace: result.workspace,
    }
  }
}

@Controller('mobile/storage-handoff-capability')
@AllowPlaceholderTenant()
@SkipTenantGuard()
export class MobileStorageHandoffCapabilityController {
  constructor(private readonly handoffs: MobileStorageHandoffService) {}

  @Get('/')
  async getContext(@ContextParam() context: Context) {
    return await this.handoffs.getContext(this.requireCapabilityCookie(context))
  }

  @Post('/test')
  async test(@ContextParam() context: Context, @Body() body: TestConnectionDto) {
    return await this.handoffs.testConnection(this.requireCapabilityCookie(context), body.provider)
  }

  @Post('/save')
  async save(@ContextParam() context: Context, @Body() body: SaveDto) {
    const result = await this.handoffs.save(this.requireCapabilityCookie(context), body.entries)
    deleteCookie(context, CAPABILITY_COOKIE, { path: CAPABILITY_PATH })
    return result
  }

  private requireCapabilityCookie(context: Context): string {
    const token = getCookie(context, CAPABILITY_COOKIE)
    if (!token) {
      throw new BizException(ErrorCode.AUTH_FORBIDDEN, { message: 'Storage setup capability is required.' })
    }
    return token
  }
}
