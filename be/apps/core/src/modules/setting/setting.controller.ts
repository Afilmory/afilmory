import { Body, Controller, Delete, Get, Param, Post } from '@afilmory/framework'
import { BizException, ErrorCode } from 'core/errors'
import { Roles } from 'core/guards/roles.decorator'
import { BypassResponseTransform } from 'core/interceptors/response-transform.decorator'

import { SettingKeys } from './setting.constant'
import type { GetSettingsBodyDto } from './setting.dto'
import { DeleteSettingDto, GetSettingDto, SetSettingDto } from './setting.dto'
import { SettingService } from './setting.service'

@Controller('settings')
@Roles('superadmin')
export class SettingController {
  constructor(private readonly settingService: SettingService) {}

  @Get('/ui-schema')
  @BypassResponseTransform()
  async getUiSchema() {
    return await this.settingService.getUiSchema()
  }

  @Get('/:key')
  @BypassResponseTransform()
  async get(@Param() { key }: GetSettingDto) {
    const value = await this.settingService.get(key, {})
    return { key, value }
  }

  @Get('/')
  @BypassResponseTransform()
  async getAll() {
    const values = await this.settingService.getMany(Array.from(SettingKeys), {})

    return { values }
  }

  @Post('/batch')
  @BypassResponseTransform()
  async getMany(@Body() { keys }: GetSettingsBodyDto) {
    if (!keys) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: 'settings keys is required',
      })
    }
    const values = await this.settingService.getMany(keys, {})
    return { values }
  }

  @Post('/')
  async set(@Body() { entries }: SetSettingDto) {
    await this.settingService.setMany(entries)
    return { updated: entries }
  }

  @Delete('/:key')
  async delete(@Param() { key }: GetSettingDto) {
    await this.settingService.delete(key)
    return { key, deleted: true }
  }

  @Delete('/')
  async deleteMany(@Body() { keys }: DeleteSettingDto) {
    await this.settingService.deleteMany(keys)
    return { keys, deleted: true }
  }
}
