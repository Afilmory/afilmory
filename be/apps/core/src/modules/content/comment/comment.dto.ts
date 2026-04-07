import { createZodSchemaDto } from '@tsuki/framework'
import { z } from 'zod'

export const CreateCommentSchema = z.object({
  photoId: z.string().trim().min(1, 'photoId is required'),
  content: z.string().trim().min(1, 'content is required').max(1000, 'content too long'),
  parentId: z.string().trim().min(1).optional(),
})

export class CreateCommentDto extends createZodSchemaDto(CreateCommentSchema) {}

export const ListCommentsQuerySchema = z.object({
  photoId: z.string().trim().min(1, 'photoId is required'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().trim().min(1).optional(),
})

export class ListCommentsQueryDto extends createZodSchemaDto(ListCommentsQuerySchema) {}

export const ListAllCommentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().trim().min(1).optional(),
  photoId: z.string().trim().min(1).optional(),
  status: z.enum(['approved', 'pending', 'hidden', 'rejected']).optional(),
})

export class ListAllCommentsQueryDto extends createZodSchemaDto(ListAllCommentsQuerySchema) {}

export const CommentReactionSchema = z.object({
  reaction: z.string().trim().min(1, 'reaction is required').max(32, 'reaction too long'),
})

export class CommentReactionDto extends createZodSchemaDto(CommentReactionSchema) {}

export const GetCommentCountQuerySchema = z.object({
  photoId: z.string().trim().min(1, 'photoId is required'),
})

export class GetCommentCountQueryDto extends createZodSchemaDto(GetCommentCountQuerySchema) {}
