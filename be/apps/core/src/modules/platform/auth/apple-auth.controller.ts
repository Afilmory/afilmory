import { AllowPlaceholderTenant } from '@core/decorators/allow-placeholder.decorator'
import { SkipTenantGuard } from '@core/decorators/skip-tenant.decorator'
import { BizException, ErrorCode } from '@core/errors'
import { RequireAuth } from '@core/guards/roles.decorator'
import { Body, Controller, Get, HttpContext, Post } from '@tsuki-hono/common'
import { injectable } from 'tsyringe'

import type { AppleAuthorizationInput } from './apple-authorization.service'
import { AppleAuthorizationService } from './apple-authorization.service'

@injectable()
// Keep native Apple exchange routes outside Better Auth's `/auth/*` passthrough.
// Hono resolves routes in registration order, so placing custom endpoints below
// that namespace makes them unreachable once the passthrough is registered.
@Controller('mobile-auth/apple')
export class AppleAuthController {
  constructor(private readonly apple: AppleAuthorizationService) {}

  @AllowPlaceholderTenant()
  @SkipTenantGuard()
  @Get('/configuration')
  async configuration() {
    return await this.apple.configuration()
  }

  @AllowPlaceholderTenant()
  @SkipTenantGuard()
  @RequireAuth()
  @Post('/exchange')
  async exchange(@Body() body: Partial<AppleAuthorizationInput>) {
    const authContext = HttpContext.getValue('auth')
    if (!authContext?.user) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED)
    }
    const authorizationCode = body.authorizationCode?.trim()
    const identityToken = body.identityToken?.trim()
    const nonce = body.nonce?.trim()
    if (!authorizationCode || !identityToken || !nonce) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: 'Incomplete Apple authorization payload.' })
    }
    await this.apple.exchange(authContext.user.id, { authorizationCode, identityToken, nonce })
    return { linked: true }
  }
}
