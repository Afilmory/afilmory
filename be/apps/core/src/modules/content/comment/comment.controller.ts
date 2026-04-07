import { Body, ContextParam, Controller, Delete, Get, Param, Post, Query } from '@tsuki/framework'
import { Roles } from 'core/guards/roles.decorator'
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
  constructor(private readonly commentService: CommentService) {}

  @Post('/')
  @Roles('user')
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
  @Roles('admin')
  async listAllComments(@Query() query: ListAllCommentsQueryDto) {
    return await this.commentService.listAllComments(query)
  }

  @Post('/:id/reactions')
  @Roles('user')
  async react(@Param('id') commentId: string, @Body() body: CommentReactionDto) {
    return await this.commentService.toggleReaction(commentId, body)
  }

  @Delete('/:id')
  @Roles('user')
  async deleteComment(@Param('id') commentId: string) {
    await this.commentService.softDelete(commentId)
    return { id: commentId, deleted: true }
  }
}
