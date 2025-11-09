import { randomBytes } from 'node:crypto'

import { authUsers } from '@afilmory/db'
import { env } from '@afilmory/env'
import { createLogger } from '@afilmory/framework'
import { BizException, ErrorCode } from 'core/errors'
import { eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { DbAccessor } from '../../database/database.provider'
import { AuthProvider } from '../auth/auth.provider'
import { SettingService } from '../setting/setting.service'
import { SiteSettingService } from '../site-setting/site-setting.service'
import { TenantService } from '../tenant/tenant.service'
import type { NormalizedSettingEntry, OnboardingInitDto } from './onboarding.dto'

const log = createLogger('Onboarding')

@injectable()
export class OnboardingService {
  constructor(
    private readonly db: DbAccessor,
    private readonly auth: AuthProvider,
    private readonly settings: SettingService,
    private readonly tenantService: TenantService,
    private readonly siteSettingService: SiteSettingService,
  ) {}

  async isInitialized(): Promise<boolean> {
    const db = this.db.get()
    const [user] = await db.select().from(authUsers).limit(1)
    return Boolean(user)
  }

  async getSiteSchema() {
    return await this.siteSettingService.getOnboardingUiSchema()
  }

  async initialize(
    payload: OnboardingInitDto,
  ): Promise<{ adminUserId: string; superAdminUserId: string; tenantId: string }> {
    const already = await this.isInitialized()
    if (already) {
      throw new BizException(ErrorCode.COMMON_CONFLICT, { message: 'Application already initialized' })
    }
    const db = this.db.get()

    // Create first tenant
    const tenantAggregate = await this.tenantService.createTenant({
      name: payload.tenant.name,
      slug: payload.tenant.slug,
    })

    log.info(`Created tenant ${tenantAggregate.tenant.slug} (${tenantAggregate.tenant.id})`)

    // Apply initial settings to tenant
    const entries = (payload.settings as unknown as NormalizedSettingEntry[]) ?? []
    if (entries.length > 0) {
      const entriesWithTenant = entries.map((entry) => ({
        key: entry.key,
        value: entry.value,
        options: { tenantId: tenantAggregate.tenant.id },
      })) as Parameters<SettingService['setMany']>[0]
      await this.settings.setMany(entriesWithTenant)
    }

    const auth = await this.auth.getAuth()

    // Create initial admin for this tenant
    const adminResult = await auth.api.signUpEmail({
      body: {
        email: payload.admin.email,
        password: payload.admin.password,
        name: payload.admin.name,
        // @ts-expect-error - tenantId is not part of the signUpEmail body
        tenantId: tenantAggregate.tenant.id,
      },
    })

    const adminUserId = adminResult.user.id

    await db
      .update(authUsers)
      .set({ role: 'admin', tenantId: tenantAggregate.tenant.id })
      .where(eq(authUsers.id, adminUserId))

    log.info(`Provisioned tenant admin ${adminUserId} for tenant ${tenantAggregate.tenant.slug}`)

    // Create global superadmin account
    const superPassword = this.generatePassword()
    const superEmail = env.DEFAULT_SUPERADMIN_EMAIL
    const superUsername = env.DEFAULT_SUPERADMIN_USERNAME

    const superResult = await auth.api.signUpEmail({
      body: {
        email: superEmail,
        password: superPassword,
        name: superUsername,
      },
    })

    const superAdminId = superResult.user.id

    await db
      .update(authUsers)
      .set({
        role: 'superadmin',
        tenantId: null,
        name: superUsername,
        username: superUsername,
        displayUsername: superUsername,
      })
      .where(eq(authUsers.id, superAdminId))

    log.info(`Superadmin account created: ${superUsername} (${superAdminId})`)
    process.stdout.write(
      `Superadmin credentials -> email: ${superEmail} username: ${superUsername} password: ${superPassword}\n`,
    )

    return { adminUserId, superAdminUserId: superAdminId, tenantId: tenantAggregate.tenant.id }
  }

  private generatePassword(): string {
    return randomBytes(16).toString('base64url')
  }
}
