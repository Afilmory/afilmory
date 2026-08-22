import {
  authUsers,
  commentReactions,
  comments,
  photoAssets,
  tenantDomains,
  tenantMemberships,
  tenants,
} from '@afilmory/db'
import { DEFAULT_BASE_DOMAIN } from '@afilmory/utils'
import { getClientIp } from '@core/context/http-context.helper'
import { DbAccessor } from '@core/database/database.provider'
import { BizException, ErrorCode } from '@core/errors'
import { logger } from '@core/helpers/logger.helper'
import { SystemSettingService } from '@core/modules/configuration/system-setting/system-setting.service'
import { CommentCreatedEvent } from '@core/modules/content/comment/events/comment-created.event'
import { WorkspaceMembershipService } from '@core/modules/platform/auth/workspace-membership.service'
import { requireTenantContext } from '@core/modules/platform/tenant/tenant.context'
import { UserSafetyService } from '@core/modules/platform/user-safety/user-safety.service'
import { HttpContext } from '@tsuki-hono/common'
import { EventEmitterService } from '@tsuki-hono/event-emitter'
import { and, asc, eq, gt, inArray, isNull, notInArray, or, sql } from 'drizzle-orm'
import type { Context } from 'hono'
import { inject, injectable } from 'tsyringe'

import type { CommentReactionDto, CreateCommentDto, ListAllCommentsQueryDto, ListCommentsQueryDto } from './comment.dto'
import type { CommentModerationHook, CommentModerationHookInput } from './comment.moderation'
import { COMMENT_MODERATION_HOOK } from './comment.moderation'

export interface CommentViewModel {
  id: string
  photoId: string
  parentId: string | null
  userId: string
  content: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface UserViewModel {
  id: string
  name: string
  image: string | null
  website?: string | null
}

interface AuthUser {
  id?: string
}

interface CommentResponseItem extends CommentViewModel {
  reactionCounts: Record<string, number>
  viewerReactions: string[]
}

type AuthContextValue
  = | {
    user?: AuthUser
    session?: unknown
  }
  | undefined

@injectable()
export class CommentService {
  constructor(
    private readonly dbAccessor: DbAccessor,
    @inject(COMMENT_MODERATION_HOOK) private readonly moderationHook: CommentModerationHook,
    private readonly eventEmitter: EventEmitterService,
    private readonly systemSettings: SystemSettingService,
    private readonly memberships: WorkspaceMembershipService,
    private readonly userSafety: UserSafetyService,
  ) {}

  async createComment(
    dto: CreateCommentDto,
    context: Context,
  ): Promise<{
    comments: CommentResponseItem[]
    relations: Record<string, CommentResponseItem>
    users: Record<string, UserViewModel>
  }> {
    const tenant = requireTenantContext()
    const authUser = this.getAuthUser()
    const userId = authUser?.id
    if (!userId) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED)
    }
    const db = this.dbAccessor.get()

    await this.ensurePhotoExists(tenant.tenant.id, dto.photoId)
    const parent = await this.validateParent(dto.parentId, tenant.tenant.id, dto.photoId)

    const moderationInput: CommentModerationHookInput = {
      tenantId: tenant.tenant.id,
      userId,
      photoId: dto.photoId,
      parentId: parent?.id,
      content: dto.content.trim(),
      userAgent: context.req.header('user-agent') ?? null,
      clientIp: getClientIp(),
    }
    const moderationResult = await this.moderationHook.review(moderationInput)

    if (moderationResult.action === 'reject') {
      throw new BizException(ErrorCode.COMMON_FORBIDDEN, {
        message: moderationResult.reason ?? '评论未通过审核',
      })
    }

    const status = moderationResult.action === 'flag_pending' ? 'pending' : 'approved'

    const [record] = await db
      .insert(comments)
      .values({
        tenantId: tenant.tenant.id,
        photoId: dto.photoId,
        parentId: parent?.id ?? null,
        userId,
        content: dto.content.trim(),
        status,
        userAgent: moderationInput.userAgent ?? null,
        clientIp: moderationInput.clientIp ?? null,
      })
      .returning()

