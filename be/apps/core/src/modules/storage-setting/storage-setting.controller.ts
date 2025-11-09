import { Body, Controller, Delete, Get, Param, Post } from '@afilmory/framework'
import { BizException, ErrorCode } from 'core/errors'
import { Roles } from 'core/guards/roles.decorator'
import { BypassResponseTransform } from 'core/interceptors/response-transform.decorator'

import type { GetSettingsBodyDto } from '../setting/setting.dto'
import { DeleteSettingDto, GetSettingDto, SetSettingDto } from '../setting/setting.dto'
import type { SettingEntryInput } from '../setting/setting.service'
import { StorageSettingService } from './storage-setting.service'

const STORAGE_SETTING_KEYS = ['builder.storage.providers', 'builder.storage.activeProvider'] as const
type StorageSettingKey = (typeof STORAGE_SETTING_KEYS)[number]

@Controller('storage/settings')
@Roles('superadmin')
export class StorageSettingController {
  constructor(private readonly storageSettingService: StorageSettingService) {}

  @Get('/ui-schema')
  @BypassResponseTransform()
  async getUiSchema() {
    return await this.storageSettingService.getUiSchema()
  }

  @Get('/:key')
  @BypassResponseTransform()
  async get(@Param() { key }: GetSettingDto) {
    this.ensureKeyAllowed(key)
    const value = await this.storageSettingService.get(key as StorageSettingKey)
    return { key, value }
  }

  @Get('/')
  @BypassResponseTransform()
  async getAll() {
    const values = await this.storageSettingService.getMany(STORAGE_SETTING_KEYS)

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
    keys.forEach(this.ensureKeyAllowed)
    const typedKeys = keys as StorageSettingKey[]
    const values = await this.storageSettingService.getMany(typedKeys)
    return { values }
  }

  @Post('/')
  async set(@Body() { entries }: SetSettingDto) {
    entries.forEach((entry) => this.ensureKeyAllowed(entry.key))
    await this.storageSettingService.setMany(entries as readonly SettingEntryInput[])
    return { updated: entries }
  }

  @Delete('/:key')
  async delete(@Param() { key }: GetSettingDto) {
    this.ensureKeyAllowed(key)
    await this.storageSettingService.delete(key as StorageSettingKey)
    return { key, deleted: true }
  }

  @Delete('/')
  async deleteMany(@Body() { keys }: DeleteSettingDto) {
    keys.forEach(this.ensureKeyAllowed)
    const typedKeys = keys as StorageSettingKey[]
    await this.storageSettingService.deleteMany(typedKeys)
    return { keys, deleted: true }
  }

  private ensureKeyAllowed(key: string) {
    if (!key.startsWith('builder.storage.')) {
      throw new BizException(ErrorCode.AUTH_FORBIDDEN, { message: 'Only storage settings are available' })
    }
  }
}
