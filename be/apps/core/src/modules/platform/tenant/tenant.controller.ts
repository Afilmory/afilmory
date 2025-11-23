import { Body, Controller, createZodSchemaDto, Delete, Get, Param, Post } from '@afilmory/framework'
import { isTenantSlugReserved } from '@afilmory/utils'
import { AllowPlaceholderTenant } from 'core/decorators/allow-placeholder.decorator'
import { SkipTenantGuard } from 'core/decorators/skip-tenant.decorator'
import { BizException, ErrorCode } from 'core/errors'
import { Roles } from 'core/guards/roles.decorator'
import { SystemSettingService } from 'core/modules/configuration/system-setting/system-setting.service'
import { z } from 'zod'

import { TenantService } from './tenant.service'
import { TenantDomainService } from './tenant-domain.service'

const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i

const checkTenantSlugSchema = z.object({
  slug: z
    .union([z.string(), z.null()])
    .optional()
    .transform((val) => {
      if (!val) {
        return null
      }
      const normalized = val.trim().toLowerCase()
      return normalized.length > 0 ? normalized : null
    })
    .pipe(
      z
        .string()
        .nullable()
        .refine((val) => val !== null, { message: '空间名称不能为空' })
        .transform((val) => val as string)
        .pipe(
          z
            .string()
            .min(3, { message: '空间名称至少需要 3 个字符' })
            .max(63, { message: '空间名称长度不能超过 63 个字符' })
            .regex(TENANT_SLUG_PATTERN, {
              message: '空间名称只能包含字母、数字或连字符 (-)，且不能以连字符开头或结尾。',
            }),
        ),
    ),
})

class CheckTenantSlugDto extends createZodSchemaDto(checkTenantSlugSchema) {}

const requestDomainSchema = z.object({
  domain: z
    .string()
    .trim()
    .min(1, { message: '域名不能为空' })
    .regex(/^[a-z0-9.-]+$/i, { message: '域名只能包含字母、数字、连字符和点' }),
})

class RequestTenantDomainDto extends createZodSchemaDto(requestDomainSchema) {}

@Controller('tenant')
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly systemSettings: SystemSettingService,
    private readonly tenantDomainService: TenantDomainService,
  ) {}

  @AllowPlaceholderTenant()
  @SkipTenantGuard()
  @Post('/check-slug')
  async checkTenantSlug(@Body() body: CheckTenantSlugDto) {
    await this.systemSettings.ensureRegistrationAllowed()

    const { slug } = body

    if (isTenantSlugReserved(slug)) {
      throw new BizException(ErrorCode.TENANT_SLUG_RESERVED, { message: '该空间名称已被系统保留，请尝试其他名称。' })
    }

    const available = await this.tenantService.isSlugAvailable(slug)
    if (!available) {
      throw new BizException(ErrorCode.COMMON_CONFLICT, { message: '该空间名称已被使用，请换一个更独特的名字。' })
    }

    const settings = await this.systemSettings.getSettings()
    const tenantHost = `${slug}.${settings.baseDomain}`

    return {
      ok: true,
      slug,
      baseDomain: settings.baseDomain,
      tenantHost,
      nextUrl: this.buildTenantWelcomeUrl(slug, settings.baseDomain),
    }
  }

  private buildTenantWelcomeUrl(slug: string, baseDomain: string): string {
    const normalizedBase = baseDomain.trim()
    const host = normalizedBase ? `${slug}.${normalizedBase}` : slug
    const protocol = this.resolveTenantProtocol(host)
    return `${protocol}://${host}/platform/welcome`
  }

  private resolveTenantProtocol(host: string): 'http' | 'https' {
    const normalized = host.trim().toLowerCase()
    if (normalized.includes('localhost') || normalized.startsWith('127.') || normalized.endsWith('.local')) {
      return 'http'
    }
    return 'https'
  }

  @Get('/domains')
  @Roles('admin')
  async listDomains() {
    const domains = await this.tenantDomainService.listDomainsForTenant()
    return { domains }
  }

  @Post('/domains')
  @Roles('admin')
  async requestDomain(@Body() body: RequestTenantDomainDto) {
    const aggregate = await this.tenantDomainService.requestDomain(body.domain)
    return { domain: aggregate.domain }
  }

  @Post('/domains/:domainId/verify')
  @Roles('admin')
  async verifyDomain(@Param('domainId') domainId: string) {
    const aggregate = await this.tenantDomainService.verifyDomain(domainId)
    return { domain: aggregate.domain }
  }

  @Delete('/domains/:domainId')
  @Roles('admin')
  async deleteDomain(@Param('domainId') domainId: string) {
    await this.tenantDomainService.deleteDomain(domainId)
    return { deleted: true }
  }
}
