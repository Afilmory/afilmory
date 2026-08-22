import { createZodSchemaDto } from '@tsuki-hono/common'
import { z } from 'zod'

import { COMMENT_REPORT_REASONS } from './user-safety.types'

const CommentReportReasonSchema = z.enum(COMMENT_REPORT_REASONS)

export const ReportCommentSchema = z.object({
  reason: CommentReportReasonSchema,
  details: z.string().trim().max(500).optional(),
})

export class ReportCommentDto extends createZodSchemaDto(ReportCommentSchema) {}

export const BlockCommentAuthorSchema = z.object({
  reason: CommentReportReasonSchema.default('abusive_behavior'),
  details: z.string().trim().max(500).optional(),
})

export class BlockCommentAuthorDto extends createZodSchemaDto(BlockCommentAuthorSchema) {}

export const BlockedUserParamSchema = z.object({
  userId: z.string().trim().min(1),
})

export class BlockedUserParamDto extends createZodSchemaDto(BlockedUserParamSchema) {}
