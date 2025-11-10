import type { BuilderConfig, BuilderConfigInput } from '@afilmory/builder'
import { resolveBuilderConfig } from '@afilmory/builder'
import consola from 'consola'
import { injectable } from 'tsyringe'

import { SettingService } from '../setting/setting.service'
import { BUILDER_SYSTEM_CONFIG_SETTING_KEY, BUILDER_USER_CONFIG_SETTING_KEY } from './builder-config.constants'

type JsonValue = Record<string, unknown>

@injectable()
export class BuilderConfigService {
  private readonly logger = consola.withTag('BuilderConfigService')

  constructor(private readonly settingService: SettingService) {}

  async getConfigForTenant(tenantId: string): Promise<BuilderConfig> {
    const values = await this.settingService.getMany(
      [BUILDER_SYSTEM_CONFIG_SETTING_KEY, BUILDER_USER_CONFIG_SETTING_KEY],
      { tenantId },
    )

    const systemOverrides = this.parseJson<BuilderConfigInput['system']>(
      values[BUILDER_SYSTEM_CONFIG_SETTING_KEY],
      BUILDER_SYSTEM_CONFIG_SETTING_KEY,
    )
    const userOverrides = this.parseJson<BuilderConfigInput['user']>(
      values[BUILDER_USER_CONFIG_SETTING_KEY],
      BUILDER_USER_CONFIG_SETTING_KEY,
    )

    const input: BuilderConfigInput = {}
    if (systemOverrides) {
      input.system = systemOverrides
    }
    if (userOverrides) {
      input.user = userOverrides
    }

    return resolveBuilderConfig(input)
  }

  private parseJson<T extends JsonValue | BuilderConfigInput['system'] | BuilderConfigInput['user'] | null>(
    rawValue: string | null,
    key: string,
  ): T | null {
    if (!rawValue) {
      return null
    }

    try {
      return JSON.parse(rawValue) as T
    } catch (error) {
      this.logger.warn(`Failed to parse builder config setting "${key}":`, error)
      return null
    }
  }
}
