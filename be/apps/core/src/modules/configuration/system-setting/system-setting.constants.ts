import { DEFAULT_BASE_DOMAIN } from '@afilmory/utils'
import {
  BILLING_PLAN_DEFINITIONS,
  BILLING_PLAN_IDS,
  BILLING_PLAN_OVERRIDES_SETTING_KEY,
  BILLING_PLAN_PRICING_SETTING_KEY,
  BILLING_PLAN_PRODUCTS_SETTING_KEY,
} from 'core/modules/platform/billing/billing-plan.constants'
import type { BillingPlanId, BillingPlanQuota } from 'core/modules/platform/billing/billing-plan.types'
import {
  DEFAULT_STORAGE_PLAN_CATALOG,
  STORAGE_PLAN_CATALOG_SETTING_KEY,
  STORAGE_PLAN_PRICING_SETTING_KEY,
  STORAGE_PLAN_PRODUCTS_SETTING_KEY,
} from 'core/modules/platform/billing/storage-plan.constants'
import type { StoragePlanCatalog } from 'core/modules/platform/billing/storage-plan.types'
import { z } from 'zod'

const nonEmptyString = z.string().trim().min(1)
const nullableNonEmptyString = nonEmptyString.nullable()
const nullableUrl = z.string().trim().url({ message: '必须是有效的 URL' }).nullable()
const nullableHttpUrl = nullableUrl.refine(
  (value) => value === null || value.startsWith('http://') || value.startsWith('https://'),
  { message: '只支持 http 或 https 协议' },
)

export const SYSTEM_SETTING_DEFINITIONS = {
  allowRegistration: {
    key: 'system.registration.allow',
    schema: z.boolean(),
    defaultValue: true,
    isSensitive: false,
  },
  maxRegistrableUsers: {
    key: 'system.registration.maxUsers',
    schema: z.number().int().min(0).nullable(),
    defaultValue: null as number | null,
    isSensitive: false,
  },
  maxPhotoUploadSizeMb: {
    key: 'system.photo.upload.maxSizeMb',
    schema: z.number().int().positive().nullable(),
    defaultValue: null as number | null,
    isSensitive: false,
  },
  maxDataSyncObjectSizeMb: {
    key: 'system.photo.sync.maxObjectSizeMb',
    schema: z.number().int().positive().nullable(),
    defaultValue: null as number | null,
    isSensitive: false,
  },
  maxPhotoLibraryItems: {
    key: 'system.photo.library.maxItems',
    schema: z.number().int().min(0).nullable(),
    defaultValue: null as number | null,
    isSensitive: false,
  },
  localProviderEnabled: {
    key: 'system.auth.localProvider.enabled',
    schema: z.boolean(),
    defaultValue: true,
    isSensitive: false,
  },
  baseDomain: {
    key: 'system.domain.base',
    schema: z
      .string()
      .trim()
      .min(1)
      .regex(/^[a-z0-9.-]+$/i, {
        message: '域名只能包含字母、数字、连字符和点',
      }),
    defaultValue: DEFAULT_BASE_DOMAIN,
    isSensitive: false,
  },
  oauthGatewayUrl: {
    key: 'system.auth.oauth.gatewayUrl',
    schema: nullableHttpUrl,
    defaultValue: null as string | null,
    isSensitive: false,
  },
  oauthGoogleClientId: {
    key: 'system.auth.oauth.google.clientId',
    schema: nullableNonEmptyString,
    defaultValue: null as string | null,
    isSensitive: false,
  },
  oauthGoogleClientSecret: {
    key: 'system.auth.oauth.google.clientSecret',
    schema: nullableNonEmptyString,
    defaultValue: null as string | null,
    isSensitive: true,
  },
  oauthGithubClientId: {
    key: 'system.auth.oauth.github.clientId',
    schema: nullableNonEmptyString,
    defaultValue: null as string | null,
    isSensitive: false,
  },
  oauthGithubClientSecret: {
    key: 'system.auth.oauth.github.clientSecret',
    schema: nullableNonEmptyString,
    defaultValue: null as string | null,
    isSensitive: true,
  },
  billingPlanOverrides: {
    key: BILLING_PLAN_OVERRIDES_SETTING_KEY,
    schema: z.record(z.string(), z.any()),
    defaultValue: {},
    isSensitive: false,
  },
  billingPlanProducts: {
    key: BILLING_PLAN_PRODUCTS_SETTING_KEY,
    schema: z.record(z.string(), z.any()),
    defaultValue: {},
    isSensitive: false,
  },
  billingPlanPricing: {
    key: BILLING_PLAN_PRICING_SETTING_KEY,
    schema: z.record(z.string(), z.any()),
    defaultValue: {},
    isSensitive: false,
  },
  storagePlanCatalog: {
    key: STORAGE_PLAN_CATALOG_SETTING_KEY,
    schema: z.record(z.string(), z.any()),
    defaultValue: DEFAULT_STORAGE_PLAN_CATALOG satisfies StoragePlanCatalog,
    isSensitive: false,
  },
  storagePlanProducts: {
    key: STORAGE_PLAN_PRODUCTS_SETTING_KEY,
    schema: z.record(z.string(), z.any()),
    defaultValue: {},
    isSensitive: false,
  },
  storagePlanPricing: {
    key: STORAGE_PLAN_PRICING_SETTING_KEY,
    schema: z.record(z.string(), z.any()),
    defaultValue: {},
    isSensitive: false,
  },
  managedStorageProvider: {
    key: 'system.storage.managed.provider',
    schema: z.string().trim().min(1).nullable(),
    defaultValue: null as string | null,
    isSensitive: false,
  },
  managedStorageProviders: {
    key: 'system.storage.managed.providers',
    schema: z.string(),
    defaultValue: '[]',
    isSensitive: true,
  },
} as const

