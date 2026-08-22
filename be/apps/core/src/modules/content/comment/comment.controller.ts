import type { HttpContextAuth } from '@core/context/http-context.values'
import { BizException, ErrorCode } from '@core/errors'
import { RequireAuth, TenantRoles } from '@core/guards/roles.decorator'
import { requireTenantContext } from '@core/modules/platform/tenant/tenant.context'
import { BlockCommentAuthorDto, ReportCommentDto } from '@core/modules/platform/user-safety/user-safety.dto'
import { UserSafetyService } from '@core/modules/platform/user-safety/user-safety.service'
import { Body, ContextParam, Controller, Delete, Get, HttpContext, Param, Post, Query } from '@tsuki-hono/common'
import type { Context } from 'hono'

import {
  CommentReactionDto,
  CreateCommentDto,
  GetCommentCountQueryDto,
  ListAllCommentsQueryDto,
  ListCommentsQueryDto,
} from './comment.dto'
import { CommentService } from './comment.service'

@Controller('comments')
export class CommentController {
  constructor(
    private readonly commentService: CommentService,
    private readonly userSafetyService: UserSafetyService,
  ) {}

  @Post('/')
  @RequireAuth()
  async createComment(@ContextParam() context: Context, @Body() body: CreateCommentDto) {
    return await this.commentService.createComment(body, context)
  }

  @Get('/count')
  async getCommentCount(@Query() query: GetCommentCountQueryDto) {
    return await this.commentService.getCommentCount(query)
  }

  @Get('/')
  async listComments(@Query() query: ListCommentsQueryDto) {
    return await this.commentService.listComments(query)
  }

  @Get('/all')
  @TenantRoles('admin')
  async listAllComments(@Query() query: ListAllCommentsQueryDto) {
    return await this.commentService.listAllComments(query)
  }

  @Post('/:id/reactions')
  @RequireAuth()
  async react(@Param('id') commentId: string, @Body() body: CommentReactionDto) {
    return await this.commentService.toggleReaction(commentId, body)
  }

  @Post('/:id/reports')
  @RequireAuth()
  async reportComment(@Param('id') commentId: string, @Body() body: ReportCommentDto) {
    const tenant = requireTenantContext()
    const userId = this.requireUserId()
    return await this.userSafetyService.reportComment(tenant.tenant.id, userId, commentId, body)
  }

  @Post('/:id/block-author')
  @RequireAuth()
  async blockCommentAuthor(@Param('id') commentId: string, @Body() body: BlockCommentAuthorDto) {
    const tenant = requireTenantContext()
    const userId = this.requireUserId()
    return await this.userSafetyService.blockCommentAuthor(tenant.tenant.id, userId, commentId, body)
  }

  @Delete('/:id')
  @RequireAuth()
  async deleteComment(@Param('id') commentId: string) {
    await this.commentService.softDelete(commentId)
    return { id: commentId, deleted: true }
  }

  private requireUserId(): string {
    const auth = HttpContext.getValue('auth') as HttpContextAuth | undefined
    if (!auth?.user || !auth.session) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED)
    }
    return auth.user.id
  }
}
