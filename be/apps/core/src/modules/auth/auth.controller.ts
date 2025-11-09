import { authUsers } from '@afilmory/db'
import { Body, ContextParam, Controller, Get, HttpContext, Post, UnauthorizedException } from '@afilmory/framework'
import { freshSessionMiddleware } from 'better-auth/api'
import { BizException, ErrorCode } from 'core/errors'
import { eq } from 'drizzle-orm'
import type { Context } from 'hono'

import { DbAccessor } from '../../database/database.provider'
import { RoleBit, Roles } from '../../guards/roles.decorator'
import { SystemSettingService } from '../system-setting/system-setting.service'
import { getTenantContext } from '../tenant/tenant.context'
import type { SocialProvidersConfig } from './auth.config'
import { AuthProvider } from './auth.provider'
import { AuthRegistrationService } from './auth-registration.service'

const SOCIAL_PROVIDER_METADATA: Record<string, { name: string; icon: string }> = {
  google: {
    name: 'Google',
    icon: 'i-simple-icons-google',
  },
  github: {
    name: 'GitHub',
    icon: 'i-simple-icons-github',
  },
}

function resolveSocialProviderMetadata(id: string): { name: string; icon: string } {
  const metadata = SOCIAL_PROVIDER_METADATA[id]
  if (metadata) {
    return metadata
  }
  const formattedId = id.replaceAll(/[-_]/g, ' ').replaceAll(/\b\w/g, (match) => match.toUpperCase())
  return {
    name: formattedId.trim() || id,
    icon: 'i-mingcute-earth-2-line',
  }
}

function buildProviderResponse(socialProviders: SocialProvidersConfig) {
  return Object.entries(socialProviders)
    .filter(([, config]) => Boolean(config))
    .map(([id, config]) => {
      const metadata = resolveSocialProviderMetadata(id)
      return {
        id,
        name: metadata.name,
        icon: metadata.icon,
        callbackPath: config?.redirectPath ?? null,
      }
    })
}

type TenantSignUpRequest = {
  account?: {
    email?: string
    password?: string
    name?: string
  }
  tenant?: {
    name?: string
    slug?: string | null
  }
  settings?: Array<{ key?: string; value?: unknown }>
}

type SocialSignInRequest = {
  provider: string
  requestSignUp?: boolean
  callbackURL?: string
  errorCallbackURL?: string
  newUserCallbackURL?: string
  disableRedirect?: boolean
}

type LinkSocialAccountRequest = {
  provider?: string
  callbackURL?: string
  errorCallbackURL?: string
  disableRedirect?: boolean
}

type UnlinkSocialAccountRequest = {
  providerId?: string
  accountId?: string
}

