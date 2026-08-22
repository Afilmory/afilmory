import { DatabaseModule } from '@core/database/database.module'
import { UserSafetyModule } from '@core/modules/platform/user-safety/user-safety.module'
import { Module } from '@tsuki-hono/common'

import { CommentController } from './comment.controller'
import { AllowAllCommentModerationHook, COMMENT_MODERATION_HOOK } from './comment.moderation'
import { CommentService } from './comment.service'

@Module({
  imports: [DatabaseModule, UserSafetyModule],
  controllers: [CommentController],
  providers: [
    CommentService,
    AllowAllCommentModerationHook,
    {
      provide: COMMENT_MODERATION_HOOK,
      useExisting: AllowAllCommentModerationHook,
    },
  ],
})
export class CommentModule {}
