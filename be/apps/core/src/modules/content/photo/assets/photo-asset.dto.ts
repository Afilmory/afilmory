import { createZodDto } from '@tsuki/framework'
import { z } from 'zod'

const tagSchema = z
  .string()
  .trim()
  .min(1, { message: '标签不能为空' })
  .max(64, { message: '标签长度不能超过 64 个字符' })

export class UpdatePhotoTagsDto extends createZodDto(
  z.object({
    tags: z.array(tagSchema).max(32, { message: '单张照片最多可设置 32 个标签' }),
  }),
) {}
