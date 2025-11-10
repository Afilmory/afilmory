import type { BuilderConfig } from '@afilmory/builder'
import { requireTenantContext } from 'core/modules/platform/tenant/tenant.context'
import { injectable } from 'tsyringe'

import { BUILDER_SYSTEM_CONFIG_SETTING_KEY } from '../builder-config/builder-config.constants'
import { BuilderConfigService } from '../builder-config/builder-config.service'
import { SettingService } from '../setting/setting.service'
import type {
  BuilderSettingUiSchemaResponse,
  BuilderSettingValueMap,
  BuilderSystemSettingsDto,
  UpdateBuilderSettingsPayload,
} from './builder-setting.types'
import { BUILDER_SETTING_UI_SCHEMA } from './builder-setting.ui-schema'

function serializeSupportedFormats(formats?: Set<string> | string[] | null): string {
  if (!formats) {
    return ''
  }
  const entries = Array.isArray(formats) ? formats : Array.from(formats)
  return entries.filter((entry) => entry.trim().length > 0).join(',')
}

@injectable()
export class BuilderSettingService {
  constructor(
    private readonly builderConfigService: BuilderConfigService,
    private readonly settingService: SettingService,
  ) {}

  async getUiSchema(): Promise<BuilderSettingUiSchemaResponse> {
    const tenant = requireTenantContext()
    const config = await this.builderConfigService.getConfigForTenant(tenant.tenant.id)
    const values = this.buildFieldValues(config)

    return {
      schema: BUILDER_SETTING_UI_SCHEMA,
      values,
    }
  }

  async getSettings(): Promise<{ system: BuilderSystemSettingsDto }> {
    const tenant = requireTenantContext()
    const config = await this.builderConfigService.getConfigForTenant(tenant.tenant.id)
    return {
      system: config.system,
    }
  }

  async update(payload: UpdateBuilderSettingsPayload): Promise<void> {
    const tenant = requireTenantContext()

    await this.settingService.set(BUILDER_SYSTEM_CONFIG_SETTING_KEY, JSON.stringify(payload.system ?? {}), {
      tenantId: tenant.tenant.id,
      isSensitive: false,
    })
  }

  private buildFieldValues(config: BuilderConfig): BuilderSettingValueMap {
    const { system } = config

    return {
      'system.processing.defaultConcurrency': system.processing.defaultConcurrency,
      'system.processing.enableLivePhotoDetection': system.processing.enableLivePhotoDetection,
      'system.processing.digestSuffixLength': system.processing.digestSuffixLength ?? 0,
      'system.processing.supportedFormats': serializeSupportedFormats(system.processing.supportedFormats ?? null),
      'system.observability.showProgress': system.observability.showProgress,
      'system.observability.showDetailedStats': system.observability.showDetailedStats,
      'system.observability.logging.level': system.observability.logging.level,
      'system.observability.logging.verbose': system.observability.logging.verbose,
      'system.observability.logging.outputToFile': system.observability.logging.outputToFile,
      'system.observability.performance.worker.workerCount': system.observability.performance.worker.workerCount,
      'system.observability.performance.worker.workerConcurrency':
        system.observability.performance.worker.workerConcurrency,
      'system.observability.performance.worker.useClusterMode': system.observability.performance.worker.useClusterMode,
      'system.observability.performance.worker.timeout': system.observability.performance.worker.timeout,
    }
  }
}
