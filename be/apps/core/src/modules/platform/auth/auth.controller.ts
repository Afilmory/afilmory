import { TextDecoder } from 'node:util'

import { decodeGatewayState, encodeGatewayState } from '@afilmory/be-utils'
import { authUsers } from '@afilmory/db'
import { env } from '@afilmory/env'
import { DbAccessor } from '@core/database/database.provider'
import { AllowPlaceholderTenant } from '@core/decorators/allow-placeholder.decorator'
import { SkipTenantGuard } from '@core/decorators/skip-tenant.decorator'
import { BizException, ErrorCode } from '@core/errors'
import { PlatformRoles, RequireAuth, TenantRoles } from '@core/guards/roles.decorator'
import { BypassResponseTransform } from '@core/interceptors/response-transform.decorator'
import { SystemSettingService } from '@core/modules/configuration/system-setting/system-setting.service'
import { Body, ContextParam, Controller, createLogger, Get, HttpContext, Post } from '@tsuki-hono/common'
import { freshSessionMiddleware } from 'better-auth/api'
import { eq } from 'drizzle-orm'
import type { Context } from 'hono'

import { getTenantContext, isPlaceholderTenantContext } from '../tenant/tenant.context'
import type { TenantRecord } from '../tenant/tenant.types'
import { AuthProvider, MOBILE_AUTH_BROKER_SLUG } from './auth.provider'
import { AuthRegistrationService } from './auth-registration.service'
import { WorkspaceMembershipService } from './workspace-membership.service'

const logger = createLogger('AuthController')

const SOCIAL_PROVIDER_METADATA: Record<string, { name: string, icon: string }> = {
  google: {
    name: 'Google',
    icon: 'i-logos-google-icon',
  },
  github: {
    name: 'GitHub',
    icon: 'i-logos-github-icon',
  },
  apple: {
    name: 'Apple',
    icon: 'i-simple-icons-apple',
  },
}

const PROVIDER_ID_SEPARATOR_PATTERN = /[-_]/g
const PROVIDER_ID_WORD_START_PATTERN = /\b\w/g

function resolveSocialProviderMetadata(id: string): { name: string, icon: string } {
  const metadata = SOCIAL_PROVIDER_METADATA[id]
  if (metadata) {
    return metadata
  }
  const formattedId = id
    .replaceAll(PROVIDER_ID_SEPARATOR_PATTERN, ' ')
    .replaceAll(PROVIDER_ID_WORD_START_PATTERN, match => match.toUpperCase())
  return {
    name: formattedId.trim() || id,
    icon: 'i-mingcute-earth-2-line',
  }
}

