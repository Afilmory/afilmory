import { authUsers, comments, contentReports, gallerySubscriptions, tenantMemberships, userBlocks } from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { BizException, ErrorCode } from '@core/errors'
import { logger } from '@core/helpers/logger.helper'
import { EventEmitterService } from '@tsuki-hono/event-emitter'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { ContentReportCreatedEvent } from './events/content-report-created.event'
import { canTargetUser } from './user-safety.policy'
import type { CommentReportReason } from './user-safety.types'

interface ReportInput {
  details?: string
  reason: CommentReportReason
}

interface CommentSafetyTarget {
  content: string
  createdAt: string
  id: string
  photoId: string
  userId: string
}

@injectable()
export class UserSafetyService {
  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly eventEmitter: EventEmitterService,
  ) {}

  async reportComment(tenantId: string, reporterUserId: string, commentId: string, input: ReportInput) {
    const db = this.dbAccessor.get()
    const comment = await this.findComment(tenantId, commentId)
    this.ensureCanTarget(reporterUserId, comment.userId)

    const [created] = await db
      .insert(contentReports)
      .values({
        tenantId,
        commentId: comment.id,
        reporterUserId,
        reportedUserId: comment.userId,
        reason: input.reason,
        details: input.details || null,
        contentSnapshot: comment.content,
      })
      .onConflictDoNothing()
      .returning({
        id: contentReports.id,
        createdAt: contentReports.createdAt,
      })

    const report = created ?? (await this.findExistingReport(reporterUserId, comment.id))
    if (!report) {
      throw new BizException(ErrorCode.COMMON_CONFLICT, { message: 'The report could not be recorded.' })
    }

    if (created) {
      this.emitReportCreated(tenantId, reporterUserId, comment, input, created)
    }

    return {
      reportId: report.id,
      reported: true,
      status: 'pending' as const,
    }
  }

  async blockCommentAuthor(tenantId: string, blockerUserId: string, commentId: string, input: ReportInput) {
    const db = this.dbAccessor.get()
    const comment = await this.findComment(tenantId, commentId)
    this.ensureCanTarget(blockerUserId, comment.userId)

    const result = await db.transaction(async (tx) => {
      const [createdReport] = await tx
        .insert(contentReports)
        .values({
          tenantId,
          commentId: comment.id,
          reporterUserId: blockerUserId,
          reportedUserId: comment.userId,
          reason: input.reason,
          details: input.details || null,
          contentSnapshot: comment.content,
        })
        .onConflictDoNothing()
        .returning({
          id: contentReports.id,
          createdAt: contentReports.createdAt,
        })

      await tx
        .insert(userBlocks)
        .values({
          blockerUserId,
          blockedUserId: comment.userId,
        })
        .onConflictDoNothing()

      const ownedTenants = await tx
        .select({ tenantId: tenantMemberships.tenantId })
        .from(tenantMemberships)
        .where(
          and(
            eq(tenantMemberships.userId, comment.userId),
            eq(tenantMemberships.role, 'owner'),
            eq(tenantMemberships.status, 'active'),
          ),
        )

      const tenantIds = ownedTenants.map(item => item.tenantId)
      if (tenantIds.length > 0) {
        await tx
          .delete(gallerySubscriptions)
          .where(
            and(
              eq(gallerySubscriptions.subscriberUserId, blockerUserId),
              inArray(gallerySubscriptions.targetTenantId, tenantIds),
            ),
          )
      }

      return { createdReport }
    })

    if (result.createdReport) {
      this.emitReportCreated(tenantId, blockerUserId, comment, input, result.createdReport)
    }

    return {
      blocked: true,
      blockedUserId: comment.userId,
      reported: true,
    }
  }

  async blockedUserIds(blockerUserId: string): Promise<string[]> {
    const db = this.dbAccessor.get()
    const rows = await db
      .select({ userId: userBlocks.blockedUserId })
      .from(userBlocks)
      .where(eq(userBlocks.blockerUserId, blockerUserId))
    return rows.map(row => row.userId)
  }

  async blockedOwnerTenantIds(blockerUserId: string): Promise<string[]> {
    const db = this.dbAccessor.get()
    const rows = await db
      .select({ tenantId: tenantMemberships.tenantId })
      .from(userBlocks)
      .innerJoin(
        tenantMemberships,
        and(
          eq(tenantMemberships.userId, userBlocks.blockedUserId),
          eq(tenantMemberships.role, 'owner'),
          eq(tenantMemberships.status, 'active'),
        ),
      )
      .where(eq(userBlocks.blockerUserId, blockerUserId))
    return [...new Set(rows.map(row => row.tenantId))]
  }

  async listBlockedUsers(blockerUserId: string) {
    const db = this.dbAccessor.get()
    return await db
      .select({
        id: authUsers.id,
        name: authUsers.name,
        image: authUsers.image,
        blockedAt: userBlocks.createdAt,
      })
      .from(userBlocks)
      .innerJoin(authUsers, eq(authUsers.id, userBlocks.blockedUserId))
      .where(eq(userBlocks.blockerUserId, blockerUserId))
  }

  async unblockUser(blockerUserId: string, blockedUserId: string): Promise<boolean> {
    const db = this.dbAccessor.get()
    const deleted = await db
      .delete(userBlocks)
      .where(and(eq(userBlocks.blockerUserId, blockerUserId), eq(userBlocks.blockedUserId, blockedUserId)))
      .returning({ id: userBlocks.id })
    return deleted.length > 0
  }

  private ensureCanTarget(actorUserId: string, targetUserId: string) {
    if (!canTargetUser(actorUserId, targetUserId)) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: 'You cannot report or block yourself.' })
    }
  }

  private async findComment(tenantId: string, commentId: string): Promise<CommentSafetyTarget> {
    const db = this.dbAccessor.get()
    const [comment] = await db
      .select({
        id: comments.id,
        photoId: comments.photoId,
        userId: comments.userId,
        content: comments.content,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .where(and(eq(comments.id, commentId), eq(comments.tenantId, tenantId), isNull(comments.deletedAt)))
      .limit(1)
    if (!comment) {
      throw new BizException(ErrorCode.COMMON_NOT_FOUND, { message: 'Comment not found.' })
    }
    return comment
  }

  private async findExistingReport(reporterUserId: string, commentId: string) {
    const db = this.dbAccessor.get()
    const [report] = await db
      .select({
        id: contentReports.id,
        createdAt: contentReports.createdAt,
      })
      .from(contentReports)
      .where(and(eq(contentReports.reporterUserId, reporterUserId), eq(contentReports.commentId, commentId)))
      .limit(1)
    return report
  }

  private emitReportCreated(
    tenantId: string,
    reporterUserId: string,
    comment: CommentSafetyTarget,
    input: ReportInput,
    report: { createdAt: string, id: string },
  ) {
    this.eventEmitter
      .emit(
        'content.report.created',
        new ContentReportCreatedEvent(
          report.id,
          tenantId,
          comment.photoId,
          comment.id,
          reporterUserId,
          comment.userId,
          input.reason,
          input.details || null,
          comment.content,
          report.createdAt,
        ),
      )
      .catch((error) => {
        logger.error('Failed to emit content.report.created event', error)
      })
  }
}
