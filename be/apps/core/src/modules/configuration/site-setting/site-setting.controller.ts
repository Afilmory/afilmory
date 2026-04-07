import { Body, Controller, Get, Post } from '@tsuki/framework'
import { Roles } from 'core/guards/roles.decorator'
import { BypassResponseTransform } from 'core/interceptors/response-transform.decorator'

import { UpdateSiteAuthorDto, UpdateSiteSettingsDto } from './site-setting.dto'
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

  @Get('/author')
  async getAuthorProfile() {
    return await this.siteSettingService.getAuthorProfile()
  }

  @Post('/author')
  async updateAuthorProfile(@Body() payload: UpdateSiteAuthorDto) {
    return await this.siteSettingService.updateAuthorProfile(payload)
  }
}
