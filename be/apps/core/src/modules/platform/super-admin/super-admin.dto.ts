import { BILLING_PLAN_IDS } from '@core/modules/platform/billing/plan/billing-plan.constants'
import type { BillingPlanId } from '@core/modules/platform/billing/plan/billing-plan.types'
import { createZodDto, createZodSchemaDto } from '@tsuki-hono/common'
import { z } from 'zod'

const planQuotaFields = (() => {
  const fields: Record<string, z.ZodTypeAny> = {}
  for (const planId of BILLING_PLAN_IDS) {
    fields[`billingPlan.${planId}.quota.customDomainLimit`] = z.number().int().min(0).nullable().optional()
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
    fields[`billingPlan.${planId}.payment.appStoreProductId`] = z.string().trim().min(1).nullable().optional()
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
      .refine(value => value === null || value.startsWith('http://') || value.startsWith('https://'), {
        message: '仅支持 http 或 https 协议',
      })
      .optional(),
    oauthGoogleClientId: z.string().trim().min(1).nullable().optional(),
    oauthGoogleClientSecret: z.string().trim().min(1).nullable().optional(),
    oauthGithubClientId: z.string().trim().min(1).nullable().optional(),
    oauthGithubClientSecret: z.string().trim().min(1).nullable().optional(),
    oauthAppleWebClientId: z.string().trim().min(1).nullable().optional(),
    oauthAppleAppBundleId: z.string().trim().min(1).optional(),
    oauthAppleTeamId: z.string().trim().min(1).nullable().optional(),
    oauthAppleKeyId: z.string().trim().min(1).nullable().optional(),
    storagePlanCatalog: z.record(z.string(), z.any()).optional(),
    storagePlanPricing: z.record(z.string(), z.any()).optional(),
    storagePlanProducts: z.record(z.string(), z.any()).optional(),
    managedStorageProvider: z.string().trim().min(1).nullable().optional(),
    managedStorageProviders: z.array(storageProviderSchema).optional(),
    ...planQuotaFields,
    ...planPricingFields,
    ...planProductFields,
  })
  .refine(value => Object.values(value).some(entry => entry !== undefined), {
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

const updateTenantStoragePlanSchema = z.object({
  storagePlanId: z.string().trim().min(1).nullable(),
})

export class UpdateTenantStoragePlanDto extends createZodDto(updateTenantStoragePlanSchema) {}

const updateTenantBanSchema = z.object({
  banned: z.boolean(),
})

export class UpdateTenantBanDto extends createZodDto(updateTenantBanSchema) {}

const tenantIdParamSchema = z.object({
  tenantId: z.string().trim().min(1),
})

const listTenantsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(20),
  search: z.string().trim().optional(),
  status: z.enum(['pending', 'active', 'inactive', 'suspended']).optional(),
  sortBy: z.enum(['createdAt', 'name']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
})

const tenantPhotosQuerySchema = z.object({
  limit: z.coerce.number().int().positive().default(20),
})

const userIdParamSchema = z.object({
  userId: z.string().trim().min(1),
})

const booleanQueryField = z.preprocess((value) => {
  if (value === 'true')
    return true
  if (value === 'false')
    return false
  return value
}, z.boolean().optional())

const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  status: z.enum(['active', 'banned', 'deleting']).optional(),
  emailVerified: booleanQueryField,
  hasMobileDevice: booleanQueryField,
  commercialStatus: z.enum(['none', 'free-owner', 'paid-owner', 'paid-member', 'mixed']).optional(),
  sortBy: z.enum(['createdAt', 'lastSignedInAt', 'lastActiveAt', 'name']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
})

const updateUserBanSchema = z.object({
  banned: z.boolean(),
  reason: z.string().trim().max(500).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
})

const auditQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  actorUserId: z.string().trim().optional(),
  targetType: z.string().trim().optional(),
  targetId: z.string().trim().optional(),
  action: z.string().trim().optional(),
})

const cleanupSubjectTypeSchema = z.enum(['tenant', 'user'])

const cleanupCriteriaShape = {
  inactiveMonths: z.coerce.number().int().min(1).max(24).default(3),
  maxPhotos: z.coerce.number().int().min(0).max(1000).default(0),
  maxStorageMb: z.coerce.number().int().min(0).max(100_000).default(0),
  onlyReported: z.preprocess((value) => {
    if (value === 'true')
      return true
    if (value === 'false' || value === undefined)
      return false
    return value
  }, z.boolean()),
  minSuspendedDays: z.coerce.number().int().min(1).max(365).default(14),
}

const cleanupCandidatesQuerySchema = z.object({
  subjectType: cleanupSubjectTypeSchema.default('tenant'),
  ...cleanupCriteriaShape,
})

const executeCleanupSchema = z.object({
  subjectType: cleanupSubjectTypeSchema,
  mode: z.enum(['suspend', 'delete']),
  criteria: z.object(cleanupCriteriaShape),
  ids: z.array(z.string().trim().min(1)).min(1).max(500),
  confirmation: z.string().trim().min(1),
})

const cleanupItemParamSchema = z.object({
  itemId: z.string().trim().min(1),
})

export class TenantIdParamDto extends createZodSchemaDto(tenantIdParamSchema) {}
export class ListTenantsQueryDto extends createZodSchemaDto(listTenantsQuerySchema) {}
export class TenantPhotosQueryDto extends createZodSchemaDto(tenantPhotosQuerySchema) {}
export class UserIdParamDto extends createZodSchemaDto(userIdParamSchema) {}
export class ListUsersQueryDto extends createZodSchemaDto(listUsersQuerySchema) {}
export class UpdateUserBanDto extends createZodDto(updateUserBanSchema) {}
export class AuditLogQueryDto extends createZodSchemaDto(auditQuerySchema) {}
export class CleanupCandidatesQueryDto extends createZodSchemaDto(cleanupCandidatesQuerySchema) {}
export class ExecuteTenantCleanupDto extends createZodDto(executeCleanupSchema) {}
export class CleanupItemParamDto extends createZodSchemaDto(cleanupItemParamSchema) {}