    const item = this.toResponse({
      ...record,
      reactionCounts: {},
      viewerReactions: [],
    })

    // Fetch relations (parent comment if exists)
    const relations: Record<string, CommentResponseItem> = {}
    if (parent) {
      const [fullParent] = await db
        .select({
          id: comments.id,
          photoId: comments.photoId,
          parentId: comments.parentId,
          userId: comments.userId,
          content: comments.content,
          status: comments.status,
          createdAt: comments.createdAt,
          updatedAt: comments.updatedAt,
        })
        .from(comments)
        .where(eq(comments.id, parent.id))
        .limit(1)

      if (fullParent) {
        const parentReactions = await this.fetchReactionAggregations(tenant.tenant.id, [parent.id], userId)
        relations[parent.id] = this.toResponse({
          ...fullParent,
          reactionCounts: parentReactions.counts.get(parent.id) ?? {},
          viewerReactions: parentReactions.viewer.get(parent.id) ?? [],
        })
      }
    }

    // Fetch user info
    const userIds = [userId, ...Object.values(relations).map(r => r.userId)].filter(Boolean)
    const users = await this.fetchUsersWithProfiles(userIds)

    // Emit event asynchronously
    this.eventEmitter
      .emit(
        'comment.created',
        new CommentCreatedEvent(
          record.id,
          tenant.tenant.id,
          dto.photoId,
          userId,
          parent?.id ?? null,
          dto.content.trim(),
          record.createdAt,
        ),
      )
      .catch((error) => {
        logger.error('Failed to emit comment.created event', error)
      })

