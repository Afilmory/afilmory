import { AllowPlaceholderTenant } from '@core/decorators/allow-placeholder.decorator'
import { SkipTenantGuard } from '@core/decorators/skip-tenant.decorator'
import { BizException, ErrorCode } from '@core/errors'
import { RequireAuth } from '@core/guards/roles.decorator'
import { Controller, Get, HttpContext } from '@tsuki-hono/common'

import { MobileOnboardingService } from './mobile-onboarding.service'

@Controller('mobile/onboarding')
@AllowPlaceholderTenant()
@RequireAuth()
@SkipTenantGuard()
export class MobileOnboardingController {
  constructor(private readonly onboarding: MobileOnboardingService) {}

  @Get('/')
  async getReadiness() {
    const auth = HttpContext.getValue('auth')
    if (!auth?.user || !auth.session) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED)
    }
    const activeTenantId = (auth.session as { activeTenantId?: string | null }).activeTenantId ?? null
    return await this.onboarding.getReadiness(auth.user.id, activeTenantId)
  }
}
