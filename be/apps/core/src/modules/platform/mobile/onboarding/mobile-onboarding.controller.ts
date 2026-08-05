import { requireSessionIdentity } from '@core/context/auth-identity'
import { AllowPlaceholderTenant } from '@core/decorators/allow-placeholder.decorator'
import { SkipTenantGuard } from '@core/decorators/skip-tenant.decorator'
import { RequireAuth } from '@core/guards/roles.decorator'
import { Controller, Get } from '@tsuki-hono/common'

import { MobileOnboardingService } from './mobile-onboarding.service'

@Controller('mobile/onboarding')
@AllowPlaceholderTenant()
@RequireAuth()
@SkipTenantGuard()
export class MobileOnboardingController {
  constructor(private readonly onboarding: MobileOnboardingService) {}

  @Get('/')
  async getReadiness() {
    const identity = requireSessionIdentity()
    return await this.onboarding.getReadiness(identity.userId, identity.activeTenantId)
  }
}
