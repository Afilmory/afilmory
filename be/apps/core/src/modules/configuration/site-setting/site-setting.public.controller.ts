import { Controller, Get } from '@afilmory/framework'
import { SkipTenant } from 'core/decorators/skip-tenant.decorator'
import { BypassResponseTransform } from 'core/interceptors/response-transform.decorator'

import { SiteSettingService } from './site-setting.service'

@Controller('public/site-settings')
@SkipTenant()
export class SiteSettingPublicController {
  constructor(private readonly siteSettingService: SiteSettingService) {}

  @Get('/welcome-schema')
  @BypassResponseTransform()
  async getWelcomeSchema() {
    return await this.siteSettingService.getOnboardingUiSchema()
  }
}
