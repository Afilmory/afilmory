import { authUsers, tenantMemberships, tenants } from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { SystemSettingService } from '@core/modules/configuration/system-setting/system-setting.service'
import { ContentReportCreatedEvent } from '@core/modules/platform/user-safety/events/content-report-created.event'
import { createLogger } from '@tsuki-hono/common'
import { OnEvent } from '@tsuki-hono/event-emitter'
import { and, eq, or } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { MailService, TEMPLATES } from '../mail.service'

@injectable()
export class ContentReportNotificationListener {
  private readonly logger = createLogger('ContentReportNotificationListener')

  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly mailService: MailService,
    private readonly systemSettings: SystemSettingService,
  ) {}

  @OnEvent('content.report.created')
  async handle(event: ContentReportCreatedEvent) {
    try {
      await this.sendNotifications(event)
    }
    catch (error) {
      this.logger.error('Failed to notify developers about a content report', error)
    }
  }

  private async sendNotifications(event: ContentReportCreatedEvent) {
    const db = this.dbAccessor.get()
    const [settings, [tenant], [reporter], [reported], tenantAdmins, platformAdmins] = await Promise.all([
      this.systemSettings.getSettings(),
      db.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, event.tenantId)).limit(1),
      db.select({ name: authUsers.name }).from(authUsers).where(eq(authUsers.id, event.reporterUserId)).limit(1),
      db.select({ name: authUsers.name }).from(authUsers).where(eq(authUsers.id, event.reportedUserId)).limit(1),
      db
        .select({ id: authUsers.id, email: authUsers.email })
        .from(authUsers)
        .innerJoin(tenantMemberships, eq(tenantMemberships.userId, authUsers.id))
        .where(
          and(
            eq(tenantMemberships.tenantId, event.tenantId),
            eq(tenantMemberships.status, 'active'),
            or(eq(tenantMemberships.role, 'owner'), eq(tenantMemberships.role, 'admin')),
          ),
        ),
      db.select({ id: authUsers.id, email: authUsers.email }).from(authUsers).where(eq(authUsers.role, 'superadmin')),
    ])

    const recipients = new Map<string, string>()
    for (const user of [...platformAdmins, ...tenantAdmins]) {
      if (user.id !== event.reportedUserId && user.email) {
        recipients.set(user.email, user.id)
      }
    }

    const host = tenant?.slug ? `${tenant.slug}.${settings.baseDomain}` : settings.baseDomain
    const photoUrl = `https://${host}/photos/${event.photoId}`
    for (const email of recipients.keys()) {
      await this.mailService.sendTemplate(
        email,
        'Content report requires review',
        TEMPLATES.contentReportNotification,
        {
          commentId: event.commentId,
          content: event.contentSnapshot,
          details: event.details,
          photoUrl,
          reason: event.reason,
          reportedName: reported?.name ?? 'Unknown user',
          reportedUserId: event.reportedUserId,
          reporterName: reporter?.name ?? 'Unknown user',
          reporterUserId: event.reporterUserId,
        },
      )
    }
  }
}
