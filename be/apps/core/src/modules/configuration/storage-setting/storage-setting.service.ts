import { BizException, ErrorCode } from '@core/errors'
import { StoragePlanService } from '@core/modules/platform/billing/plan/storage-plan.service'
import { getTenantContext } from '@core/modules/platform/tenant/tenant.context'
import { injectable } from 'tsyringe'

import { getUiSchemaTranslator } from '../../ui/ui-schema/ui-schema.i18n'
import type { SettingEntryInput, SettingOption } from '../setting/setting.service'
import { SettingService } from '../setting/setting.service'
import { parseStorageProviders } from '../setting/storage-provider.utils'
import { createStorageProviderFormSchema } from './storage-provider.ui-schema'

type StorageSettingKey = 'builder.storage.providers' | 'builder.storage.activeProvider'

@injectable()
export class StorageSettingService {
  constructor(
    private readonly settingService: SettingService,
    private readonly storagePlanService: StoragePlanService,
  ) {}

  async getUiSchema(options?: SettingOption) {
    const schema = await this.settingService.getUiSchema(options)
    const { t } = getUiSchemaTranslator()
    const providerForm = createStorageProviderFormSchema(t)
    return {
      ...schema,
      schema: {
        ...schema.schema,
        sections: schema.schema.sections.filter(section => section.id.startsWith('builder-storage')),
      },
      providerForm,
    }
  }

  async get(key: StorageSettingKey, options?: SettingOption): Promise<string | null> {
    return await this.settingService.get(key, options ?? {})
  }

  async getMany(
    keys: readonly StorageSettingKey[],
    options?: SettingOption,
  ): Promise<Record<StorageSettingKey, string | null>> {
    return await this.settingService.getMany(keys, options ?? {})
  }

  async setMany(entries: readonly SettingEntryInput[]): Promise<void> {
    const normalized = [...entries]
    const providersEntry = normalized.find(entry => entry.key === 'builder.storage.providers')
    const activeEntryIndex = normalized.findIndex(entry => entry.key === 'builder.storage.activeProvider')
    const activeEntry = activeEntryIndex !== -1 ? normalized[activeEntryIndex] : null
    const activeRaw = activeEntry ? String(activeEntry.value ?? '').trim() : ''
    const activeId = activeRaw.length > 0 ? activeRaw : null

    if (activeId === 'managed') {
      const tenantId = this.resolveTenantId(normalized)
      if (!tenantId) {
        throw new BizException(ErrorCode.TENANT_NOT_FOUND)
      }
      const plan = await this.storagePlanService.getActivePlanSummaryForTenant(tenantId)
      if (!plan) {
        throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
          message: '托管存储订阅无效或已过期，无法设为活动存储。',
        })
      }
    }

    if (providersEntry) {
      const providers = parseStorageProviders(String(providersEntry.value ?? ''))

      if (!activeId && providers.length === 1) {
        const only = providers[0]
        const nextActiveEntry: SettingEntryInput = {
          key: 'builder.storage.activeProvider',
          value: only.id,
          options: activeEntry?.options,
        }
        if (activeEntryIndex !== -1) {
          normalized[activeEntryIndex] = nextActiveEntry
        }
        else {
          normalized.push(nextActiveEntry)
        }
      }
    }

    await this.settingService.setMany(normalized)
  }

  private resolveTenantId(entries: readonly SettingEntryInput[]): string | null {
    const entryWithTenant = entries.find(entry => entry.options?.tenantId)
    if (entryWithTenant?.options?.tenantId) {
      return entryWithTenant.options.tenantId
    }
    const tenant = getTenantContext()
    return tenant?.tenant.id ?? null
  }

  async delete(key: StorageSettingKey): Promise<void> {
    await this.settingService.delete(key)
  }

  async deleteMany(keys: readonly StorageSettingKey[]): Promise<void> {
    await this.settingService.deleteMany(keys)
  }
}
