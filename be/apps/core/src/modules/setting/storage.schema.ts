import { z } from 'zod'

const positiveInt = z.number().int().positive()
const nonNegativeInt = z.number().int().min(0)

const s3ConfigSchema = z.object({
  provider: z.literal('s3'),
  bucket: z.string().min(1),
  region: z.string().min(1).optional(),
  endpoint: z.string().min(1).optional(),
  accessKeyId: z.string().min(1).optional(),
  secretAccessKey: z.string().min(1).optional(),
  prefix: z.string().optional(),
  customDomain: z.string().optional(),
  excludeRegex: z.string().optional(),
  maxFileLimit: positiveInt.optional(),
  keepAlive: z.boolean().optional(),
  maxSockets: positiveInt.optional(),
  connectionTimeoutMs: nonNegativeInt.optional(),
  socketTimeoutMs: nonNegativeInt.optional(),
  requestTimeoutMs: nonNegativeInt.optional(),
  idleTimeoutMs: nonNegativeInt.optional(),
  totalTimeoutMs: nonNegativeInt.optional(),
  retryMode: z.enum(['standard', 'adaptive', 'legacy']).optional(),
  maxAttempts: positiveInt.optional(),
  downloadConcurrency: positiveInt.optional(),
})

const gitHubConfigSchema = z.object({
  provider: z.literal('github'),
  owner: z.string().min(1),
  repo: z.string().min(1),
  branch: z.string().min(1).optional(),
  token: z.string().min(1).optional(),
  path: z.string().optional(),
  useRawUrl: z.boolean().optional(),
})

const localConfigSchema = z.object({
  provider: z.literal('local'),
  basePath: z.string().min(1),
  baseUrl: z.string().optional(),
  excludeRegex: z.string().optional(),
  maxFileLimit: positiveInt.optional(),
})

const eagleRuleSchema = z.union([
  z.object({
    type: z.literal('tag'),
    name: z.string().min(1),
  }),
  z.object({
    type: z.literal('folder'),
    name: z.string().min(1),
    includeSubfolder: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('smartFolder'),
  }),
])

const eagleConfigSchema = z.object({
  provider: z.literal('eagle'),
  libraryPath: z.string().min(1),
  distPath: z.string().optional(),
  baseUrl: z.string().optional(),
  include: z.array(eagleRuleSchema).optional(),
  exclude: z.array(eagleRuleSchema).optional(),
})

export const STORAGE_PROVIDER_VALUES = ['s3', 'github', 'local', 'eagle'] as const

export const StorageConfigSchema = z.discriminatedUnion('provider', [
  s3ConfigSchema,
  gitHubConfigSchema,
  localConfigSchema,
  eagleConfigSchema,
])

export const StorageConfigRecordSchema = z.record(StorageConfigSchema)

export type StorageConfigInput = z.infer<typeof StorageConfigSchema>
