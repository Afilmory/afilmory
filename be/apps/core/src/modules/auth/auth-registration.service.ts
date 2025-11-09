import { authUsers } from '@afilmory/db'
import { BizException, ErrorCode } from 'core/errors'
import { eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { DbAccessor } from '../../database/database.provider'
import { SETTING_SCHEMAS } from '../setting/setting.constant'
import type { SettingEntryInput } from '../setting/setting.service'
import { SettingService } from '../setting/setting.service'
import type { SettingKeyType } from '../setting/setting.type'
import { SystemSettingService } from '../system-setting/system-setting.service'
import { getTenantContext } from '../tenant/tenant.context'
import { TenantRepository } from '../tenant/tenant.repository'
import { TenantService } from '../tenant/tenant.service'
import type { TenantRecord } from '../tenant/tenant.types'
import { AuthProvider } from './auth.provider'

type RegisterTenantAccountInput = {
  email: string
  password: string
  name: string
}

type RegisterTenantInput = {
  account: RegisterTenantAccountInput
  tenant?: {
    name: string
    slug?: string | null
  }
  settings?: Array<{ key: string; value: unknown }>
}

export interface RegisterTenantResult {
  response: Response
  tenant?: TenantRecord
  accountId?: string
  success: boolean
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/-{2,}/g, '-')
    .replaceAll(/^-+|-+$/g, '')
}

@injectable()
export class AuthRegistrationService {
  constructor(
    private readonly authProvider: AuthProvider,
    private readonly tenantService: TenantService,
    private readonly tenantRepository: TenantRepository,
    private readonly systemSettings: SystemSettingService,
    private readonly settingService: SettingService,
    private readonly dbAccessor: DbAccessor,
  ) {}

  async registerTenant(input: RegisterTenantInput, headers: Headers): Promise<RegisterTenantResult> {
    await this.systemSettings.ensureRegistrationAllowed()

    const tenantContext = getTenantContext()
    const account = this.normalizeAccountInput(input.account)

    if (tenantContext) {
      return await this.registerExistingTenantMember(account, headers, tenantContext.tenant)
    }

    if (!input.tenant) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '租户信息不能为空' })
    }

    return await this.registerNewTenant(account, input.tenant, headers, input.settings)
  }

  private async generateUniqueSlug(base: string): Promise<string> {
    const sanitizedBase = base.length > 0 ? base : 'tenant'

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = attempt === 0 ? sanitizedBase : `${sanitizedBase}-${attempt + 1}`
      const existing = await this.tenantRepository.findBySlug(candidate)
      if (!existing) {
        return candidate
      }
    }

    throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
      message: '无法生成唯一的租户标识，请尝试使用不同的名称',
    })
  }

  private normalizeAccountInput(account: RegisterTenantAccountInput): Required<RegisterTenantAccountInput> {
    const email = account.email?.trim().toLowerCase() ?? ''
    if (!email) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '邮箱不能为空' })
    }

    const password = account.password?.trim() ?? ''
    if (password.length < 8) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: '密码长度至少需要 8 个字符',
      })
    }

    const name = account.name?.trim() || email

    return {
      email,
      password,
      name,
    }
  }

  private async registerExistingTenantMember(
    account: Required<RegisterTenantAccountInput>,
    headers: Headers,
    tenant: TenantRecord,
  ): Promise<RegisterTenantResult> {
    headers.set('x-tenant-id', tenant.id)
    if (tenant.slug) {
      headers.set('x-tenant-slug', tenant.slug)
    }

    const auth = await this.authProvider.getAuth()
    const response = await auth.api.signUpEmail({
      body: {
        email: account.email,
        password: account.password,
        name: account.name,
      },
      headers,
      asResponse: true,
    })

    if (!response.ok) {
      return { response, success: false, tenant }
    }

    let userId: string | undefined
    try {
      const payload = (await response.clone().json()) as { user?: { id?: string } } | null
      userId = payload?.user?.id
    } catch {
      userId = undefined
    }

    if (!userId) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: '注册成功但未返回用户信息，请稍后重试。',
      })
    }

    const db = this.dbAccessor.get()
    await db.update(authUsers).set({ tenantId: tenant.id, role: 'user' }).where(eq(authUsers.id, userId))

    return {
      response,
      tenant,
      accountId: userId,
      success: true,
    }
  }

  private normalizeSettings(settings?: RegisterTenantInput['settings']): SettingEntryInput[] {
    if (!settings || settings.length === 0) {
      return []
    }

    const normalized: SettingEntryInput[] = []

    for (const entry of settings) {
      const key = entry.key?.trim() ?? ''
      if (!key) {
        throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
          message: 'Setting key cannot be empty',
        })
      }

      if (!(key in SETTING_SCHEMAS)) {
        throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
          message: `Unknown setting key: ${key}`,
        })
      }

      const schema = SETTING_SCHEMAS[key as SettingKeyType]
      const value = schema.parse(entry.value)

      normalized.push({
        key: key as SettingKeyType,
        value,
      })
    }

    return normalized
  }

  private async registerNewTenant(
    account: Required<RegisterTenantAccountInput>,
    tenantInput: RegisterTenantInput['tenant'],
    headers: Headers,
    settings?: RegisterTenantInput['settings'],
  ): Promise<RegisterTenantResult> {
    const tenantName = tenantInput?.name?.trim() ?? ''
    if (!tenantName) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '租户名称不能为空' })
    }

    const slugBase = tenantInput?.slug?.trim() ? slugify(tenantInput.slug) : slugify(tenantName)
    if (!slugBase) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '租户标识不能为空' })
    }

    const slug = await this.generateUniqueSlug(slugBase)

    let tenantId: string | null = null
    try {
      const tenantAggregate = await this.tenantService.createTenant({
        name: tenantName,
        slug,
      })
      tenantId = tenantAggregate.tenant.id

      const auth = await this.authProvider.getAuth()
      const response = await auth.api.signUpEmail({
        body: {
          email: account.email,
          password: account.password,
          name: account.name,
        },
        headers,
        asResponse: true,
      })

      if (!response.ok) {
        if (tenantId) {
          await this.tenantService.deleteTenant(tenantId).catch(() => {})
          tenantId = null
        }
        return { response, success: false }
      }

      let userId: string | undefined
      try {
        const payload = (await response.clone().json()) as { user?: { id?: string } } | null
        userId = payload?.user?.id
      } catch {
        userId = undefined
      }

      if (!userId) {
        if (tenantId) {
          await this.tenantService.deleteTenant(tenantId).catch(() => {})
          tenantId = null
        }
        throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
          message: '注册成功但未返回用户信息，请稍后重试。',
        })
      }

      const db = this.dbAccessor.get()
      await db.update(authUsers).set({ tenantId, role: 'admin' }).where(eq(authUsers.id, userId))

      const initialSettings = this.normalizeSettings(settings)
      if (initialSettings.length > 0) {
        await this.settingService.setMany(
          initialSettings.map((entry) => ({
            ...entry,
            options: {
              ...(tenantId ? { tenantId } : {}),
              isSensitive: false,
            },
          })),
        )
      }

      const refreshed = await this.tenantService.getById(tenantId)

      return {
        response,
        tenant: refreshed.tenant,
        accountId: userId,
        success: true,
      }
    } catch (error) {
      if (tenantId) {
        await this.tenantService.deleteTenant(tenantId).catch(() => {})
      }
      throw error
    }
  }
}
