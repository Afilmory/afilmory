import { Body, Controller, Get, Patch } from '@tsuki/framework'
import { Roles } from 'core/guards/roles.decorator'
import { BypassResponseTransform } from 'core/interceptors/response-transform.decorator'
import { parseStorageProviders } from 'core/modules/configuration/setting/storage-provider.utils'
import { SystemSettingService } from 'core/modules/configuration/system-setting/system-setting.service'
import type { UpdateSystemSettingsInput } from 'core/modules/configuration/system-setting/system-setting.types'

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
    const { managedStorageProviders, ...rest } = dto
    const payload: UpdateSystemSettingsInput = { ...rest }

    if (managedStorageProviders !== undefined) {
      payload.managedStorageProviders = this.normalizeManagedProviders(managedStorageProviders)
    }

    await this.systemSettings.updateSettings(payload)
    return await this.systemSettings.getOverview()
  }

  private normalizeManagedProviders(
    providers: UpdateSuperAdminSettingsDto['managedStorageProviders'],
  ): UpdateSystemSettingsInput['managedStorageProviders'] {
    try {
      return parseStorageProviders(JSON.stringify(providers ?? []))
    } catch {
      return []
    }
  }
}
