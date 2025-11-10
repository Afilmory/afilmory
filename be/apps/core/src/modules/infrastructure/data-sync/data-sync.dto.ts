import { createZodDto } from '@afilmory/framework'
import { z } from 'zod'

import { ConflictResolutionStrategy } from './data-sync.types'

const s3ConfigSchema = z.object({
  provider: z.literal('s3'),
  bucket: z.string().min(1),
  region: z.string().optional(),
  endpoint: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  prefix: z.string().optional(),
  customDomain: z.string().optional(),
  excludeRegex: z.string().optional(),
  maxFileLimit: z.number().int().positive().optional(),
  keepAlive: z.boolean().optional(),
  maxSockets: z.number().int().positive().optional(),
  connectionTimeoutMs: z.number().int().positive().optional(),
  socketTimeoutMs: z.number().int().positive().optional(),
  requestTimeoutMs: z.number().int().positive().optional(),
  idleTimeoutMs: z.number().int().positive().optional(),
  totalTimeoutMs: z.number().int().positive().optional(),
  retryMode: z.enum(['standard', 'adaptive', 'legacy']).optional(),
  maxAttempts: z.number().int().positive().optional(),
  downloadConcurrency: z.number().int().positive().optional(),
})

const githubConfigSchema = z.object({
  provider: z.literal('github'),
  owner: z.string().min(1),
  repo: z.string().min(1),
  branch: z.string().optional(),
  token: z.string().optional(),
  path: z.string().optional(),
  useRawUrl: z.boolean().optional(),
})

const storageConfigSchema = z.discriminatedUnion('provider', [s3ConfigSchema, githubConfigSchema])

const builderProcessingSchema = z
  .object({
    defaultConcurrency: z.number().int().positive().optional(),
    enableLivePhotoDetection: z.boolean().optional(),
    supportedFormats: z.array(z.string()).optional(),
    digestSuffixLength: z.number().int().nonnegative().optional(),
  })
  .partial()

const builderObservabilitySchema = z
  .object({
    showProgress: z.boolean().optional(),
    showDetailedStats: z.boolean().optional(),
    logging: z
      .object({
        verbose: z.boolean().optional(),
        level: z.enum(['info', 'warn', 'error', 'debug']).optional(),
        outputToFile: z.boolean().optional(),
        logFilePath: z.string().optional(),
      })
      .partial()
      .optional(),
    performance: z
      .object({
        worker: z
          .object({
            timeout: z.number().int().positive().optional(),
            useClusterMode: z.boolean().optional(),
            workerConcurrency: z.number().int().positive().optional(),
            workerCount: z.number().int().positive().optional(),
          })
          .partial()
          .optional(),
      })
      .partial()
      .optional(),
  })
  .partial()

const builderSystemSchema = z
  .object({
    processing: builderProcessingSchema.optional(),
    observability: builderObservabilitySchema.optional(),
  })
  .partial()

const builderUserSchema = z
  .object({
    repo: z
      .object({
        enable: z.boolean().optional(),
        url: z.string().optional(),
        token: z.string().optional(),
      })
      .partial()
      .optional(),
    storage: storageConfigSchema.optional(),
  })
  .partial()

const builderConfigSchema = z
  .object({
    system: builderSystemSchema.optional(),
    user: builderUserSchema.optional(),
    plugins: z.array(z.unknown()).optional(),
  })
  .passthrough()

export const runDataSyncSchema = z
  .object({
    builderConfig: builderConfigSchema.optional(),
    storageConfig: storageConfigSchema.optional(),
    dryRun: z.boolean().optional().default(false),
  })
  .transform((payload) => ({
    ...payload,
    dryRun: payload.dryRun ?? false,
  }))

const conflictResolutionSchema = z.nativeEnum(ConflictResolutionStrategy)

export const resolveConflictSchema = z.object({
  strategy: conflictResolutionSchema,
  builderConfig: builderConfigSchema.optional(),
  storageConfig: storageConfigSchema.optional(),
  dryRun: z.boolean().optional().default(false),
})

export type RunDataSyncInput = z.infer<typeof runDataSyncSchema>
export type ResolveConflictInput = z.infer<typeof resolveConflictSchema>

export class RunDataSyncDto extends createZodDto(runDataSyncSchema) {}

export class ResolveConflictDto extends createZodDto(resolveConflictSchema) {}