type SocialAccountRecord = {
  id: string
  providerId: string
  accountId: string
  createdAt: string
  updatedAt: string
  scopes: string[]
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthProvider,
    private readonly dbAccessor: DbAccessor,
    private readonly systemSettings: SystemSettingService,
    private readonly registration: AuthRegistrationService,
  ) {}

  @Get('/session')
  async getSession(@ContextParam() _context: Context) {
    const authContext = HttpContext.getValue('auth')
    if (!authContext?.user || !authContext.session) {
      throw new UnauthorizedException()
    }
    return {
      user: authContext.user,
      session: authContext.session,
    }
  }

  @Get('/social/providers')
  async getSocialProviders() {
    const { socialProviders } = await this.systemSettings.getAuthModuleConfig()
    return { providers: buildProviderResponse(socialProviders) }
  }

  @Get('/social/accounts')
  @Roles(RoleBit.ADMIN)
  async getSocialAccounts(@ContextParam() context: Context) {
    const auth = await this.auth.getAuth()
    const headers = this.buildTenantAwareHeaders(context)
    const accounts = await auth.api.listUserAccounts({ headers })
    const { socialProviders } = await this.systemSettings.getAuthModuleConfig()
    const enabledProviders = new Set(Object.keys(socialProviders))
    return {
      accounts: accounts
        .filter((account) => account.providerId !== 'credential' && enabledProviders.has(account.providerId))
        .map((account) => this.serializeSocialAccount(account)),
    }
  }

  @Post('/social/link')
  @Roles(RoleBit.ADMIN)
  async linkSocialAccount(@ContextParam() context: Context, @Body() body: LinkSocialAccountRequest) {
    const provider = body?.provider?.trim()
    if (!provider) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '缺少 OAuth Provider 参数' })
    }

    const { socialProviders } = await this.systemSettings.getAuthModuleConfig()
    if (!socialProviders[provider]) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '当前未启用该 OAuth Provider' })
    }

    const headers = this.buildTenantAwareHeaders(context)
    const callbackURL = this.normalizeCallbackUrl(body?.callbackURL)
    const errorCallbackURL = this.normalizeCallbackUrl(body?.errorCallbackURL)

    const auth = await this.auth.getAuth()
    const response = await auth.api.linkSocialAccount({
      headers,
      body: {
        provider,
        requestSignUp: false,
        disableRedirect: body?.disableRedirect ?? true,
        ...(callbackURL ? { callbackURL } : {}),
        ...(errorCallbackURL ? { errorCallbackURL } : {}),
      },
      asResponse: true,
    })

    return response
  }

  @Post('/social/unlink')
  @Roles(RoleBit.ADMIN)
  async unlinkSocialAccount(@ContextParam() context: Context, @Body() body: UnlinkSocialAccountRequest) {
    const providerId = body?.providerId?.trim()
    if (!providerId) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '缺少 OAuth Provider 参数' })
    }

    const headers = this.buildTenantAwareHeaders(context)
    const auth = await this.auth.getAuth()
    const result = await auth.api.unlinkAccount({
      headers,
      body: {
        providerId,
        accountId: body?.accountId?.trim() || undefined,
      },
      use: [freshSessionMiddleware],
      asResponse: true,
    })

    return result
  }

  @Post('/sign-in/email')
  async signInEmail(@ContextParam() context: Context, @Body() body: { email: string; password: string }) {
    const email = body.email.trim()
    if (email.length === 0) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '邮箱不能为空' })
    }
    const settings = await this.systemSettings.getSettings()
    if (!settings.localProviderEnabled) {
      const db = this.dbAccessor.get()
      const [record] = await db
        .select({ role: authUsers.role })
        .from(authUsers)
        .where(eq(authUsers.email, email))
        .limit(1)

      const isSuperAdmin = record?.role === 'superadmin'
      if (!isSuperAdmin) {
        throw new BizException(ErrorCode.AUTH_FORBIDDEN, {
          message: '邮箱密码登录已禁用，请联系管理员开启本地登录。',
        })
      }
    }

    const auth = await this.auth.getAuth()
    const headers = this.buildTenantAwareHeaders(context)
    const response = await auth.api.signInEmail({
      body: {
        email,
        password: body.password,
      },
      asResponse: true,
      headers,
    })
    return response
  }

  @Post('/social')
  async signInSocial(@ContextParam() context: Context, @Body() body: SocialSignInRequest) {
    const provider = body?.provider?.trim()
    if (!provider) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '缺少 OAuth Provider 参数' })
    }

    const headers = this.buildTenantAwareHeaders(context)
    const tenantContext = getTenantContext()

    const auth = await this.auth.getAuth()
    const response = await auth.api.signInSocial({
      body: {
        ...body,
        provider,
        requestSignUp: body.requestSignUp ?? Boolean(tenantContext),
      },
      headers,
      asResponse: true,
    })

    if (tenantContext) {
      context.header('x-tenant-id', tenantContext.tenant.id)
      if (tenantContext.tenant.slug) {
        context.header('x-tenant-slug', tenantContext.tenant.slug)
      }
    }

    return response
  }

  @Post('/sign-up/email')
  async signUpEmail(@ContextParam() context: Context, @Body() body: TenantSignUpRequest) {
    if (!body?.account) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '缺少注册账号信息' })
    }

    const tenantContext = getTenantContext()
    if (!tenantContext && !body.tenant) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '缺少租户信息' })
    }

    const headers = this.buildTenantAwareHeaders(context)

    const result = await this.registration.registerTenant(
      {
        account: {
          email: body.account.email ?? '',
          password: body.account.password ?? '',
          name: body.account.name ?? '',
        },
        tenant: body.tenant
          ? {
              name: body.tenant.name ?? '',
              slug: body.tenant.slug ?? null,
            }
          : undefined,
        settings: body.settings?.filter(
          (s): s is { key: string; value: unknown } => typeof s.key === 'string' && s.key.length > 0,
        ),
      },
      headers,
    )

    if (result.success && result.tenant) {
      context.header('x-tenant-id', result.tenant.id)
      context.header('x-tenant-slug', result.tenant.slug)
    }

    return result.response
  }

  @Get('/admin-only')
  @Roles(RoleBit.ADMIN)
  async adminOnly(@ContextParam() _context: Context) {
    return { ok: true }
  }

  @Get('/*')
  async passthroughGet(@ContextParam() context: Context) {
    return await this.auth.handler(context)
  }

  @Post('/*')
  async passthroughPost(@ContextParam() context: Context) {
    return await this.auth.handler(context)
  }

  private buildTenantAwareHeaders(context: Context): Headers {
    const headers = new Headers(context.req.raw.headers)
    const tenantContext = getTenantContext()
    if (tenantContext?.tenant?.id) {
      headers.set('x-tenant-id', tenantContext.tenant.id)
      if (tenantContext.tenant.slug) {
        headers.set('x-tenant-slug', tenantContext.tenant.slug)
      }
    }
    return headers
  }

  private normalizeCallbackUrl(url?: string | null): string | undefined {
    if (!url) {
      return undefined
    }
    const trimmed = url.trim()
    if (!trimmed) {
      return undefined
    }

    try {
      const parsed = new URL(trimmed)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '回调地址必须使用 http 或 https 协议' })
      }
      return parsed.toString()
    } catch (error) {
      if (error instanceof BizException) {
        throw error
      }
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '回调地址格式不正确' })
    }
  }

  private serializeSocialAccount(account: {
    id: string
    providerId: string
    accountId: string
    createdAt: Date | string
    updatedAt: Date | string
    scopes?: string[]
  }): SocialAccountRecord {
    return {
      id: account.id,
      providerId: account.providerId,
      accountId: account.accountId,
      createdAt: this.toIsoString(account.createdAt),
      updatedAt: this.toIsoString(account.updatedAt),
      scopes: Array.isArray(account.scopes) ? account.scopes : [],
    }
  }

  private toIsoString(value: Date | string): string {
    if (value instanceof Date) {
      return value.toISOString()
    }
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toISOString()
  }
}
