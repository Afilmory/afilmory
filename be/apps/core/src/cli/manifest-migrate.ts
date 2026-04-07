import { photoAssets } from '@afilmory/db'
import { createLogger } from '@tsuki/framework'
import { eq, gt, sql } from 'drizzle-orm'

import { APP_GLOBAL_PREFIX } from '../app.constants'
import { createConfiguredApp } from '../app.factory'
import { DbAccessor, PgPoolProvider } from '../database/database.provider'
import { ensureCurrentPhotoAssetManifest } from '../modules/content/manifest/manifest-migration.helper'
import { RedisProvider } from '../redis/redis.provider'

const logger = createLogger('CLI:ManifestMigrate')
const COMMAND_NAME = 'manifest:migrate'
const DRY_RUN_FLAG = '--dry-run'
const BATCH_FLAG = '--batch'
const DEFAULT_BATCH_SIZE = 200

export interface ManifestMigrationCliOptions {
  readonly command: typeof COMMAND_NAME
  readonly dryRun: boolean
  readonly batchSize: number
}

export function parseManifestMigrationCliArgs(argv: readonly string[]): ManifestMigrationCliOptions | null {
  if (argv.length === 0 || argv[0] !== COMMAND_NAME) {
    return null
  }

  let dryRun = false
  let batchSize = DEFAULT_BATCH_SIZE

  for (let index = 1; index < argv.length; index++) {
    const token = argv[index]
    if (!token) continue

    if (token === DRY_RUN_FLAG) {
      dryRun = true
      continue
    }

    if (token.startsWith(`${DRY_RUN_FLAG}=`)) {
      const inline = token.slice(DRY_RUN_FLAG.length + 1)
      dryRun = inline !== 'false'
      continue
    }

    if (token === BATCH_FLAG) {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --batch')
      }
      batchSize = parseBatchSize(value)
      index++
      continue
    }

    if (token.startsWith(`${BATCH_FLAG}=`)) {
      const inline = token.slice(BATCH_FLAG.length + 1)
      batchSize = parseBatchSize(inline)
      continue
    }
  }

  return {
    command: COMMAND_NAME,
    dryRun,
    batchSize,
  }
}

function parseBatchSize(value: string): number {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid --batch value: "${value}"`)
  }
  return parsed
}

export async function handleManifestMigrationCli(options: ManifestMigrationCliOptions): Promise<void> {
  const app = await createConfiguredApp({
    globalPrefix: APP_GLOBAL_PREFIX,
  })

  const container = app.getContainer()
  const dbAccessor = container.resolve(DbAccessor)
  const poolProvider = container.resolve(PgPoolProvider)
  const redisProvider = container.resolve(RedisProvider)

  try {
    const db = dbAccessor.get()
    const total = await countPhotoAssets(db)

    logger.info(
      `Scanning ${total} photo assets in batches of ${options.batchSize}${options.dryRun ? ' (dry run)' : ''}`,
    )
    const summary = await migratePhotoAssets(db, options)
    logger.info(
      `${options.dryRun ? 'Dry run' : 'Migration'} completed. Processed ${summary.processed} assets, ${
        options.dryRun ? 'would update' : 'updated'
      } ${summary.updated} manifest records.`,
    )
  } finally {
    await app.close(COMMAND_NAME)

    try {
      const pool = poolProvider.getPool()
      await pool.end()
    } catch (error) {
      logger.warn(`Failed to close PostgreSQL pool cleanly: ${String(error)}`)
    }

    try {
      const redis = redisProvider.getClient()
      redis.disconnect()
    } catch (error) {
      logger.warn(`Failed to disconnect Redis client cleanly: ${String(error)}`)
    }
  }
}

type DbClient = ReturnType<DbAccessor['get']>

async function countPhotoAssets(db: DbClient): Promise<number> {
  const [row] = await db.select({ total: sql<number>`count(*)` }).from(photoAssets)
  return row?.total ?? 0
}

async function migratePhotoAssets(
  db: DbClient,
  options: ManifestMigrationCliOptions,
): Promise<{ processed: number; updated: number }> {
  let processed = 0
  let updated = 0
  let lastId: string | null = null

  while (true) {
    let query: any = db
      .select({
        id: photoAssets.id,
        manifest: photoAssets.manifest,
        manifestVersion: photoAssets.manifestVersion,
      })
      .from(photoAssets)
      .orderBy(photoAssets.id)
      .limit(options.batchSize)

    if (lastId) {
      query = query.where(gt(photoAssets.id, lastId))
    }

    const rows = await query
    if (rows.length === 0) {
      break
    }

    lastId = rows.at(-1)?.id ?? null

    for (const row of rows) {
      processed++
      const { manifest: resolved, changed } = ensureCurrentPhotoAssetManifest(row.manifest)
      if (!resolved || !changed) {
        continue
      }

      updated++
      if (options.dryRun) {
        logger.info(`Would update photo asset ${row.id} -> version ${resolved.version}`)
        continue
      }

      await db
        .update(photoAssets)
        .set({
          manifest: resolved,
          manifestVersion: resolved.version,
        })
        .where(eq(photoAssets.id, row.id))
    }
  }

  return { processed, updated }
}
