import { createZodDto } from '@afilmory/framework'
import { z } from 'zod'

const redirectPathInputSchema = z
  .string()
  .trim()
  .refine((value) => value.length === 0 || value.startsWith('/'), {
    message: '路径必须以 / 开头',
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
    oauthGoogleClientId: z.string().trim().min(1).nullable().optional(),
    oauthGoogleClientSecret: z.string().trim().min(1).nullable().optional(),
    oauthGoogleRedirectUri: redirectPathInputSchema.nullable().optional(),
    oauthGithubClientId: z.string().trim().min(1).nullable().optional(),
    oauthGithubClientSecret: z.string().trim().min(1).nullable().optional(),
    oauthGithubRedirectUri: redirectPathInputSchema.nullable().optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: '至少需要更新一项设置',
  })

export class UpdateSuperAdminSettingsDto extends createZodDto(updateSuperAdminSettingsSchema) {}