    return { comments: [item], relations, users }
  }

  async listComments(query: ListCommentsQueryDto): Promise<{
    comments: CommentResponseItem[]
    relations: Record<string, CommentResponseItem>
    users: Record<string, UserViewModel>
    nextCursor: string | null
  }> {
    const tenant = requireTenantContext()
    const authUser = this.getAuthUser()
    const viewerUserId = authUser?.id ?? null
    const isAdmin = viewerUserId ? await this.memberships.isWorkspaceAdmin(viewerUserId, tenant.tenant.id) : false
    const blockedUserIds = viewerUserId ? await this.userSafety.blockedUserIds(viewerUserId) : []
    const db = this.dbAccessor.get()

    const filters = [
      eq(comments.tenantId, tenant.tenant.id),
      eq(comments.photoId, query.photoId),
      isNull(comments.deletedAt),
    ]
    if (blockedUserIds.length > 0) {
      filters.push(notInArray(comments.userId, blockedUserIds))
    }

    let statusCondition
    if (isAdmin) {
      statusCondition = inArray(comments.status, ['approved', 'pending'])
    }
    else if (viewerUserId) {
      statusCondition = or(
        eq(comments.status, 'approved'),
        and(eq(comments.status, 'pending'), eq(comments.userId, viewerUserId)),
      )
    }
    else {
      statusCondition = eq(comments.status, 'approved')
    }
    filters.push(statusCondition)

    let cursorCondition
    if (query.cursor) {
      const anchor = await this.findCommentForCursor(query.cursor, tenant.tenant.id, query.photoId)
      cursorCondition = or(
        gt(comments.createdAt, anchor.createdAt),
        and(eq(comments.createdAt, anchor.createdAt), gt(comments.id, anchor.id)),
      )
    }

    const baseWhere = cursorCondition ? and(...filters, cursorCondition) : and(...filters)

    const rows = await db
      .select({
        id: comments.id,
        photoId: comments.photoId,
        parentId: comments.parentId,
        userId: comments.userId,
        content: comments.content,
        status: comments.status,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
      })
      .from(comments)
      .where(baseWhere)
      .orderBy(comments.createdAt, comments.id)
      .limit(query.limit + 1)

    const hasMore = rows.length > query.limit
    const items = rows.slice(0, query.limit)
    const commentIds = items.map(item => item.id)

    const reactions = await this.fetchReactionAggregations(tenant.tenant.id, commentIds, viewerUserId)

    const nextCursor = hasMore && items.length > 0 ? items.at(-1)!.id : null

    const commentItems = items.map(item =>
      this.toResponse({
        ...item,
        reactionCounts: reactions.counts.get(item.id) ?? {},
        viewerReactions: reactions.viewer.get(item.id) ?? [],
      }))

    // Build relations map (parentId -> parent comment)
    const relations: Record<string, CommentResponseItem> = {}
    const parentIds = [...new Set(items.filter(item => item.parentId).map(item => item.parentId!))]

    if (parentIds.length > 0) {
      const parentRows = await db
        .select({
          id: comments.id,
          photoId: comments.photoId,
          parentId: comments.parentId,
          userId: comments.userId,
          content: comments.content,
          status: comments.status,
          createdAt: comments.createdAt,
          updatedAt: comments.updatedAt,
        })
        .from(comments)
        .where(
          and(
            eq(comments.tenantId, tenant.tenant.id),
            inArray(comments.id, parentIds),
            isNull(comments.deletedAt),
            blockedUserIds.length > 0 ? notInArray(comments.userId, blockedUserIds) : undefined,
          ),
        )

      const parentReactions = await this.fetchReactionAggregations(
        tenant.tenant.id,
        parentRows.map(p => p.id),
        viewerUserId,
      )

      for (const parent of parentRows) {
        relations[parent.id] = this.toResponse({
          ...parent,
          reactionCounts: parentReactions.counts.get(parent.id) ?? {},
          viewerReactions: parentReactions.viewer.get(parent.id) ?? [],
        })
      }
    }

    // Build users map (userId -> user)
    const allUserIds = [
      ...new Set([...items.map(item => item.userId), ...Object.values(relations).map(r => r.userId)]),
    ]

    const users = await this.fetchUsersWithProfiles(allUserIds)

    return {
      comments: commentItems,
      relations,
      users,
      nextCursor,
    }
  }

  async listAllComments(query: ListAllCommentsQueryDto): Promise<{
    comments: CommentResponseItem[]
    relations: Record<string, CommentResponseItem>
    users: Record<string, UserViewModel>
    nextCursor: string | null
  }> {
    const tenant = requireTenantContext()
    const authUser = this.getAuthUser()
    const viewerUserId = authUser?.id ?? null
    const db = this.dbAccessor.get()

    const filters = [eq(comments.tenantId, tenant.tenant.id), isNull(comments.deletedAt)]

    // Filter by photoId if provided
    if (query.photoId) {
      filters.push(eq(comments.photoId, query.photoId))
    }

    // Filter by status if provided
    if (query.status) {
      filters.push(eq(comments.status, query.status))
    }

    let cursorCondition
    if (query.cursor) {
      const anchor = await this.findCommentForCursorAll(query.cursor, tenant.tenant.id)
      cursorCondition = or(
        gt(comments.createdAt, anchor.createdAt),
        and(eq(comments.createdAt, anchor.createdAt), gt(comments.id, anchor.id)),
      )
    }

    const baseWhere = cursorCondition ? and(...filters, cursorCondition) : and(...filters)

    const rows = await db
      .select({
        id: comments.id,
        photoId: comments.photoId,
        parentId: comments.parentId,
        userId: comments.userId,
        content: comments.content,
        status: comments.status,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
      })
      .from(comments)
      .where(baseWhere)
      .orderBy(comments.createdAt, comments.id)
      .limit(query.limit + 1)

    const hasMore = rows.length > query.limit
    const items = rows.slice(0, query.limit)
    const commentIds = items.map(item => item.id)

    const reactions = await this.fetchReactionAggregations(tenant.tenant.id, commentIds, viewerUserId)

    const nextCursor = hasMore && items.length > 0 ? items.at(-1)!.id : null

    const commentItems = items.map(item =>
      this.toResponse({
        ...item,
        reactionCounts: reactions.counts.get(item.id) ?? {},
        viewerReactions: reactions.viewer.get(item.id) ?? [],
      }))

    // Build relations map (parentId -> parent comment)
    const relations: Record<string, CommentResponseItem> = {}
    const parentIds = [...new Set(items.filter(item => item.parentId).map(item => item.parentId!))]

    if (parentIds.length > 0) {
      const parentRows = await db
        .select({
          id: comments.id,
          photoId: comments.photoId,
          parentId: comments.parentId,
          userId: comments.userId,
          content: comments.content,
          status: comments.status,
          createdAt: comments.createdAt,
          updatedAt: comments.updatedAt,
        })
        .from(comments)
        .where(
          and(eq(comments.tenantId, tenant.tenant.id), inArray(comments.id, parentIds), isNull(comments.deletedAt)),
        )

      const parentReactions = await this.fetchReactionAggregations(
        tenant.tenant.id,
        parentRows.map(p => p.id),
        viewerUserId,
      )

      for (const parent of parentRows) {
        relations[parent.id] = this.toResponse({
          ...parent,
          reactionCounts: parentReactions.counts.get(parent.id) ?? {},
          viewerReactions: parentReactions.viewer.get(parent.id) ?? [],
        })
      }
    }

    // Build users map (userId -> user)
    const allUserIds = [
      ...new Set([...items.map(item => item.userId), ...Object.values(relations).map(r => r.userId)]),
    ]

    const users = await this.fetchUsersWithProfiles(allUserIds)

    return {
      comments: commentItems,
      relations,
      users,
      nextCursor,
    }
  }

  async toggleReaction(commentId: string, body: CommentReactionDto): Promise<{ item: CommentResponseItem }> {
    const tenant = requireTenantContext()
    const authUser = this.getAuthUser()
    const userId = authUser?.id
    if (!userId) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED)
    }
    const db = this.dbAccessor.get()

    const comment = await this.getCommentById(commentId, tenant.tenant.id)

    const [existing] = await db
      .select({ id: commentReactions.id })
      .from(commentReactions)
      .where(
        and(
          eq(commentReactions.tenantId, tenant.tenant.id),
          eq(commentReactions.commentId, comment.id),
          eq(commentReactions.userId, userId),
          eq(commentReactions.reaction, body.reaction),
        ),
      )
      .limit(1)

    if (existing) {
      await db.delete(commentReactions).where(eq(commentReactions.id, existing.id))
    }
    else {
      await db.insert(commentReactions).values({
        tenantId: tenant.tenant.id,
        commentId: comment.id,
        userId,
        reaction: body.reaction,
      })
    }

    const aggregation = await this.fetchReactionAggregations(tenant.tenant.id, [comment.id], userId)
    const item = this.toResponse({
      ...comment,
      reactionCounts: aggregation.counts.get(comment.id) ?? {},
      viewerReactions: aggregation.viewer.get(comment.id) ?? [],
    })
    return { item }
  }

  async softDelete(commentId: string): Promise<void> {
    const tenant = requireTenantContext()
    const authUser = this.getAuthUser()
    const userId = authUser?.id
    if (!userId) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED)
    }
    const isAdmin = await this.memberships.isWorkspaceAdmin(userId, tenant.tenant.id)
    const db = this.dbAccessor.get()

    const [record] = await db
      .select({
        id: comments.id,
        tenantId: comments.tenantId,
        userId: comments.userId,
      })
      .from(comments)
      .where(and(eq(comments.id, commentId), eq(comments.tenantId, tenant.tenant.id), isNull(comments.deletedAt)))
      .limit(1)

    if (!record) {
      throw new BizException(ErrorCode.COMMON_NOT_FOUND, { message: '评论不存在' })
    }

    const { userId: authorId } = record
    const isOwner = userId === authorId

    if (!isAdmin && !isOwner) {
      throw new BizException(ErrorCode.COMMON_FORBIDDEN, { message: '无权删除该评论' })
    }

    await db
      .update(comments)
      .set({
        status: 'hidden',
        deletedAt: new Date().toISOString(),
      })
      .where(eq(comments.id, record.id))
  }

  async getCommentCount(query: { photoId: string }): Promise<{ count: number }> {
    const tenant = requireTenantContext()
    const authUser = this.getAuthUser()
    const viewerUserId = authUser?.id ?? null
    const isAdmin = viewerUserId ? await this.memberships.isWorkspaceAdmin(viewerUserId, tenant.tenant.id) : false
    const blockedUserIds = viewerUserId ? await this.userSafety.blockedUserIds(viewerUserId) : []
    const db = this.dbAccessor.get()

    const filters = [
      eq(comments.tenantId, tenant.tenant.id),
      eq(comments.photoId, query.photoId),
      isNull(comments.deletedAt),
    ]
    if (blockedUserIds.length > 0) {
      filters.push(notInArray(comments.userId, blockedUserIds))
    }

    let statusCondition
    if (isAdmin) {
      statusCondition = inArray(comments.status, ['approved', 'pending'])
    }
    else if (viewerUserId) {
      statusCondition = or(
        eq(comments.status, 'approved'),
        and(eq(comments.status, 'pending'), eq(comments.userId, viewerUserId)),
      )
    }
    else {
      statusCondition = eq(comments.status, 'approved')
    }
    filters.push(statusCondition)

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .where(and(...filters))

    return { count: Number(result?.count ?? 0) }
  }

  private getAuthUser(): AuthUser | undefined {
    const authContext = HttpContext.getValue('auth') as AuthContextValue
    return authContext?.user
  }

  private async ensurePhotoExists(tenantId: string, photoId: string): Promise<void> {
    const db = this.dbAccessor.get()
    const [photo] = await db
      .select({ id: photoAssets.id })
      .from(photoAssets)
      .where(and(eq(photoAssets.tenantId, tenantId), eq(photoAssets.photoId, photoId)))
      .limit(1)

    if (!photo) {
      throw new BizException(ErrorCode.COMMON_NOT_FOUND, { message: '照片不存在' })
    }
  }

  private async validateParent(parentId: string | undefined, tenantId: string, photoId: string) {
    if (!parentId) {
      return null
    }
    const db = this.dbAccessor.get()
    const [parent] = await db
      .select({
        id: comments.id,
        photoId: comments.photoId,
        status: comments.status,
        deletedAt: comments.deletedAt,
      })
      .from(comments)
      .where(and(eq(comments.id, parentId), eq(comments.tenantId, tenantId)))
      .limit(1)

    if (!parent) {
      throw new BizException(ErrorCode.COMMON_NOT_FOUND, { message: '引用的评论不存在' })
    }
    if (parent.photoId !== photoId) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '引用的评论不属于当前照片' })
    }
    if (parent.status === 'hidden' || parent.status === 'rejected' || parent.deletedAt) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '引用的评论不可用' })
    }

    return parent
  }

  private async getCommentById(commentId: string, tenantId: string) {
    const db = this.dbAccessor.get()
    const [comment] = await db
      .select({
        id: comments.id,
        status: comments.status,
        photoId: comments.photoId,
        parentId: comments.parentId,
        userId: comments.userId,
        content: comments.content,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
        deletedAt: comments.deletedAt,
      })
      .from(comments)
      .where(and(eq(comments.id, commentId), eq(comments.tenantId, tenantId), isNull(comments.deletedAt)))
      .limit(1)

    if (!comment) {
      throw new BizException(ErrorCode.COMMON_NOT_FOUND, { message: '评论不存在或不可操作' })
    }

    return comment
  }

  private async fetchReactionAggregations(tenantId: string, commentIds: string[], viewerId: string | null) {
    const db = this.dbAccessor.get()
    const counts = new Map<string, Record<string, number>>()
    const viewer = new Map<string, string[]>()

    if (commentIds.length === 0) {
      return { counts, viewer }
    }

    const rows = await db
      .select({
        commentId: commentReactions.commentId,
        reaction: commentReactions.reaction,
        total: sql<number>`count(*)`,
      })
      .from(commentReactions)
      .where(and(eq(commentReactions.tenantId, tenantId), inArray(commentReactions.commentId, commentIds)))
      .groupBy(commentReactions.commentId, commentReactions.reaction)

    for (const row of rows) {
      const current = counts.get(row.commentId) ?? {}
      current[row.reaction] = row.total
      counts.set(row.commentId, current)
    }

    if (viewerId) {
      const viewerRows = await db
        .select({
          commentId: commentReactions.commentId,
          reaction: commentReactions.reaction,
        })
        .from(commentReactions)
        .where(
          and(
            eq(commentReactions.tenantId, tenantId),
            inArray(commentReactions.commentId, commentIds),
            eq(commentReactions.userId, viewerId),
          ),
        )

      for (const row of viewerRows) {
        const existing = viewer.get(row.commentId) ?? []
        existing.push(row.reaction)
        viewer.set(row.commentId, existing)
      }
    }

    return { counts, viewer }
  }

  private async findCommentForCursor(commentId: string, tenantId: string, photoId: string) {
    const db = this.dbAccessor.get()
    const [comment] = await db
      .select({
        id: comments.id,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .where(and(eq(comments.id, commentId), eq(comments.tenantId, tenantId), eq(comments.photoId, photoId)))
      .limit(1)

    if (!comment) {
      throw new BizException(ErrorCode.COMMON_NOT_FOUND, { message: '无效的游标' })
    }
    return comment
  }

  private async findCommentForCursorAll(commentId: string, tenantId: string) {
    const db = this.dbAccessor.get()
    const [comment] = await db
      .select({
        id: comments.id,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .where(and(eq(comments.id, commentId), eq(comments.tenantId, tenantId)))
      .limit(1)

    if (!comment) {
      throw new BizException(ErrorCode.COMMON_NOT_FOUND, { message: '无效的游标' })
    }
    return comment
  }

  private toResponse(model: CommentViewModel & { reactionCounts: Record<string, number>, viewerReactions: string[] }) {
    return {
      id: model.id,
      photoId: model.photoId,
      parentId: model.parentId,
      userId: model.userId,
      content: model.content,
      status: model.status,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
      reactionCounts: model.reactionCounts,
      viewerReactions: model.viewerReactions,
    }
  }

  private async fetchUsersWithProfiles(userIds: string[]): Promise<Record<string, UserViewModel>> {
    const db = this.dbAccessor.get()
    const uniqueUserIds = [...new Set(userIds)].filter(Boolean)
    const result: Record<string, UserViewModel> = {}

    if (uniqueUserIds.length === 0) {
      return result
    }

    const userRows = await db
      .select({
        id: authUsers.id,
        name: authUsers.name,
        image: authUsers.image,
      })
      .from(authUsers)
      .where(inArray(authUsers.id, uniqueUserIds))

    for (const user of userRows) {
      result[user.id] = {
        id: user.id,
        name: user.name,
        image: user.image,
        website: null,
      }
    }

    const ownedWorkspaces = await db
      .select({
        userId: tenantMemberships.userId,
        slug: tenants.slug,
        customDomain: tenantDomains.domain,
      })
      .from(tenantMemberships)
      .innerJoin(tenants, eq(tenantMemberships.tenantId, tenants.id))
      .leftJoin(tenantDomains, and(eq(tenantDomains.tenantId, tenants.id), eq(tenantDomains.status, 'verified')))
      .where(
        and(
          inArray(tenantMemberships.userId, uniqueUserIds),
          eq(tenantMemberships.role, 'owner'),
          eq(tenantMemberships.status, 'active'),
        ),
      )
      .orderBy(asc(tenantMemberships.createdAt), asc(tenants.id), asc(tenantDomains.createdAt))

    if (ownedWorkspaces.length > 0) {
      const baseDomain = (await this.systemSettings.getSettings()).baseDomain || DEFAULT_BASE_DOMAIN
      for (const workspace of ownedWorkspaces) {
        const user = result[workspace.userId]
        if (!user || user.website) {
          continue
        }
        user.website = workspace.customDomain
          ? `https://${workspace.customDomain}`
          : `https://${workspace.slug}.${baseDomain}`
      }
    }

    return result
  }
}
