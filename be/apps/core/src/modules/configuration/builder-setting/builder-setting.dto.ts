import { createZodDto } from '@afilmory/framework'
import { z } from 'zod'

const processingSchema = z.object({
  defaultConcurrency: z.number().int().positive(),
  enableLivePhotoDetection: z.boolean(),
  digestSuffixLength: z.number().int().min(0),
  supportedFormats: z.array(z.string().min(1)).optional(),
})

const loggingSchema = z.object({
  level: z.enum(['info', 'warn', 'error', 'debug']),
  verbose: z.boolean(),
  outputToFile: z.boolean(),
})

const workerSchema = z.object({
  workerCount: z.number().int().positive(),
  workerConcurrency: z.number().int().positive(),
  useClusterMode: z.boolean(),
  timeout: z.number().int().positive(),
})

const systemSchema = z.object({
  processing: processingSchema,
  observability: z.object({
    showProgress: z.boolean(),
    showDetailedStats: z.boolean(),
    logging: loggingSchema,
    performance: z.object({
      worker: workerSchema,
    }),
  }),
})

export class UpdateBuilderSettingsDto extends createZodDto(
  z.object({
    system: systemSchema,
  }),
) {}
