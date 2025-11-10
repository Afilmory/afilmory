import { authUsers } from '@afilmory/db'
import { HttpContext } from '@afilmory/framework'
import { DbAccessor } from 'core/database/database.provider'
import { BizException, ErrorCode } from 'core/errors'
import { SETTING_SCHEMAS } from 'core/modules/configuration/setting/setting.constant'
import type { SettingEntryInput } from 'core/modules/configuration/setting/setting.service'
import { SettingService } from 'core/modules/configuration/setting/setting.service'
import type { SettingKeyType } from 'core/modules/configuration/setting/setting.type'
import { SystemSettingService } from 'core/modules/configuration/system-setting/system-setting.service'
import { eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { getTenantContext } from '../tenant/tenant.context'
import { TenantRepository } from '../tenant/tenant.repository'
import { TenantService } from '../tenant/tenant.service'
import type { TenantRecord } from '../tenant/tenant.types'
import type { AuthSession } from './auth.provider'
import { AuthProvider } from './auth.provider'

type RegisterTenantAccountInput = {
  email: string
  password: string
  name: string
}

type RegisterTenantInput = {
  account?: RegisterTenantAccountInput
  tenant?: {
    name: string
    slug?: string | null
  }
  settings?: Array<{ key: string; value: unknown }>
  useSessionAccount?: boolean
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
    const account = input.account ? this.normalizeAccountInput(input.account) : null
    const useSessionAccount = input.useSessionAccount ?? false
    const sessionUser = this.getSessionUser()

    if (useSessionAccount && !sessionUser) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED, { message: '请先登录后再创建工作区' })
    }

    if (tenantContext) {
      if (useSessionAccount) {
        throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '当前租户上下文下不支持会话注册' })
      }
      if (!account) {
        throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '缺少注册账号信息' })
      }
      return await this.registerExistingTenantMember(account, headers, tenantContext.tenant)
    }

    if (!input.tenant) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '租户信息不能为空' })
    }

    return await this.registerNewTenant(account, input.tenant, headers, input.settings, useSessionAccount)
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
    account: RegisterTenantAccountInput | null,
    tenantInput: RegisterTenantInput['tenant'],
    headers: Headers,
    settings?: RegisterTenantInput['settings'],
    useSessionAccount?: boolean,
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
      const sessionUser = useSessionAccount ? this.getSessionUser() : null
      if (!account && !sessionUser) {
        throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '缺少注册账号信息' })
      }

      const tenantAggregate = await this.tenantService.createTenant({
        name: tenantName,
        slug,
      })
      tenantId = tenantAggregate.tenant.id

      let response: Response | null = null
      let userId: string | undefined
      const db = this.dbAccessor.get()

      if (account) {
        const auth = await this.authProvider.getAuth()
        const signupResponse = await auth.api.signUpEmail({
          body: {
            email: account.email,
            password: account.password,
            name: account.name,
          },
          headers,
          asResponse: true,
        })

        if (!signupResponse.ok) {
          await this.tenantService.deleteTenant(tenantId).catch(() => {})
          tenantId = null
          return { response: signupResponse, success: false }
        }

        try {
          const payload = (await signupResponse.clone().json()) as { user?: { id?: string } } | null
          userId = payload?.user?.id
        } catch {
          userId = undefined
        }

        if (!userId) {
          await this.tenantService.deleteTenant(tenantId).catch(() => {})
          tenantId = null
          throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
            message: '注册成功但未返回用户信息，请稍后重试。',
          })
        }

        await db.update(authUsers).set({ tenantId, role: 'admin' }).where(eq(authUsers.id, userId))
        response = signupResponse
      } else if (sessionUser && tenantId) {
        userId = await this.attachSessionUserToTenant(tenantId)
        response = new Response(JSON.stringify({ user: { id: userId } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const initialSettings = this.normalizeSettings(settings)
      if (initialSettings.length > 0 && tenantId) {
        await this.settingService.setMany(
          initialSettings.map((entry) => ({
            ...entry,
            options: {
              tenantId,
              isSensitive: false,
            },
          })),
        )
      }

      const refreshed = await this.tenantService.getById(tenantId)

      return {
        response: response ?? new Response(null, { status: 200 }),
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

  private getSessionUser(): AuthSession['user'] | null {
    try {
      const auth = HttpContext.getValue('auth') as { user?: AuthSession['user'] } | undefined
      return auth?.user ?? null
    } catch {
      return null
    }
  }

  private async attachSessionUserToTenant(tenantId: string): Promise<string> {
    const sessionUser = this.getSessionUser()
    const sessionUserId = (sessionUser as { id?: string } | null)?.id
    if (!sessionUserId) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED, { message: '当前登录状态无效，请重新登录。' })
    }

    const db = this.dbAccessor.get()
    const [record] = await db
      .select({ tenantId: authUsers.tenantId })
      .from(authUsers)
      .where(eq(authUsers.id, sessionUserId))
      .limit(1)

    if (!record) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED, { message: '无法找到当前用户信息。' })
    }

    if (record.tenantId) {
      const isPlaceholder = await this.tenantService.isPlaceholderTenantId(record.tenantId)
      if (!isPlaceholder) {
        throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '当前账号已属于其它工作区，无法重复注册。' })
      }
    }

    await db
      .update(authUsers)
      .set({
        tenantId,
        role: 'admin',
        name: sessionUser.name ?? sessionUser.email ?? 'Workspace Admin',
      })
      .where(eq(authUsers.id, sessionUserId))

    return sessionUserId
  }
}
