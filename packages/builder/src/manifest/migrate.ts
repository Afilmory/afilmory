import fs from 'node:fs/promises'
import path from 'node:path'

import { workdir } from '@afilmory/builder/path.js'

import { logger } from '../logger/index.js'
import type { AfilmoryManifest } from '../types/manifest.js'
import type { ManifestVersion } from './version.js'
import { CURRENT_MANIFEST_VERSION } from './version.js'

const manifestPath = path.join(workdir, 'src/data/photos-manifest.json')

// Placeholder migration scaffolding (chain-of-executors)
// Supports sequential migrations: v1 -> v2 -> v3 -> ... -> CURRENT
export type MigrationContext = {
  from: ManifestVersion | string
  to: ManifestVersion
}

export type ManifestMigrator = (raw: AfilmoryManifest, ctx: MigrationContext) => AfilmoryManifest

export type MigrationStep = {
  from: ManifestVersion | string
  to: ManifestVersion
  exec: ManifestMigrator
}

// Registry of ordered migration steps. Keep empty until concrete steps are added.
const MIGRATION_STEPS: MigrationStep[] = [
  {
    from: 'v1',
    to: 'v6',
    exec: () => {
      logger.fs.error('🔍 无效的 manifest 版本，创建新的 manifest 文件...')
      return {
        version: 'v6',
        data: [],
        cameras: [],
        lenses: [],
      }
    },
  },
  {
    from: 'v6',
    to: 'v7',
    exec: (raw) => {
      raw.data.forEach((item) => {
        if (typeof item.thumbnailUrl === 'string') {
          item.thumbnailUrl = item.thumbnailUrl.replace(/\.webp$/, '.jpg')
        }
      })
      // 更新版本号为目标版本
      ;(raw as any).version = 'v7'
      return raw
    },
  },
]

function noOpBumpVersion(raw: any, _target: ManifestVersion): AfilmoryManifest {
  return raw
}

export function migrateManifest(
  raw: AfilmoryManifest,
  target: ManifestVersion = CURRENT_MANIFEST_VERSION,
): AfilmoryManifest {
  let current: ManifestVersion | string = (raw?.version as any) ?? 'unknown'
  let working = raw

  // Iterate through chain-of-executors until reaching target.
  // If no matching step is found for the current version, fallback to a no-op bump.
  const guard = new Set<string>()

  while (current !== target) {
    const guardKey = `${String(current)}->${String(target)}`
    if (guard.has(guardKey)) {
      logger.main.warn('⚠️ 检测到潜在迁移循环，使用占位升级直接跳转到目标版本')
      return noOpBumpVersion(working, target)
    }
    guard.add(guardKey)

    const step = MIGRATION_STEPS.find((s) => s.from === current)
    if (!step) {
      // No concrete step for this source version; do a simple version bump once.
      logger.main.info(`🔄 迁移占位：${String(current)} -> ${target}（无匹配步骤，直接提升版本）`)
      return noOpBumpVersion(working, target)
    }

    const ctx: MigrationContext = { from: step.from, to: step.to }
    logger.main.info(`🔁 执行迁移步骤：${String(step.from)} -> ${String(step.to)}`)
    working = step.exec(working, ctx)
    current = (working?.version as any) ?? step.to
  }

  // Already at target
  return working as AfilmoryManifest
}

export async function migrateManifestFileIfNeeded(parsed: AfilmoryManifest): Promise<AfilmoryManifest | null> {
  try {
    if (parsed?.version === CURRENT_MANIFEST_VERSION) return null
    const migrated = migrateManifest(parsed, CURRENT_MANIFEST_VERSION)
    await fs.mkdir(path.dirname(manifestPath), { recursive: true })
    await fs.writeFile(manifestPath, JSON.stringify(migrated, null, 2))
    logger.main.success(`✅ Manifest 版本已更新为 ${CURRENT_MANIFEST_VERSION}`)
    return migrated
  } catch (e) {
    logger.main.error('❌ Manifest 迁移失败（占位实现）：', e)
    throw e
  }
}
