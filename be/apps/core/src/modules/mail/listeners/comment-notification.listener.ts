import { authUsers, comments } from '@afilmory/db'
import { createLogger, OnEvent } from '@tsuki/framework'
import { DbAccessor } from 'core/database/database.provider'
import { SystemSettingService } from 'core/modules/configuration/system-setting/system-setting.service'
import { CommentCreatedEvent } from 'core/modules/content/comment/events/comment-created.event'
import { and, eq, or } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { MailService, TEMPLATES } from '../mail.service'

@injectable()
export class CommentNotificationListener {
  private readonly logger = createLogger('CommentNotificationListener')
  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly mailService: MailService,
    private readonly systemSettingService: SystemSettingService,
  ) {
    this.logger.info('CommentNotificationListener initialized')
  }

  @OnEvent('comment.created')
  async handleCommentCreated(event: CommentCreatedEvent) {
    try {
      this.logger.verbose('Sending notifications for comment.created event', event)
      await this.sendNotifications(event)
    } catch (error) {
      this.logger.error('Failed to handle comment.created event', error)
    }
  }

  private async sendNotifications(event: CommentCreatedEvent) {
    const db = this.dbAccessor.get()
    const settings = await this.systemSettingService.getSettings()
    const { baseDomain } = settings
    // Assume https for now, or we could make protocol configurable if needed.
    // But typically production runs on https.
    const photoUrl = `https://${baseDomain}/photos/${event.photoId}`

    const sentEmails = new Set<string>()

    // Fetch commenter info
    const [commenter] = await db
      .select({
        id: authUsers.id,
        name: authUsers.name,
      })
      .from(authUsers)
      .where(eq(authUsers.id, event.userId))
      .limit(1)

    if (!commenter) {
      this.logger.warn(`Commenter ${event.userId} not found for notification`)
      return
    }

    // 1. Notify parent comment author (Reply)
    if (event.parentId) {
      const [parent] = await db
        .select({
          id: comments.id,
          userId: comments.userId,
        })
        .from(comments)
        .where(eq(comments.id, event.parentId))
        .limit(1)

      if (parent) {
        const [parentAuthor] = await db
          .select({
            id: authUsers.id,
            name: authUsers.name,
            email: authUsers.email,
          })
          .from(authUsers)
          .where(eq(authUsers.id, parent.userId))
          .limit(1)

        if (parentAuthor && parentAuthor.id !== event.userId && parentAuthor.email) {
          await this.mailService.sendTemplate(
            parentAuthor.email,
            'New reply to your comment',
            TEMPLATES.commentNotification,
            {
              userName: commenter.name,
              content: event.content,
              photoUrl,
              replyToUser: parentAuthor.name,
              photoId: event.photoId,
            },
          )
          sentEmails.add(parentAuthor.email)
        }
      }
    }

    // 2. Notify Tenant Admins (Owner)
    const admins = await db
      .select({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
      })
      .from(authUsers)
      .where(
        and(eq(authUsers.tenantId, event.tenantId), or(eq(authUsers.role, 'admin'), eq(authUsers.role, 'superadmin'))),
      )

    for (const admin of admins) {
      if (admin.id === event.userId) continue
      if (sentEmails.has(admin.email)) continue

      await this.mailService.sendTemplate(admin.email, 'New comment on your photo', TEMPLATES.commentNotification, {
        userName: commenter.name,
        content: event.content,
        photoUrl,
        replyToUser: undefined,
        photoId: event.photoId,
      })
      sentEmails.add(admin.email)
    }
  }
}
