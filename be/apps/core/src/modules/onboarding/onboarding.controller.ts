import { Body, Controller, Get, Post } from '@afilmory/framework'
import { SkipTenant } from 'core/decorators/skip-tenant.decorator'
import { BizException, ErrorCode } from 'core/errors'
import { BypassResponseTransform } from 'core/interceptors/response-transform.decorator'

import { OnboardingInitDto } from './onboarding.dto'
import { OnboardingService } from './onboarding.service'

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly service: OnboardingService) {}

  @Get('/status')
  async getStatus() {
    const initialized = await this.service.isInitialized()
    return { initialized }
  }

  @Get('/site-schema')
  @BypassResponseTransform()
  @SkipTenant()
  async getSiteSchema() {
    return await this.service.getSiteSchema()
  }

  @Post('/init')
  async initialize(@Body() dto: OnboardingInitDto) {
    const initialized = await this.service.isInitialized()
    if (initialized) {
      throw new BizException(ErrorCode.COMMON_CONFLICT, { message: 'Already initialized' })
    }
    const result = await this.service.initialize(dto)
    return {
      ok: true,
      adminUserId: result.adminUserId,
      tenantId: result.tenantId,
      superAdminUserId: result.superAdminUserId,
    }
  }
}