function buildProviderResponse(providerIds: readonly string[]) {
  return providerIds.map((id) => {
    const metadata = resolveSocialProviderMetadata(id)
    return {
      id,
      name: metadata.name,
      icon: metadata.icon,
      callbackPath: `/api/auth/callback/${id}`,
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
  settings?: Array<{ key?: string, value?: unknown }>
  useSessionAccount?: boolean
}

type SocialSignInRequest = {
  provider: string
  requestSignUp?: boolean
  callbackURL?: string
  errorCallbackURL?: string
  newUserCallbackURL?: string
  disableRedirect?: boolean
  additionalData?: Record<string, unknown>
}

type LinkSocialAccountRequest = {
  provider?: string
  callbackURL?: string
  errorCallbackURL?: string
  disableRedirect?: boolean
  additionalData?: Record<string, unknown>
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
    private readonly memberships: WorkspaceMembershipService,
  ) {}

  private readonly gatewayStateSecret = env.AUTH_GATEWAY_STATE_SECRET ?? env.CONFIG_ENCRYPTION_KEY

  @AllowPlaceholderTenant()
  @Get('/session')
  @SkipTenantGuard()
  async getSession(@ContextParam() _context: Context) {
    const tenantContext = getTenantContext()
    const authContext = HttpContext.getValue('auth')

    if (!authContext?.user || !authContext.session) {
      return null
    }

    const membershipRecords = await this.memberships.listForUser(authContext.user.id)
    const activeTenantId = (authContext.session as { activeTenantId?: string | null }).activeTenantId ?? null
    const activeMembership = membershipRecords.find(
      ({ status, workspace }) => status === 'active' && workspace.id === activeTenantId,
    )
    const requestedMembership = tenantContext
      ? (membershipRecords.find(({ workspace }) => workspace.id === tenantContext.tenant.id) ?? null)
      : null

    return {
      user: authContext.user,
      session: authContext.session,
      activeWorkspace: activeMembership?.workspace ?? null,
      requestedWorkspace: tenantContext
        ? {
            isPlaceholder: tenantContext.isPlaceholder,
            requestedSlug: tenantContext.requestedSlug,
            ...tenantContext.tenant,
          }
        : null,
      requestedMembership: requestedMembership
        ? {
            id: requestedMembership.id,
            role: requestedMembership.role,
            status: requestedMembership.status,
          }
        : null,
      memberships: membershipRecords,
    }
  }

  @AllowPlaceholderTenant()
  @Get('/workspaces')
  @RequireAuth()
  @SkipTenantGuard()
  async listWorkspaces() {
    const authContext = HttpContext.getValue('auth')
    if (!authContext?.user) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED)
    }

    return { memberships: await this.memberships.listActiveForUser(authContext.user.id) }
  }

  @AllowPlaceholderTenant()
  @Post('/workspaces/switch')
  @RequireAuth()
  @SkipTenantGuard()
  async switchWorkspace(@Body() body: { tenantId?: string }) {
    const tenantId = body?.tenantId?.trim()
    if (!tenantId) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: 'A workspace ID is required.' })
    }

    const authContext = HttpContext.getValue('auth')
    if (!authContext?.user || !authContext.session) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED)
    }

    const membership = await this.memberships.switchActiveWorkspace({
      sessionId: authContext.session.id,
      userId: authContext.user.id,
      tenantId,
    })

    return { activeWorkspace: membership.workspace, membership }
  }

  @AllowPlaceholderTenant()
  @Post('/sign-out')
  @SkipTenantGuard()
  async signOut(@ContextParam() context: Context) {
    const auth = await this.auth.getAuth()
    const { headers } = context.req.raw
    return await auth.api.signOut({ headers, asResponse: true })
  }

  @AllowPlaceholderTenant()
  @Get('/social/providers')
  @BypassResponseTransform()
  @SkipTenantGuard()
  async getSocialProviders() {
    return { providers: buildProviderResponse(await this.auth.getWebProviderIds()) }
  }

  @AllowPlaceholderTenant()
  @Get('/social/accounts')
  @RequireAuth()
  @SkipTenantGuard()
  async getSocialAccounts(@ContextParam() context: Context) {
    const auth = await this.auth.getAuth()
    const { headers } = context.req.raw
    const accounts = await auth.api.listUserAccounts({ headers })
    const enabledProviders = new Set(await this.auth.getEnabledProviderIds())
    return {
      accounts: accounts
        .filter(account => account.providerId !== 'credential' && enabledProviders.has(account.providerId))
        .map(account => this.serializeSocialAccount(account)),
    }
  }

  @AllowPlaceholderTenant()
  @Post('/social/link')
  @RequireAuth()
  @SkipTenantGuard()
  async linkSocialAccount(@ContextParam() context: Context, @Body() body: LinkSocialAccountRequest) {
    return await this.handleLinkSocialAccount(context, body)
  }

  // Compatibility for Better Auth client default path
  @AllowPlaceholderTenant()
  @Post('/link-social')
  @RequireAuth()
  @SkipTenantGuard()
  async linkSocialAccountCompat(@ContextParam() context: Context, @Body() body: LinkSocialAccountRequest) {
    return await this.handleLinkSocialAccount(context, body)
  }

  private async handleLinkSocialAccount(context: Context, body: LinkSocialAccountRequest) {
    const provider = body?.provider?.trim()
    if (!provider) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '缺少 OAuth Provider 参数' })
    }

    if (!(await this.auth.isProviderEnabled(provider))) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '当前未启用该 OAuth Provider' })
    }

    const { headers } = context.req.raw
    const callbackURL = this.normalizeCallbackUrl(body?.callbackURL)
    const errorCallbackURL = this.normalizeCallbackUrl(body?.errorCallbackURL)

    const auth = await this.auth.getAuth()
    const tenantSlug = getTenantContext()?.requestedSlug ?? null

    const response = await auth.api.linkSocialAccount({
      headers,
      body: {
        provider,
        requestSignUp: false,
        disableRedirect: body?.disableRedirect ?? true,
        ...(callbackURL ? { callbackURL } : {}),
        ...(errorCallbackURL ? { errorCallbackURL } : {}),
        additionalData: {
          ...body?.additionalData,
          tenantSlug,
        },
      },
      asResponse: true,
    })

    return await this.rewriteOAuthState(response, tenantSlug)
  }

  @AllowPlaceholderTenant()
  @Post('/social/unlink')
  @RequireAuth()
  @SkipTenantGuard()
  async unlinkSocialAccount(@ContextParam() context: Context, @Body() body: UnlinkSocialAccountRequest) {
    const providerId = body?.providerId?.trim()
    if (!providerId) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '缺少 OAuth Provider 参数' })
    }

    const { headers } = context.req.raw
    const auth = await this.auth.getAuth()
    const enabledProviders = new Set(await this.auth.getEnabledProviderIds())
    const allAccounts = await auth.api.listUserAccounts({ headers })
    const linkedProviderAccounts = allAccounts.filter(
      account => account.providerId !== 'credential' && enabledProviders.has(account.providerId),
    )
    const hasTargetAccount = linkedProviderAccounts.some(account => account.providerId === providerId)
    if (hasTargetAccount && linkedProviderAccounts.length <= 1) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '至少需要保留一个已绑定的 OAuth Provider' })
    }

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

  @Get('/permissions/dashboard')
  @TenantRoles('admin')
  checkDashboardPermission() {
    return { allowed: true }
  }

  @Get('/permissions/superadmin')
  @PlatformRoles('superadmin')
  checkSuperAdminPermission() {
    return { allowed: true }
  }

  @AllowPlaceholderTenant()
  @SkipTenantGuard()
  @Post('/sign-in/email')
  async signInEmail(@ContextParam() context: Context, @Body() body: { email: string, password: string }) {
    const email = body.email.trim().toLowerCase()
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
    const { headers } = context.req.raw
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

  // SkipTenantGuard: the mobile login broker host resolves to no tenant at all,
  // and AllowPlaceholderTenant alone cannot rescue a missing tenant context.
  @AllowPlaceholderTenant()
  @SkipTenantGuard()
  @Post('/social')
  async signInSocial(@ContextParam() context: Context, @Body() body: SocialSignInRequest) {
    return await this.handleSocialSignIn(context, body)
  }

  // Compatibility for Better Auth client default path
  @AllowPlaceholderTenant()
  @SkipTenantGuard()
  @Post('/sign-in/social')
  async signInSocialCompat(@ContextParam() context: Context, @Body() body: SocialSignInRequest) {
    return await this.handleSocialSignIn(context, body)
  }

  private async handleSocialSignIn(context: Context, body: SocialSignInRequest) {
    const provider = body?.provider?.trim()
    if (!provider) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '缺少 OAuth Provider 参数' })
    }

    const { headers } = context.req.raw
    const tenantContext = getTenantContext()
    let tenantSlug = tenantContext?.requestedSlug ?? tenantContext?.tenant?.slug ?? null
    if (!tenantSlug && (await this.auth.isBrokerRequest())) {
      // The broker host has no tenant context; without this marker the gateway
      // would bounce the OAuth callback to the bare base domain and the broker
      // instance would never see it.
      tenantSlug = MOBILE_AUTH_BROKER_SLUG
    }

    // Identity registration is global and does not create a workspace membership.
    const shouldAllowSignUp = body.requestSignUp ?? true

    const auth = await this.auth.getAuth()
    const response = await auth.api.signInSocial({
      body: {
        ...body,
        provider,
        requestSignUp: shouldAllowSignUp,
        additionalData: {
          ...body.additionalData,
          tenantSlug,
        },
      },
      headers,
      asResponse: true,
    })

    return await this.rewriteOAuthState(response, tenantSlug)
  }

  @SkipTenantGuard()
  @AllowPlaceholderTenant()
  @Post('/sign-up/email')
  async signUpEmail(@ContextParam() context: Context, @Body() body: TenantSignUpRequest) {
    const useSessionAccount = body?.useSessionAccount ?? false

    if (!body?.account && !useSessionAccount) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '缺少注册账号信息' })
    }

    const tenantContext = getTenantContext()
    const isPlaceholderTenant = isPlaceholderTenantContext(tenantContext)
    if ((!tenantContext || isPlaceholderTenant) && !body.tenant) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '缺少租户信息' })
    }
    if (tenantContext && !isPlaceholderTenant && useSessionAccount) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '当前操作不支持使用已登录账号' })
    }

    const { headers } = context.req.raw

    const result = await this.registration.registerTenant(
      {
        account: body.account
          ? {
              email: body.account.email ?? '',
              password: body.account.password ?? '',
              name: body.account.name ?? '',
            }
          : undefined,
        tenant: body.tenant
          ? {
              name: body.tenant.name ?? '',
              slug: body.tenant.slug ?? null,
            }
          : undefined,
        settings: body.settings?.filter(
          (s): s is { key: string, value: unknown } => typeof s.key === 'string' && s.key.length > 0,
        ),
        useSessionAccount,
      },
      headers,
    )

    if (result.success && result.tenant) {
      return await this.attachTenantMetadata(result.response, result.tenant)
    }

    return result.response
  }

  @Get('/admin-only')
  @TenantRoles('admin')
  async adminOnly(@ContextParam() _context: Context) {
    return { ok: true }
  }

  @AllowPlaceholderTenant()
  @SkipTenantGuard()
  @Get('/callback/*')
  async callback(@ContextParam() context: Context) {
    const reqUrl = new URL(context.req.url)

    let didRewriteState = false
    let didRewriteHost = false
    const wrappedState = reqUrl.searchParams.get('state')
    let tenantSlugFromState: string | null = null
    if (this.gatewayStateSecret && wrappedState) {
      const decoded = decodeGatewayState(wrappedState, { secret: this.gatewayStateSecret })
      if (decoded?.innerState) {
        reqUrl.searchParams.set('gatewayState', wrappedState)
        reqUrl.searchParams.set('state', decoded.innerState)
        didRewriteState = decoded.innerState !== wrappedState
        tenantSlugFromState = decoded.tenantSlug ?? null
      }
    }

    if (tenantSlugFromState) {
      const { hostname } = reqUrl
      if (!hostname.startsWith(`${tenantSlugFromState}.`)) {
        reqUrl.hostname = `${tenantSlugFromState}.${hostname}`
        didRewriteHost = true
      }
    }

    const tenantSlug = reqUrl.searchParams.get('tenantSlug')

    if (tenantSlug) {
      reqUrl.hostname = `${tenantSlug}.${reqUrl.hostname}`
      reqUrl.searchParams.delete('tenantSlug')

      return context.redirect(reqUrl.toString(), 302)
    }

    if (didRewriteState || didRewriteHost) {
      return context.redirect(reqUrl.toString(), 302)
    }

    return await this.auth.handler(context)
  }

  /**
   * Apple returns its web authorization response with `response_mode=form_post`.
   * The gateway state therefore has to be unwrapped in the request body instead
   * of by issuing a redirect, which would discard the one-time authorization code.
   */
  @AllowPlaceholderTenant()
  @SkipTenantGuard()
  @Post('/callback/*')
  async callbackPost(@ContextParam() context: Context) {
    const request = context.req.raw
    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.includes('application/x-www-form-urlencoded') || !this.gatewayStateSecret) {
      return await this.auth.handler(context)
    }

    const formData = await request.clone().formData()
    const wrappedState = formData.get('state')
    if (typeof wrappedState !== 'string') {
      return await this.auth.handler(context)
    }
    const decoded = decodeGatewayState(wrappedState, { secret: this.gatewayStateSecret })
    if (!decoded?.innerState) {
      return await this.auth.handler(context)
    }

    const body = new URLSearchParams()
    for (const [key, value] of formData.entries()) {
      if (typeof value === 'string') {
        body.append(key, key === 'state' ? decoded.innerState : value)
      }
    }
    body.append('gatewayState', wrappedState)

    const headers = new Headers(request.headers)
    headers.delete('content-length')
    return await this.auth.handleRequest(
      new Request(request.url, {
        body,
        headers,
        method: request.method,
      }),
    )
  }

  @AllowPlaceholderTenant()
  @SkipTenantGuard()
  @BypassResponseTransform()
  @Get('/*')
  async passthroughGet(@ContextParam() context: Context) {
    return await this.auth.handler(context)
  }

  @AllowPlaceholderTenant()
  @SkipTenantGuard()
  @BypassResponseTransform()
  @Post('/*')
  async passthroughPost(@ContextParam() context: Context) {
    return await this.auth.handler(context)
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
    }
    catch (error) {
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

  private async attachTenantMetadata(source: Response, tenant: TenantRecord): Promise<Response> {
    const headers = new Headers(source.headers)
    headers.delete('content-length')

    let payload: unknown = null
    let isJson = false
    let text: string | null = null

    try {
      const buffer = await source.arrayBuffer()
      if (buffer.byteLength > 0) {
        text = new TextDecoder().decode(buffer)
      }
    }
    catch {
      text = null
    }

    if (text && text.length > 0) {
      try {
        payload = JSON.parse(text)
        isJson = true
      }
      catch {
        payload = text
      }
    }

    const tenantPayload = {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
    }

    const responseBody
      = isJson && payload && typeof payload === 'object' && !Array.isArray(payload)
        ? {
            ...(payload as Record<string, unknown>),
            tenant: tenantPayload,
          }
        : {
            tenant: tenantPayload,
            data: payload,
          }

    headers.set('content-type', 'application/json; charset=utf-8')

    return new Response(JSON.stringify(responseBody), {
      status: source.status,
      statusText: source.statusText,
      headers,
    })
  }

  /**
   * Wraps the Better Auth `state` parameter with tenant metadata so the OAuth gateway
   * can route callbacks without dynamic redirect URIs. Preserves cookies/headers from
   * the upstream Better Auth response.
   */
  private async rewriteOAuthState(response: Response, tenantSlug: string | null): Promise<Response> {
    if (!this.gatewayStateSecret) {
      return response
    }

    // Better Auth's signInSocial can return a `location` header and a JSON body
    // with a `url` field on the *same* response (e.g. when the client doesn't
    // pass disableRedirect). Both carry the OAuth authorize URL independently,
    // so both need the state wrapped or the client SDK falls back to whichever
    // one didn't get rewritten.
    const headers = new Headers()
    response.headers.forEach((value, key) => {
      headers.append(key, value)
    })

    let bodyChanged = false
    let body: BodyInit | null = response.body

    const location = response.headers.get('location')
    if (location) {
      const wrappedLocation = this.wrapGatewayState(location, tenantSlug)
      if (wrappedLocation !== location) {
        headers.set('location', wrappedLocation)
      }
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const clone = response.clone()
      let payload: unknown
      try {
        payload = await clone.json()
      }
      catch {
        payload = null
      }

      if (payload && typeof payload === 'object') {
        const payloadRecord = payload as Record<string, unknown>
        const url = typeof payloadRecord.url === 'string' ? payloadRecord.url : null
        if (url) {
          const wrappedUrl = this.wrapGatewayState(url, tenantSlug)
          if (wrappedUrl !== url) {
            headers.set('content-type', 'application/json; charset=utf-8')
            body = JSON.stringify({ ...payloadRecord, url: wrappedUrl })
            bodyChanged = true
          }
        }
      }
    }

    if (!bodyChanged && headers.get('location') === location) {
      return response
    }

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }

  private wrapGatewayState(url: string, tenantSlug: string | null): string {
    if (!this.gatewayStateSecret) {
      return url
    }

    try {
      const parsed = new URL(url)
      const state = parsed.searchParams.get('state')
      if (!state) {
        logger.error(`[AuthController] No state param found on OAuth redirect url=${url}, skipping gateway wrap`)
        return url
      }

      const wrapped = encodeGatewayState({
        secret: this.gatewayStateSecret,
        tenantSlug,
        innerState: state,
      })
      parsed.searchParams.set('state', wrapped)
      return parsed.toString()
    }
    catch (error) {
      logger.error(`[AuthController] Failed to wrap OAuth gateway state for url=${url}`, error)
      return url
    }
  }
}
