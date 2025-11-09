import { Body, Controller, Get, Post } from '@afilmory/framework'
import { Roles } from 'core/guards/roles.decorator'
import { BypassResponseTransform } from 'core/interceptors/response-transform.decorator'

import { UpdateSiteSettingsDto } from './site-setting.dto'
import { SiteSettingService } from './site-setting.service'

@Controller('site/settings')
@Roles('admin')
export class SiteSettingController {
  constructor(private readonly siteSettingService: SiteSettingService) {}

  @Get('/ui-schema')
  @BypassResponseTransform()
  async getUiSchema() {
    return await this.siteSettingService.getUiSchema()
  }

  @Post('/')
  async update(@Body() { entries }: UpdateSiteSettingsDto) {
    await this.siteSettingService.setMany(entries)
    return { updated: entries }
  }
}
