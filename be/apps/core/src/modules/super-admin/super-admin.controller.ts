import { Body, Controller, Get, Patch } from '@afilmory/framework'
import { Roles } from 'core/guards/roles.decorator'
import { BypassResponseTransform } from 'core/interceptors/response-transform.decorator'

import { SystemSettingService } from '../system-setting/system-setting.service'
import { UpdateSuperAdminSettingsDto } from './super-admin.dto'

@Controller('super-admin/settings')
@Roles('superadmin')
export class SuperAdminSettingController {
  constructor(private readonly systemSettings: SystemSettingService) {}

  @Get('/')
  @BypassResponseTransform()
  async getOverview() {
    return await this.systemSettings.getOverview()
  }

  @Patch('/')
  @BypassResponseTransform()
  async update(@Body() dto: UpdateSuperAdminSettingsDto) {
    await this.systemSettings.updateSettings(dto)
    return await this.systemSettings.getOverview()
  }
}