const BILLING_PLAN_QUOTA_KEYS = [
  'monthlyAssetProcessLimit',
  'libraryItemLimit',
  'maxUploadSizeMb',
  'maxSyncObjectSizeMb',
] as const
export type BillingPlanQuotaFieldKey = (typeof BILLING_PLAN_QUOTA_KEYS)[number]

const BILLING_PLAN_PRICING_KEYS = ['monthlyPrice', 'currency'] as const
export type BillingPlanPricingFieldKey = (typeof BILLING_PLAN_PRICING_KEYS)[number]

const BILLING_PLAN_PAYMENT_KEYS = ['creemProductId'] as const
export type BillingPlanPaymentFieldKey = (typeof BILLING_PLAN_PAYMENT_KEYS)[number]

export type BillingPlanQuotaField = `billingPlan.${BillingPlanId}.quota.${BillingPlanQuotaFieldKey}`
export type BillingPlanPricingField = `billingPlan.${BillingPlanId}.pricing.${BillingPlanPricingFieldKey}`
export type BillingPlanPaymentField = `billingPlan.${BillingPlanId}.payment.${BillingPlanPaymentFieldKey}`

export type BillingPlanSettingField = BillingPlanQuotaField | BillingPlanPricingField | BillingPlanPaymentField

export type SystemSettingDbField = keyof typeof SYSTEM_SETTING_DEFINITIONS

export type SystemSettingField = SystemSettingDbField | BillingPlanSettingField
export type SystemSettingKey = (typeof SYSTEM_SETTING_DEFINITIONS)[SystemSettingDbField]['key']

export const BILLING_PLAN_FIELD_DESCRIPTORS = {
  quotas: BILLING_PLAN_IDS.flatMap((planId) =>
    BILLING_PLAN_QUOTA_KEYS.map((key) => ({
      planId,
      key,
      field: `billingPlan.${planId}.quota.${key}` as BillingPlanQuotaField,
      defaultValue: BILLING_PLAN_DEFINITIONS[planId].quotas[key as keyof BillingPlanQuota],
    })),
  ),
  pricing: BILLING_PLAN_IDS.flatMap((planId) =>
    BILLING_PLAN_PRICING_KEYS.map((key) => ({
      planId,
      key,
      field: `billingPlan.${planId}.pricing.${key}` as BillingPlanPricingField,
    })),
  ),
  payment: BILLING_PLAN_IDS.flatMap((planId) =>
    BILLING_PLAN_PAYMENT_KEYS.map((key) => ({
      planId,
      key,
      field: `billingPlan.${planId}.payment.${key}` as BillingPlanPaymentField,
    })),
  ),
} as const

export const SYSTEM_SETTING_KEYS = Object.values(SYSTEM_SETTING_DEFINITIONS).map((definition) => definition.key)
