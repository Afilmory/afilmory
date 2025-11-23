import { authUsers } from '@afilmory/db'
import { DbAccessor } from 'core/database/database.provider'
import { BizException, ErrorCode } from 'core/errors'
import { normalizeNullableString } from 'core/helpers/normalize.helper'
import type { SocialProvidersConfig } from 'core/modules/platform/auth/auth.config'
import {
  BILLING_PLAN_OVERRIDES_SETTING_KEY,
  BILLING_PLAN_PRICING_SETTING_KEY,
  BILLING_PLAN_PRODUCTS_SETTING_KEY,
} from 'core/modules/platform/billing/billing-plan.constants'
import type {
  BillingPlanId,
  BillingPlanOverrides,
  BillingPlanPaymentInfo,
  BillingPlanPricing,
  BillingPlanPricingConfigs,
  BillingPlanProductConfigs,
  BillingPlanQuota,
} from 'core/modules/platform/billing/billing-plan.types'
import type {
  StoragePlanCatalog,
  StoragePlanPricingConfigs,
  StoragePlanProductConfigs,
} from 'core/modules/platform/billing/storage-plan.types'
import { sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import type { ZodType } from 'zod'
import { z } from 'zod'

import { getUiSchemaTranslator } from '../../ui/ui-schema/ui-schema.i18n'
import type { BuilderStorageProvider } from '../setting/storage-provider.utils'
import {
  maskStorageProviderSecrets,
  mergeStorageProviderSecrets,
  parseStorageProviders,
  serializeStorageProviders,
} from '../setting/storage-provider.utils'
import type { SystemSettingDbField } from './system-setting.constants'
import {
  BILLING_PLAN_FIELD_DESCRIPTORS,
  SYSTEM_SETTING_DEFINITIONS,
  SYSTEM_SETTING_KEYS,
} from './system-setting.constants'
import { SystemSettingStore } from './system-setting.store.service'
import type {
  SystemSettingOverview,
  SystemSettings,
  SystemSettingStats,
  SystemSettingValueMap,
  UpdateSystemSettingsInput,
} from './system-setting.types'
import { createSystemSettingUiSchema } from './system-setting.ui-schema'

@injectable()
export class SystemSettingService {
  constructor(
    private readonly systemSettingStore: SystemSettingStore,
    private readonly dbAccessor: DbAccessor,
  ) {}

  async getSettings(): Promise<SystemSettings> {
    const rawValues = await this.systemSettingStore.getMany(SYSTEM_SETTING_KEYS)

    const allowRegistration = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.allowRegistration.key],
      SYSTEM_SETTING_DEFINITIONS.allowRegistration.schema,
      SYSTEM_SETTING_DEFINITIONS.allowRegistration.defaultValue,
    )

    const maxRegistrableUsers = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.maxRegistrableUsers.key],
      SYSTEM_SETTING_DEFINITIONS.maxRegistrableUsers.schema,
      SYSTEM_SETTING_DEFINITIONS.maxRegistrableUsers.defaultValue,
    )

    const maxPhotoUploadSizeMb = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.maxPhotoUploadSizeMb.key],
      SYSTEM_SETTING_DEFINITIONS.maxPhotoUploadSizeMb.schema,
      SYSTEM_SETTING_DEFINITIONS.maxPhotoUploadSizeMb.defaultValue,
    )

    const maxDataSyncObjectSizeMb = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.maxDataSyncObjectSizeMb.key],
      SYSTEM_SETTING_DEFINITIONS.maxDataSyncObjectSizeMb.schema,
      SYSTEM_SETTING_DEFINITIONS.maxDataSyncObjectSizeMb.defaultValue,
    )

    const maxPhotoLibraryItems = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.maxPhotoLibraryItems.key],
      SYSTEM_SETTING_DEFINITIONS.maxPhotoLibraryItems.schema,
      SYSTEM_SETTING_DEFINITIONS.maxPhotoLibraryItems.defaultValue,
    )

    const localProviderEnabled = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.localProviderEnabled.key],
      SYSTEM_SETTING_DEFINITIONS.localProviderEnabled.schema,
      SYSTEM_SETTING_DEFINITIONS.localProviderEnabled.defaultValue,
    )

    const baseDomainRaw = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.baseDomain.key],
      SYSTEM_SETTING_DEFINITIONS.baseDomain.schema,
      SYSTEM_SETTING_DEFINITIONS.baseDomain.defaultValue,
    )

    const baseDomain = baseDomainRaw.trim().toLowerCase()

    const oauthGatewayUrl = this.normalizeGatewayUrl(
      this.parseSetting(
        rawValues[SYSTEM_SETTING_DEFINITIONS.oauthGatewayUrl.key],
        SYSTEM_SETTING_DEFINITIONS.oauthGatewayUrl.schema,
        SYSTEM_SETTING_DEFINITIONS.oauthGatewayUrl.defaultValue,
      ),
    )

    const oauthGoogleClientId = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.oauthGoogleClientId.key],
      SYSTEM_SETTING_DEFINITIONS.oauthGoogleClientId.schema,
      SYSTEM_SETTING_DEFINITIONS.oauthGoogleClientId.defaultValue,
    )
    const oauthGoogleClientSecret = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.oauthGoogleClientSecret.key],
      SYSTEM_SETTING_DEFINITIONS.oauthGoogleClientSecret.schema,
      SYSTEM_SETTING_DEFINITIONS.oauthGoogleClientSecret.defaultValue,
    )
    const oauthGithubClientId = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.oauthGithubClientId.key],
      SYSTEM_SETTING_DEFINITIONS.oauthGithubClientId.schema,
      SYSTEM_SETTING_DEFINITIONS.oauthGithubClientId.defaultValue,
    )
    const oauthGithubClientSecret = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.oauthGithubClientSecret.key],
      SYSTEM_SETTING_DEFINITIONS.oauthGithubClientSecret.schema,
      SYSTEM_SETTING_DEFINITIONS.oauthGithubClientSecret.defaultValue,
    )
    const billingPlanOverrides = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.billingPlanOverrides.key],
      BILLING_PLAN_OVERRIDES_SCHEMA,
      {},
    ) as BillingPlanOverrides
    const billingPlanProducts = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.billingPlanProducts.key],
      BILLING_PLAN_PRODUCTS_SCHEMA,
      {},
    ) as BillingPlanProductConfigs
    const billingPlanPricing = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.billingPlanPricing.key],
      BILLING_PLAN_PRICING_SCHEMA,
      {},
    ) as BillingPlanPricingConfigs
    const storagePlanCatalog = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.storagePlanCatalog.key],
      STORAGE_PLAN_CATALOG_SCHEMA,
      SYSTEM_SETTING_DEFINITIONS.storagePlanCatalog.defaultValue as StoragePlanCatalog,
    ) as StoragePlanCatalog
    const storagePlanProducts = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.storagePlanProducts.key],
      STORAGE_PLAN_PRODUCTS_SCHEMA,
      {},
    ) as StoragePlanProductConfigs
    const storagePlanPricing = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.storagePlanPricing.key],
      STORAGE_PLAN_PRICING_SCHEMA,
      {},
    ) as StoragePlanPricingConfigs
    const managedStorageProvider = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.managedStorageProvider.key],
      SYSTEM_SETTING_DEFINITIONS.managedStorageProvider.schema,
      SYSTEM_SETTING_DEFINITIONS.managedStorageProvider.defaultValue,
    )
    const managedStorageProviders = this.parseManagedStorageProviders(
      rawValues[SYSTEM_SETTING_DEFINITIONS.managedStorageProviders.key],
    )
    return {
      allowRegistration,
      maxRegistrableUsers,
      maxPhotoUploadSizeMb,
      maxDataSyncObjectSizeMb,
      maxPhotoLibraryItems,
      localProviderEnabled,
      baseDomain,
      oauthGatewayUrl,
      oauthGoogleClientId,
      oauthGoogleClientSecret,
      oauthGithubClientId,
      oauthGithubClientSecret,
      billingPlanOverrides,
      billingPlanProducts,
      billingPlanPricing,
      storagePlanCatalog,
      storagePlanProducts,
      storagePlanPricing,
      managedStorageProvider,
      managedStorageProviders,
    }
  }

  async getBillingPlanOverrides(): Promise<BillingPlanOverrides> {
    const settings = await this.getSettings()
    return settings.billingPlanOverrides ?? {}
  }

  async getBillingPlanProducts(): Promise<BillingPlanProductConfigs> {
    const settings = await this.getSettings()
    return settings.billingPlanProducts ?? {}
  }

  async getBillingPlanPricing(): Promise<BillingPlanPricingConfigs> {
    const settings = await this.getSettings()
    return settings.billingPlanPricing ?? {}
  }

  async getStoragePlanCatalog(): Promise<StoragePlanCatalog> {
    const settings = await this.getSettings()
    return settings.storagePlanCatalog ?? {}
  }

  async getStoragePlanProducts(): Promise<StoragePlanProductConfigs> {
    const settings = await this.getSettings()
    return settings.storagePlanProducts ?? {}
  }

  async getStoragePlanPricing(): Promise<StoragePlanPricingConfigs> {
    const settings = await this.getSettings()
    return settings.storagePlanPricing ?? {}
  }

  async getManagedStorageProviderKey(): Promise<string | null> {
    const settings = await this.getSettings()
    return settings.managedStorageProvider ?? null
  }

  async getManagedStorageProvider(): Promise<BuilderStorageProvider | null> {
    const settings = await this.getSettings()
    const providerKey = settings.managedStorageProvider?.trim()
    if (!providerKey) {
      return null
    }
    return (settings.managedStorageProviders ?? []).find((provider) => provider.id === providerKey) ?? null
  }

  async getOverview(): Promise<SystemSettingOverview> {
    const settings = await this.getSettings()
    const totalUsers = await this.getTotalUserCount()
    const stats = this.buildStats(settings, totalUsers)
    const { t } = getUiSchemaTranslator()
    return {
      schema: createSystemSettingUiSchema(t),
      values: this.buildValueMap(settings),
      stats,
    }
  }

  async updateSettings(patch: UpdateSystemSettingsInput): Promise<SystemSettings> {
    if (!patch || Object.values(patch).every((value) => value === undefined)) {
      return await this.getSettings()
    }

    const current = await this.getSettings()
    const planFieldUpdates = this.extractPlanFieldUpdates(patch)
    if (planFieldUpdates.hasUpdates) {
      await this.applyPlanFieldUpdates(current, planFieldUpdates)
    }

    const updates: Array<{ field: SystemSettingDbField; value: unknown }> = []

    const enqueueUpdate = <K extends SystemSettingDbField>(
      field: K,
      value: unknown,
      currentValue?: SystemSettings[K],
    ) => {
      updates.push({ field, value })
      if (currentValue !== undefined) {
        ;(current as unknown as Record<string, unknown>)[field] = currentValue
      } else {
        ;(current as unknown as Record<string, unknown>)[field] = value
      }
    }

    if (patch.allowRegistration !== undefined && patch.allowRegistration !== current.allowRegistration) {
      enqueueUpdate('allowRegistration', patch.allowRegistration)
    }

    if (patch.localProviderEnabled !== undefined && patch.localProviderEnabled !== current.localProviderEnabled) {
      enqueueUpdate('localProviderEnabled', patch.localProviderEnabled)
    }

    if (patch.maxRegistrableUsers !== undefined) {
      const normalized = patch.maxRegistrableUsers === null ? null : Math.max(0, Math.trunc(patch.maxRegistrableUsers))
      if (normalized !== current.maxRegistrableUsers) {
        if (normalized !== null) {
          const totalUsers = await this.getTotalUserCount()
          if (normalized < totalUsers) {
            throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
              message: '最大可注册用户数不能小于当前用户总数',
            })
          }
        }

        enqueueUpdate('maxRegistrableUsers', normalized)
      }
    }

    if (patch.maxPhotoUploadSizeMb !== undefined && patch.maxPhotoUploadSizeMb !== current.maxPhotoUploadSizeMb) {
      const normalized =
        patch.maxPhotoUploadSizeMb === null ? null : Math.max(1, Math.trunc(patch.maxPhotoUploadSizeMb))
      enqueueUpdate('maxPhotoUploadSizeMb', normalized)
    }

    if (
      patch.maxDataSyncObjectSizeMb !== undefined &&
      patch.maxDataSyncObjectSizeMb !== current.maxDataSyncObjectSizeMb
    ) {
      const normalized =
        patch.maxDataSyncObjectSizeMb === null ? null : Math.max(1, Math.trunc(patch.maxDataSyncObjectSizeMb))
      enqueueUpdate('maxDataSyncObjectSizeMb', normalized)
    }

    if (patch.maxPhotoLibraryItems !== undefined && patch.maxPhotoLibraryItems !== current.maxPhotoLibraryItems) {
      const normalized =
        patch.maxPhotoLibraryItems === null ? null : Math.max(0, Math.trunc(patch.maxPhotoLibraryItems))
      enqueueUpdate('maxPhotoLibraryItems', normalized)
    }

    if (patch.baseDomain !== undefined) {
      const sanitized = patch.baseDomain === null ? null : String(patch.baseDomain).trim().toLowerCase()
      if (!sanitized) {
        enqueueUpdate('baseDomain', SYSTEM_SETTING_DEFINITIONS.baseDomain.defaultValue)
      } else if (sanitized !== current.baseDomain) {
        enqueueUpdate('baseDomain', sanitized)
      }
    }
    if (patch.oauthGatewayUrl !== undefined) {
      const sanitized = this.normalizeGatewayUrl(patch.oauthGatewayUrl)
      if (sanitized !== current.oauthGatewayUrl) {
        enqueueUpdate('oauthGatewayUrl', sanitized)
      }
    }

    if (patch.oauthGoogleClientId !== undefined) {
      const sanitized = normalizeNullableString(patch.oauthGoogleClientId)
      if (sanitized !== current.oauthGoogleClientId) {
        enqueueUpdate('oauthGoogleClientId', sanitized)
      }
    }

    if (patch.oauthGoogleClientSecret !== undefined) {
      const sanitized = normalizeNullableString(patch.oauthGoogleClientSecret)
      if (sanitized !== current.oauthGoogleClientSecret) {
        enqueueUpdate('oauthGoogleClientSecret', sanitized)
      }
    }

    if (patch.oauthGithubClientId !== undefined) {
      const sanitized = normalizeNullableString(patch.oauthGithubClientId)
      if (sanitized !== current.oauthGithubClientId) {
        enqueueUpdate('oauthGithubClientId', sanitized)
      }
    }

    if (patch.oauthGithubClientSecret !== undefined) {
      const sanitized = normalizeNullableString(patch.oauthGithubClientSecret)
      if (sanitized !== current.oauthGithubClientSecret) {
        enqueueUpdate('oauthGithubClientSecret', sanitized)
      }
    }

    if (patch.storagePlanCatalog !== undefined) {
      const parsed = STORAGE_PLAN_CATALOG_SCHEMA.parse(patch.storagePlanCatalog)
      enqueueUpdate('storagePlanCatalog', parsed)
    }

    if (patch.storagePlanProducts !== undefined) {
      const parsed = STORAGE_PLAN_PRODUCTS_SCHEMA.parse(patch.storagePlanProducts)
      enqueueUpdate('storagePlanProducts', parsed)
    }

    if (patch.storagePlanPricing !== undefined) {
      const parsed = STORAGE_PLAN_PRICING_SCHEMA.parse(patch.storagePlanPricing)
      enqueueUpdate('storagePlanPricing', parsed)
    }

    if (patch.managedStorageProvider !== undefined && patch.managedStorageProvider !== current.managedStorageProvider) {
      enqueueUpdate('managedStorageProvider', normalizeNullableString(patch.managedStorageProvider))
    }

    if (patch.managedStorageProviders !== undefined) {
      const normalizedProviders = this.normalizeManagedStorageProvidersPatch(
        patch.managedStorageProviders,
        current.managedStorageProviders ?? [],
      )
      const nextSerialized = serializeStorageProviders(normalizedProviders)
      const currentSerialized = serializeStorageProviders(current.managedStorageProviders ?? [])
      if (nextSerialized !== currentSerialized) {
        enqueueUpdate('managedStorageProviders', nextSerialized, normalizedProviders)
      }
    }

    if (updates.length === 0) {
      return current
    }

    await this.systemSettingStore.setMany(
      updates.map((entry) => {
        const definition = SYSTEM_SETTING_DEFINITIONS[entry.field]
        return {
          key: definition.key,
          value: (entry.value ?? null) as unknown,
          options: { isSensitive: definition.isSensitive ?? false },
        }
      }),
    )

    return current
  }

  private buildValueMap(settings: SystemSettings): SystemSettingValueMap {
    const map = {} as SystemSettingValueMap

    ;(Object.keys(SYSTEM_SETTING_DEFINITIONS) as SystemSettingDbField[]).forEach((field) => {
      if (field === 'managedStorageProviders') {
        ;(map as Record<string, unknown>)[field] = maskStorageProviderSecrets(settings.managedStorageProviders ?? [])
        return
      }
      ;(map as Record<string, unknown>)[field] = settings[field]
    })

    const overrides = settings.billingPlanOverrides ?? {}
    BILLING_PLAN_FIELD_DESCRIPTORS.quotas.forEach((descriptor) => {
      const planOverrides = overrides[descriptor.planId]
      if (planOverrides && descriptor.key in (planOverrides as object)) {
        ;(map as Record<string, unknown>)[descriptor.field] =
          (planOverrides as BillingPlanQuota)[descriptor.key as keyof BillingPlanQuota] ?? null
      } else {
        ;(map as Record<string, unknown>)[descriptor.field] = descriptor.defaultValue ?? null
      }
    })

    const pricing = settings.billingPlanPricing ?? {}
    BILLING_PLAN_FIELD_DESCRIPTORS.pricing.forEach((descriptor) => {
      const entry = pricing[descriptor.planId]
      if (descriptor.key === 'currency') {
        ;(map as Record<string, unknown>)[descriptor.field] = entry?.currency ?? null
      } else if (descriptor.key === 'monthlyPrice') {
        ;(map as Record<string, unknown>)[descriptor.field] = entry?.monthlyPrice ?? null
      }
    })

    const products = settings.billingPlanProducts ?? {}
    BILLING_PLAN_FIELD_DESCRIPTORS.payment.forEach((descriptor) => {
      const entry = products[descriptor.planId]
      ;(map as Record<string, unknown>)[descriptor.field] = entry?.creemProductId ?? null
    })

    return map
  }

  private parseManagedStorageProviders(raw: unknown): BuilderStorageProvider[] {
    if (!raw) {
      return []
    }

    if (Array.isArray(raw) || typeof raw === 'object') {
      try {
        return parseStorageProviders(JSON.stringify(raw))
      } catch {
        return []
      }
    }

    if (typeof raw === 'string') {
      const normalized = raw.trim()
      if (!normalized) {
        return []
      }
      return parseStorageProviders(normalized)
    }

    return []
  }

  private normalizeManagedStorageProvidersPatch(
    patch: unknown,
    current: BuilderStorageProvider[],
  ): BuilderStorageProvider[] {
    let normalized: string
    if (typeof patch === 'string') {
      normalized = patch
    } else if (patch == null) {
      normalized = '[]'
    } else {
      try {
        normalized = JSON.stringify(patch)
      } catch {
        normalized = '[]'
      }
    }

    const incoming = parseStorageProviders(normalized)
    return mergeStorageProviderSecrets(incoming, current ?? [])
  }

  private extractPlanFieldUpdates(patch: UpdateSystemSettingsInput): PlanFieldUpdateSummary {
    const summary: PlanFieldUpdateSummary = {
      hasUpdates: false,
      quotas: {},
      pricing: {},
      products: {},
    }

    for (const descriptor of BILLING_PLAN_FIELD_DESCRIPTORS.quotas) {
      if (!(descriptor.field in patch)) {
        continue
      }
      summary.hasUpdates = true
      const raw = patch[descriptor.field]
      delete (patch as Record<string, unknown>)[descriptor.field]
      const numericValue = raw === null || raw === undefined ? null : typeof raw === 'number' ? raw : Number(raw)

      const planPatch = summary.quotas[descriptor.planId] ?? {}
      planPatch[descriptor.key as keyof BillingPlanQuota] =
        numericValue === null || Number.isNaN(numericValue) ? null : numericValue
      summary.quotas[descriptor.planId] = planPatch
    }

    for (const descriptor of BILLING_PLAN_FIELD_DESCRIPTORS.pricing) {
      if (!(descriptor.field in patch)) {
        continue
      }
      summary.hasUpdates = true
      const raw = patch[descriptor.field]
      delete (patch as Record<string, unknown>)[descriptor.field]
      const planPatch = summary.pricing[descriptor.planId] ?? {}

      if (descriptor.key === 'currency') {
        const normalized =
          raw === null || raw === undefined
            ? null
            : typeof raw === 'string'
              ? normalizeNullableString(raw)
              : normalizeNullableString(String(raw))
        planPatch.currency = normalized
      } else if (descriptor.key === 'monthlyPrice') {
        const numericValue = raw === null || raw === undefined ? null : typeof raw === 'number' ? raw : Number(raw)
        planPatch.monthlyPrice = numericValue === null || Number.isNaN(numericValue) ? null : numericValue
      }

      summary.pricing[descriptor.planId] = planPatch
    }

    for (const descriptor of BILLING_PLAN_FIELD_DESCRIPTORS.payment) {
      if (!(descriptor.field in patch)) {
        continue
      }
      summary.hasUpdates = true
      const raw = patch[descriptor.field]
      delete (patch as Record<string, unknown>)[descriptor.field]
      const normalized =
        raw === null || raw === undefined
          ? null
          : typeof raw === 'string'
            ? normalizeNullableString(raw)
            : normalizeNullableString(String(raw))
      summary.products[descriptor.planId] = { creemProductId: normalized }
    }

    return summary
  }

  private async applyPlanFieldUpdates(current: SystemSettings, updates: PlanFieldUpdateSummary): Promise<void> {
    if (!updates.hasUpdates) {
      return
    }

    if (Object.keys(updates.quotas).length > 0) {
      const nextOverrides: BillingPlanOverrides = structuredClone(current.billingPlanOverrides ?? {})
      for (const [planId, quotaPatch] of Object.entries(updates.quotas) as Array<
        [BillingPlanId, Partial<BillingPlanQuota>]
      >) {
        const existing = { ...nextOverrides[planId] }
        for (const [quotaKey, value] of Object.entries(quotaPatch) as Array<[keyof BillingPlanQuota, number | null]>) {
          if (value === null || value === undefined || Number.isNaN(value)) {
            delete existing[quotaKey]
          } else {
            existing[quotaKey] = value
          }
        }
        if (Object.keys(existing).length === 0) {
          delete nextOverrides[planId]
        } else {
          nextOverrides[planId] = existing
        }
      }
      await this.systemSettingStore.set(BILLING_PLAN_OVERRIDES_SETTING_KEY, nextOverrides)
      current.billingPlanOverrides = nextOverrides
    }

    if (Object.keys(updates.pricing).length > 0) {
      const nextPricing: BillingPlanPricingConfigs = structuredClone(current.billingPlanPricing ?? {})
      for (const [planId, pricingPatch] of Object.entries(updates.pricing) as Array<
        [BillingPlanId, Partial<BillingPlanPricing>]
      >) {
        const entry: BillingPlanPricing = {
          monthlyPrice: pricingPatch.monthlyPrice ?? null,
          currency: pricingPatch.currency ?? null,
        }
        if (entry.monthlyPrice === null && !entry.currency) {
          delete nextPricing[planId]
        } else {
          nextPricing[planId] = entry
        }
      }
      await this.systemSettingStore.set(BILLING_PLAN_PRICING_SETTING_KEY, nextPricing)
      current.billingPlanPricing = nextPricing
    }

    if (Object.keys(updates.products).length > 0) {
      const nextProducts: BillingPlanProductConfigs = structuredClone(current.billingPlanProducts ?? {})
      for (const [planId, product] of Object.entries(updates.products) as Array<
        [BillingPlanId, BillingPlanPaymentInfo]
      >) {
        const normalized = normalizeNullableString(product.creemProductId)
        if (!normalized) {
          delete nextProducts[planId]
        } else {
          nextProducts[planId] = { creemProductId: normalized }
        }
      }
      await this.systemSettingStore.set(BILLING_PLAN_PRODUCTS_SETTING_KEY, nextProducts)
      current.billingPlanProducts = nextProducts
    }
  }

  async ensureRegistrationAllowed(): Promise<void> {
    const settings = await this.getSettings()

    if (!settings.allowRegistration) {
      throw new BizException(ErrorCode.AUTH_FORBIDDEN, {
        message: '当前已关闭用户注册，请联系管理员获取访问权限。',
      })
    }

    if (settings.maxRegistrableUsers === null) {
      return
    }

    const totalUsers = await this.getTotalUserCount()
    if (totalUsers >= settings.maxRegistrableUsers) {
      throw new BizException(ErrorCode.AUTH_FORBIDDEN, {
        message: '用户注册数量已达到上限，请联系管理员。',
      })
    }
  }

  async getAuthModuleConfig(): Promise<{
    baseDomain: string
    socialProviders: SocialProvidersConfig
    oauthGatewayUrl: string | null
  }> {
    const settings = await this.getSettings()
    return {
      baseDomain: settings.baseDomain,
      socialProviders: this.buildSocialProviders(settings),
      oauthGatewayUrl: settings.oauthGatewayUrl,
    }
  }

  private parseSetting<T>(raw: unknown, schema: ZodType<T>, defaultValue: T): T {
    if (raw === null || raw === undefined) {
      return defaultValue
    }

    const parsed = schema.safeParse(raw)
    return parsed.success ? parsed.data : defaultValue
  }

  private buildSocialProviders(settings: SystemSettings): SocialProvidersConfig {
    const providers: SocialProvidersConfig = {}

    if (settings.oauthGoogleClientId && settings.oauthGoogleClientSecret) {
      providers.google = {
        clientId: settings.oauthGoogleClientId,
        clientSecret: settings.oauthGoogleClientSecret,
      }
    }

    if (settings.oauthGithubClientId && settings.oauthGithubClientSecret) {
      providers.github = {
        clientId: settings.oauthGithubClientId,
        clientSecret: settings.oauthGithubClientSecret,
      }
    }

    return providers
  }

  private normalizeGatewayUrl(value: string | null | undefined): string | null {
    if (value === undefined || value === null) {
      return null
    }

    const trimmed = value.trim()
    if (trimmed.length === 0) {
      return null
    }

    try {
      const url = new URL(trimmed)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return null
      }

      const normalizedPath = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '')
      return `${url.origin}${normalizedPath}`
    } catch {
      return null
    }
  }

  private buildStats(settings: SystemSettings, totalUsers: number): SystemSettingStats {
    const remaining =
      settings.maxRegistrableUsers === null ? null : Math.max(settings.maxRegistrableUsers - totalUsers, 0)

    return {
      totalUsers,
      registrationsRemaining: remaining,
    }
  }

  private async getTotalUserCount(): Promise<number> {
    const [row] = await this.dbAccessor
      .get()
      .select({ total: sql<number>`count(*)` })
      .from(authUsers)
    return typeof row?.total === 'number' ? row.total : Number(row?.total ?? 0)
  }
}

