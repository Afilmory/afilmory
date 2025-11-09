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

const builderConfigSchema = z
  .object({
    storage: storageConfigSchema,
    repo: z.record(z.string(), z.unknown()).optional(),
    options: z.record(z.string(), z.unknown()).optional(),
    logging: z.record(z.string(), z.unknown()).optional(),
    performance: z.record(z.string(), z.unknown()).optional(),
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
