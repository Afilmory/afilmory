import type { HttpContextAuth } from '@core/context/http-context.values'
import { AllowPlaceholderTenant } from '@core/decorators/allow-placeholder.decorator'
import { SkipTenantGuard } from '@core/decorators/skip-tenant.decorator'
import { BizException, ErrorCode } from '@core/errors'
import { RequireAuth } from '@core/guards/roles.decorator'
import { BypassResponseTransform } from '@core/interceptors/response-transform.decorator'
import { Controller, Delete, Get, HttpContext, Param } from '@tsuki-hono/common'

import { BlockedUserParamDto } from './user-safety.dto'
import { UserSafetyService } from './user-safety.service'

@Controller('user-blocks')
@SkipTenantGuard()
@AllowPlaceholderTenant()
@RequireAuth()
@BypassResponseTransform()
export class UserSafetyController {
  constructor(private readonly safety: UserSafetyService) {}

  @Get('/')
  async list() {
    return { users: await this.safety.listBlockedUsers(this.requireUserId()) }
  }

  @Delete('/:userId')
  async unblock(@Param() { userId }: BlockedUserParamDto) {
    await this.safety.unblockUser(this.requireUserId(), userId)
    return { blocked: false, userId }
  }

  private requireUserId(): string {
    const auth = HttpContext.getValue('auth') as HttpContextAuth | undefined
    if (!auth?.user || !auth.session) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED)
    }
    return auth.user.id
  }
}