const PLAN_OVERRIDE_ENTRY_SCHEMA = z.object({
  monthlyAssetProcessLimit: z.number().int().min(0).nullable().optional(),
  libraryItemLimit: z.number().int().min(0).nullable().optional(),
  maxUploadSizeMb: z.number().int().min(1).nullable().optional(),
  maxSyncObjectSizeMb: z.number().int().min(1).nullable().optional(),
})

const BILLING_PLAN_OVERRIDES_SCHEMA = z.record(z.string(), PLAN_OVERRIDE_ENTRY_SCHEMA).default({})

const PLAN_PRODUCT_ENTRY_SCHEMA = z.object({
  creemProductId: z.string().trim().min(1).optional(),
})

const BILLING_PLAN_PRODUCTS_SCHEMA = z.record(z.string(), PLAN_PRODUCT_ENTRY_SCHEMA).default({})

const PLAN_PRICING_ENTRY_SCHEMA = z.object({
  monthlyPrice: z.number().min(0).nullable().optional(),
  currency: z.string().trim().min(1).nullable().optional(),
})

const BILLING_PLAN_PRICING_SCHEMA = z.record(z.string(), PLAN_PRICING_ENTRY_SCHEMA).default({})

const STORAGE_PLAN_CATALOG_ENTRY_SCHEMA = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  capacityBytes: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
})

const STORAGE_PLAN_CATALOG_SCHEMA = z.record(z.string(), STORAGE_PLAN_CATALOG_ENTRY_SCHEMA).default({})
const STORAGE_PLAN_PRODUCTS_SCHEMA = z.record(z.string(), PLAN_PRODUCT_ENTRY_SCHEMA).default({})
const STORAGE_PLAN_PRICING_SCHEMA = z.record(z.string(), PLAN_PRICING_ENTRY_SCHEMA).default({})

type PlanQuotaUpdateMap = Partial<Record<BillingPlanId, Partial<BillingPlanQuota>>>
type PlanPricingUpdateMap = Partial<Record<BillingPlanId, Partial<BillingPlanPricing>>>
type PlanProductUpdateMap = Partial<Record<BillingPlanId, BillingPlanPaymentInfo>>

interface PlanFieldUpdateSummary {
  hasUpdates: boolean
  quotas: PlanQuotaUpdateMap
  pricing: PlanPricingUpdateMap
  products: PlanProductUpdateMap
}
