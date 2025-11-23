import { createZodDto } from '@afilmory/framework'
import { BILLING_PLAN_IDS } from 'core/modules/platform/billing/billing-plan.constants'
import type { BillingPlanId } from 'core/modules/platform/billing/billing-plan.types'
import { z } from 'zod'

const planQuotaFields = (() => {
  const fields: Record<string, z.ZodTypeAny> = {}
  for (const planId of BILLING_PLAN_IDS) {
    fields[`billingPlan.${planId}.quota.monthlyAssetProcessLimit`] = z.number().int().min(0).nullable().optional()
    fields[`billingPlan.${planId}.quota.libraryItemLimit`] = z.number().int().min(0).nullable().optional()
    fields[`billingPlan.${planId}.quota.maxUploadSizeMb`] = z.number().int().min(1).nullable().optional()
    fields[`billingPlan.${planId}.quota.maxSyncObjectSizeMb`] = z.number().int().min(1).nullable().optional()
  }
  return fields
})()

const planPricingFields = (() => {
  const fields: Record<string, z.ZodTypeAny> = {}
  for (const planId of BILLING_PLAN_IDS) {
    fields[`billingPlan.${planId}.pricing.monthlyPrice`] = z.number().min(0).nullable().optional()
    fields[`billingPlan.${planId}.pricing.currency`] = z.string().trim().min(1).nullable().optional()
  }
  return fields
})()

const planProductFields = (() => {
  const fields: Record<string, z.ZodTypeAny> = {}
  for (const planId of BILLING_PLAN_IDS) {
    fields[`billingPlan.${planId}.payment.creemProductId`] = z.string().trim().min(1).nullable().optional()
  }
  return fields
})()

const storageProviderConfigSchema = z.record(z.string(), z.string())
const storageProviderSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().optional(),
  type: z.string().trim().min(1),
  config: storageProviderConfigSchema.optional(),
})

const updateSuperAdminSettingsSchema = z
  .object({
    allowRegistration: z.boolean().optional(),
    maxRegistrableUsers: z.number().int().min(0).nullable().optional(),
    localProviderEnabled: z.boolean().optional(),
    baseDomain: z
      .string()
      .trim()
      .min(1)
      .regex(/^[a-z0-9.-]+$/i, { message: '无效的基础域名' })
      .optional(),
    oauthGatewayUrl: z
      .string()
      .trim()
      .url({ message: '必须是有效的 URL' })
      .nullable()
      .refine((value) => value === null || value.startsWith('http://') || value.startsWith('https://'), {
        message: '仅支持 http 或 https 协议',
      })
      .optional(),
    oauthGoogleClientId: z.string().trim().min(1).nullable().optional(),
    oauthGoogleClientSecret: z.string().trim().min(1).nullable().optional(),
    oauthGithubClientId: z.string().trim().min(1).nullable().optional(),
    oauthGithubClientSecret: z.string().trim().min(1).nullable().optional(),
    storagePlanCatalog: z.record(z.string(), z.any()).optional(),
    storagePlanPricing: z.record(z.string(), z.any()).optional(),
    storagePlanProducts: z.record(z.string(), z.any()).optional(),
    managedStorageProvider: z.string().trim().min(1).nullable().optional(),
    managedStorageProviders: z.array(storageProviderSchema).optional(),
    ...planQuotaFields,
    ...planPricingFields,
    ...planProductFields,
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: '至少需要更新一项设置',
  })

export class UpdateSuperAdminSettingsDto extends createZodDto(updateSuperAdminSettingsSchema) {}

const validPlanIdSchema = z
  .string()
  .refine((value): value is BillingPlanId => BILLING_PLAN_IDS.includes(value as BillingPlanId), {
    message: '无效的订阅计划',
  })

const updateTenantPlanSchema = z.object({
  planId: validPlanIdSchema,
})

export class UpdateTenantPlanDto extends createZodDto(updateTenantPlanSchema) {}

const updateTenantBanSchema = z.object({
  banned: z.boolean(),
})

export class UpdateTenantBanDto extends createZodDto(updateTenantBanSchema) {}
