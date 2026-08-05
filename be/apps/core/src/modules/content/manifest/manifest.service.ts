import { createHash } from 'node:crypto'

import type { AfilmoryManifest, CameraInfo, LensInfo, PhotoManifestItem } from '@afilmory/builder'
import { CURRENT_MANIFEST_VERSION, migrateManifest } from '@afilmory/builder'
import type { ManifestVersion } from '@afilmory/builder/manifest/version.js'
import type { PhotoAssetManifest } from '@afilmory/db'
import { CURRENT_PHOTO_MANIFEST_VERSION, photoAssets } from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { requireTenantContext } from '@core/modules/platform/tenant/tenant.context'
import { createLogger } from '@tsuki-hono/common'
import { and, count, eq, inArray, max } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { ensureCurrentPhotoAssetManifest } from './manifest-migration.helper'

export function computeManifestETag(maxUpdatedAt: string | null, photoCount: number): string {
  const hash = createHash('sha256')
    .update(`${maxUpdatedAt ?? ''}:${photoCount}`)
    .digest('hex')
  return `"${hash}"`
}

export interface AfilmorySearchQuery {
  tags?: string[]
  tagMode?: 'union' | 'intersection'
  cameras?: string[]
  lenses?: string[]
  rating?: number
  from?: string
  to?: string
  sort?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export interface AfilmorySearchResult {
  data: PhotoManifestItem[]
  total: number
}

@injectable()
export class ManifestService {
  private readonly logger = createLogger('ManifestService')

  constructor(private readonly dbAccessor: DbAccessor) {}

  async getManifestETag(): Promise<string> {
    const tenant = requireTenantContext()
    const db = this.dbAccessor.get()

    const [row] = await db
      .select({
        maxUpdatedAt: max(photoAssets.updatedAt),
        photoCount: count(),
      })
      .from(photoAssets)
      .where(and(eq(photoAssets.tenantId, tenant.tenant.id), inArray(photoAssets.syncStatus, ['synced', 'conflict'])))

    return computeManifestETag(row?.maxUpdatedAt ?? null, row?.photoCount ?? 0)
  }

  async getManifest(): Promise<AfilmoryManifest> {
    const tenant = requireTenantContext()
    const db = this.dbAccessor.get()

    const records = await db
      .select({
        id: photoAssets.id,
        manifest: photoAssets.manifest,
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

    const items: PhotoManifestItem[] = []
    const upgrades: Array<{ id: string, manifest: PhotoAssetManifest }> = []

    for (const record of records) {
      const { manifest, changed } = ensureCurrentPhotoAssetManifest(record.manifest)
      if (!manifest) {
        continue
      }

      if (changed) {
        upgrades.push({ id: record.id, manifest })
      }

      items.push(structuredClone(manifest.data))
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

  async getPhotosByIds(photoIds: string[]): Promise<PhotoManifestItem[]> {
    if (photoIds.length === 0) {
      return []
    }
    const tenant = requireTenantContext()
    const db = this.dbAccessor.get()

    const records = await db
      .select({
        id: photoAssets.id,
        manifest: photoAssets.manifest,
      })
      .from(photoAssets)
      .where(
        and(
          eq(photoAssets.tenantId, tenant.tenant.id),
          inArray(photoAssets.photoId, photoIds),
          inArray(photoAssets.syncStatus, ['synced', 'conflict']),
        ),
      )

    if (records.length === 0) {
      return []
    }

    const itemMap = new Map<string, PhotoManifestItem>()
    const upgrades: Array<{ id: string, manifest: PhotoAssetManifest }> = []

    for (const record of records) {
      const { manifest, changed } = ensureCurrentPhotoAssetManifest(record.manifest)
      if (!manifest) {
        continue
      }
      if (changed) {
        upgrades.push({ id: record.id, manifest })
      }

      const normalized = structuredClone(manifest.data)
      itemMap.set(normalized.id, normalized)
    }

    if (upgrades.length > 0) {
      await this.persistManifestUpgrades(upgrades)
    }

    return photoIds.map(id => itemMap.get(id)).filter((p): p is PhotoManifestItem => Boolean(p))
  }

  async searchPhotos(query: AfilmorySearchQuery): Promise<AfilmorySearchResult> {
    const manifest = await this.getManifest()
    let photos = manifest.data

    if (query.tags?.length) {
      const tags = query.tags
      photos
        = query.tagMode === 'intersection'
          ? photos.filter(p => tags.every(t => (p.tags ?? []).includes(t)))
          : photos.filter(p => tags.some(t => (p.tags ?? []).includes(t)))
    }
    if (query.cameras?.length) {
      const set = new Set(query.cameras)
      photos = photos.filter((p) => {
        const make = p.exif?.Make?.trim()
        const model = p.exif?.Model?.trim()
        if (!make || !model) {
          return false
        }
        return set.has(`${make} ${model}`)
      })
    }
    if (query.lenses?.length) {
      const set = new Set(query.lenses)
      photos = photos.filter((p) => {
        const model = p.exif?.LensModel?.trim()
        if (!model) {
          return false
        }
        const make = p.exif?.LensMake?.trim()
        const name = make ? `${make} ${model}` : model
        return set.has(name)
      })
    }
    if (query.rating !== undefined && query.rating !== null) {
      const threshold = query.rating
      photos = photos.filter(p => (p.exif?.Rating ?? 0) >= threshold)
    }
    if (query.from || query.to) {
      const fromTs = query.from ? Date.parse(`${query.from}T00:00:00.000Z`) : Number.NEGATIVE_INFINITY
      const toTs = query.to ? Date.parse(`${query.to}T23:59:59.999Z`) : Number.POSITIVE_INFINITY
      photos = photos.filter((p) => {
        const candidates = [p.dateTaken, p.exif?.DateTimeOriginal as string | undefined, p.lastModified]
        for (const c of candidates) {
          if (!c) {
            continue
          }
          const t = new Date(c).getTime()
          if (Number.isFinite(t)) {
            return t >= fromTs && t <= toTs
          }
        }
        return false
      })
    }

    const sort = query.sort ?? 'desc'
    if (sort === 'asc') {
      photos = [...photos].reverse()
    }

    const total = photos.length
    const offset = query.offset ?? 0
    const limit = query.limit ?? total
    return { data: photos.slice(offset, offset + limit), total }
  }

  async getPhoto(photoId: string): Promise<PhotoManifestItem | null> {
    const tenant = requireTenantContext()
    const db = this.dbAccessor.get()

    const records = await db
      .select({
        id: photoAssets.id,
        manifest: photoAssets.manifest,
      })
      .from(photoAssets)
      .where(
        and(
          eq(photoAssets.tenantId, tenant.tenant.id),
          eq(photoAssets.photoId, photoId),
          inArray(photoAssets.syncStatus, ['synced', 'conflict']),
        ),
      )
      .limit(1)

    if (records.length === 0) {
      return null
    }

    const record = records[0]!
    const { manifest, changed } = ensureCurrentPhotoAssetManifest(record.manifest)
    if (!manifest) {
      return null
    }

    if (changed) {
      await this.persistManifestUpgrades([{ id: record.id, manifest }])
    }

    return structuredClone(manifest.data)
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
    }
    catch (error) {
      this.logger.warn('Manifest migration failed; returning original payload', { error })
      return manifest
    }
  }

  private async persistManifestUpgrades(upgrades: Array<{ id: string, manifest: PhotoAssetManifest }>): Promise<void> {
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
      }
      catch (error) {
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
