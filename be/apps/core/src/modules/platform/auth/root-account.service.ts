import { randomBytes } from 'node:crypto'

import { authUsers } from '@afilmory/db'
import { env } from '@afilmory/env'
import { createLogger } from '@tsuki/framework'
import { DbAccessor } from 'core/database/database.provider'
import { STATIC_DASHBOARD_BASENAME } from 'core/modules/infrastructure/static-web/static-dashboard.service'
import { ROOT_TENANT_SLUG } from 'core/modules/platform/tenant/tenant.constants'
import { eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { AuthProvider } from './auth.provider'

const log = createLogger('RootAccount')

@injectable()
export class RootAccountProvisioner {
  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly authProvider: AuthProvider,
  ) {}

  async ensureRootAccount(rootTenantId: string): Promise<void> {
    const db = this.dbAccessor.get()
    const email = env.DEFAULT_SUPERADMIN_EMAIL
    const username = env.DEFAULT_SUPERADMIN_USERNAME

    const [existing] = await db
      .select({ id: authUsers.id, role: authUsers.role, tenantId: authUsers.tenantId })
      .from(authUsers)
      .where(eq(authUsers.email, email))
      .limit(1)

    if (existing) {
      if (existing.role !== 'superadmin' || existing.tenantId !== rootTenantId) {
        await db
          .update(authUsers)
          .set({
            role: 'superadmin',
            tenantId: rootTenantId,
            name: username,
            username,
            displayUsername: username,
          })
          .where(eq(authUsers.id, existing.id))

        const changeSummary =
          existing.role !== 'superadmin'
            ? 'promoted to superadmin'
            : existing.tenantId !== rootTenantId
              ? 'linked to root tenant'
              : 'updated'
        log.info(`Existing account ${email} ${changeSummary}`)
      } else {
        log.info('Root account already exists, skipping provisioning')
      }
      return
    }

    const password = randomBytes(16).toString('base64url')

    try {
      const auth = await this.authProvider.getAuthForTenant({ id: rootTenantId, slug: ROOT_TENANT_SLUG })
      const result = await auth.api.signUpEmail({
        body: {
          email,
          password,
          name: username,
        },
      })

      const userId = result.user.id

      await db
        .update(authUsers)
        .set({
          role: 'superadmin',
          tenantId: rootTenantId,
          name: username,
          username,
          displayUsername: username,
        })
        .where(eq(authUsers.id, userId))

      this.printRootInstructions(email, username, password)
    } catch (error) {
      log.error('Failed to provision root account', error)
    }
  }

  private printRootInstructions(email: string, username: string, password: string): void {
    const urls = this.buildDashboardUrls()
    const lines = [
      '',
      '============================================================',
      'Root dashboard access provisioned.',
      `  Dashboard URL: ${urls.shift()}/root-login`,
      ...(urls.length > 0 ? urls.map((url) => `  Alternate URL: ${url}`) : []),
      `  Email: ${email}`,
      `  Username: ${username}`,
      `  Password: ${password}`,
      '============================================================',
      '',
    ]
    lines.forEach((line) => process.stdout.write(`${line}\n`))
  }

  private buildDashboardUrls(): string[] {
    const port = env.PORT ?? 3000
    const primaryHost = 'localhost'
    const configuredHost = env.HOSTNAME?.trim() ?? ''

    const hosts = new Set<string>([primaryHost])
    if (configuredHost && configuredHost !== '0.0.0.0' && configuredHost !== primaryHost) {
      hosts.add(configuredHost)
    }

    return Array.from(hosts).map((host) => `http://${host}:${port}${STATIC_DASHBOARD_BASENAME}`)
  }
}
