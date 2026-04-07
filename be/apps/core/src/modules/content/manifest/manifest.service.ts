import type { AfilmoryManifest, CameraInfo, LensInfo, PhotoManifestItem } from '@afilmory/builder'
import { CURRENT_MANIFEST_VERSION, migrateManifest } from '@afilmory/builder'
import type { ManifestVersion } from '@afilmory/builder/manifest/version.js'
import type { PhotoAssetManifest } from '@afilmory/db'
import { CURRENT_PHOTO_MANIFEST_VERSION, photoAssets } from '@afilmory/db'
import { createLogger } from '@tsuki/framework'
import { DbAccessor } from 'core/database/database.provider'
import { StorageAccessService } from 'core/modules/content/photo/access/storage-access.service'
import { createProxyUrl } from 'core/modules/content/photo/access/storage-access.utils'
import { PhotoStorageService } from 'core/modules/content/photo/storage/photo-storage.service'
import { requireTenantContext } from 'core/modules/platform/tenant/tenant.context'
import { and, eq, inArray } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { ensureCurrentPhotoAssetManifest } from './manifest-migration.helper'

@injectable()
export class ManifestService {
  private readonly logger = createLogger('ManifestService')

  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly photoStorageService: PhotoStorageService,
    private readonly storageAccessService: StorageAccessService,
  ) {}

  async getManifest(): Promise<AfilmoryManifest> {
    const tenant = requireTenantContext()
    const db = this.dbAccessor.get()

    const records = await db
      .select({
        id: photoAssets.id,
        manifest: photoAssets.manifest,
        storageProvider: photoAssets.storageProvider,
      })
      .from(photoAssets)
      .where(and(eq(photoAssets.tenantId, tenant.tenant.id), inArray(photoAssets.syncStatus, ['synced', 'conflict'])))

    if (records.length === 0) {
      return {
        version: CURRENT_PHOTO_MANIFEST_VERSION,
        data: [],
        cameras: [],
        lenses: [],
      }
    }

    const { storageConfig } = await this.photoStorageService.resolveConfigForTenant(tenant.tenant.id)
    const secureAccessEnabled = await this.storageAccessService.resolveSecureAccessPreference(
      storageConfig,
      tenant.tenant.id,
    )
    const items: PhotoManifestItem[] = []
    const upgrades: Array<{ id: string; manifest: PhotoAssetManifest }> = []

    for (const record of records) {
      const { manifest, changed } = ensureCurrentPhotoAssetManifest(record.manifest)
      if (!manifest) {
        continue
      }

      if (changed) {
        upgrades.push({ id: record.id, manifest })
      }

      const normalized = structuredClone(manifest.data)
      if (secureAccessEnabled && (record.storageProvider === 'managed' || record.storageProvider === 's3')) {
        if (normalized.s3Key) {
          normalized.originalUrl = createProxyUrl(normalized.s3Key)
        }
        if (normalized.video?.type === 'live-photo' && normalized.video.s3Key) {
          normalized.video.videoUrl = createProxyUrl(normalized.video.s3Key, 'live-video')
        }
      }
      items.push(normalized)
    }

    if (upgrades.length > 0) {
      await this.persistManifestUpgrades(upgrades)
    }

    const sorted = this.sortByDateDesc(items)
    const manifest = this.ensureCurrentManifestVersion({
      version: upgrades.length > 0 ? CURRENT_MANIFEST_VERSION : this.resolveManifestVersion(records),
      data: sorted,
      cameras: [],
      lenses: [],
    })

    const cameras = this.buildCameraCollection(manifest.data)
    const lenses = this.buildLensCollection(manifest.data)

    return {
      ...manifest,
      cameras,
      lenses,
    }
  }

  private resolveManifestVersion(
    records: Array<{ manifest: { version: ManifestVersion | string } | null }>,
  ): ManifestVersion {
    for (const record of records) {
      const version = record.manifest?.version
      if (typeof version === 'string' && version.length > 0) {
        return version as ManifestVersion
      }
    }
    return CURRENT_PHOTO_MANIFEST_VERSION
  }

  private ensureCurrentManifestVersion(manifest: AfilmoryManifest): AfilmoryManifest {
    if (manifest.version === CURRENT_MANIFEST_VERSION) {
      return manifest
    }

    try {
      return migrateManifest(manifest, CURRENT_MANIFEST_VERSION)
    } catch (error) {
      this.logger.warn('Manifest migration failed; returning original payload', { error })
      return manifest
    }
  }

  private async persistManifestUpgrades(upgrades: Array<{ id: string; manifest: PhotoAssetManifest }>): Promise<void> {
    if (upgrades.length === 0) {
      return
    }

    const db = this.dbAccessor.get()
    for (const entry of upgrades) {
      try {
        await db
          .update(photoAssets)
          .set({
            manifest: entry.manifest,
            manifestVersion: entry.manifest.version,
          })
          .where(eq(photoAssets.id, entry.id))
      } catch (error) {
        this.logger.warn('Failed to persist manifest upgrade', { photoAssetId: entry.id, error })
      }
    }
  }

  private sortByDateDesc(items: PhotoManifestItem[]): PhotoManifestItem[] {
    return [...items].sort((a, b) => this.toTimestamp(b.dateTaken) - this.toTimestamp(a.dateTaken))
  }

  private toTimestamp(value: string | null | undefined): number {
    if (!value) {
      return 0
    }
    const time = Date.parse(value)
    return Number.isNaN(time) ? 0 : time
  }

  private buildCameraCollection(manifest: PhotoManifestItem[]): CameraInfo[] {
    const cameraMap = new Map<string, CameraInfo>()

    for (const photo of manifest) {
      const make = photo.exif?.Make?.trim()
      const model = photo.exif?.Model?.trim()
      if (!make || !model) {
        continue
      }

      const displayName = `${make} ${model}`
      if (!cameraMap.has(displayName)) {
        cameraMap.set(displayName, {
          make,
          model,
          displayName,
        })
      }
    }

    return Array.from(cameraMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName))
  }

  private buildLensCollection(manifest: PhotoManifestItem[]): LensInfo[] {
    const lensMap = new Map<string, LensInfo>()

    for (const photo of manifest) {
      const lensModel = photo.exif?.LensModel?.trim()
      if (!lensModel) {
        continue
      }

      const lensMake = photo.exif?.LensMake?.trim()
      const displayName = lensMake ? `${lensMake} ${lensModel}` : lensModel

      if (!lensMap.has(displayName)) {
        lensMap.set(displayName, {
          make: lensMake,
          model: lensModel,
          displayName,
        })
      }
    }

    return Array.from(lensMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName))
  }
}
