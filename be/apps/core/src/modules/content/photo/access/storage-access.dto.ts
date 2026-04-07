import { createZodSchemaDto } from '@tsuki/framework'
import { z } from 'zod'

const storageSignQuerySchema = z
  .object({
    objectKey: z
      .string()
      .trim()
      .transform((val) => (val.length > 0 ? val : undefined))
      .optional(),
    key: z
      .string()
      .trim()
      .transform((val) => (val.length > 0 ? val : undefined))
      .optional(),
    ttl: z
      .string()
      .optional()
      .transform((val) => {
        if (!val || val.trim().length === 0) {
          return
        }
        const parsed = Number.parseInt(val, 10)
        return Number.isFinite(parsed) ? parsed : undefined
      }),
    intent: z
      .string()
      .trim()
      .transform((val) => (val.length > 0 ? val : undefined))
      .optional(),
    format: z
      .string()
      .trim()
      .transform((val) => (val.length > 0 ? val : undefined))
      .optional(),
  })
  .refine(
    (data) => {
      const { objectKey } = data
      const { key } = data
      return !!(objectKey || key)
    },
    {
      message: 'objectKey 或 key 参数至少需要一个',
      path: ['objectKey'],
    },
  )

export class StorageSignQueryDto extends createZodSchemaDto(storageSignQuerySchema) {}
