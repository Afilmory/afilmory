import type { AfilmoryManifest, CameraInfo, LensInfo, PhotoManifestItem } from '@afilmory/builder'
import { CURRENT_PHOTO_MANIFEST_VERSION, photoAssets } from '@afilmory/db'
import { and, eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { DbAccessor } from '../../database/database.provider'
import { requireTenantContext } from '../tenant/tenant.context'

@injectable()
export class ManifestService {
  constructor(private readonly dbAccessor: DbAccessor) {}

  async getManifest(): Promise<AfilmoryManifest> {
    const tenant = requireTenantContext()
    const db = this.dbAccessor.get()

    const records = await db
      .select({
        manifest: photoAssets.manifest,
      })
      .from(photoAssets)
      .where(and(eq(photoAssets.tenantId, tenant.tenant.id), eq(photoAssets.syncStatus, 'synced')))

    if (records.length === 0) {
      return {
        version: CURRENT_PHOTO_MANIFEST_VERSION,
        data: [],
        cameras: [],
        lenses: [],
      }
    }

    const items: PhotoManifestItem[] = []

    for (const record of records) {
      const item = record.manifest?.data
      if (item) {
        items.push(item)
      }
    }

    const sorted = this.sortByDateDesc(items)
    const cameras = this.buildCameraCollection(sorted)
    const lenses = this.buildLensCollection(sorted)

    return {
      version: this.resolveManifestVersion(records),
      data: sorted,
      cameras,
      lenses,
    }
  }

  private resolveManifestVersion(
    records: Array<{ manifest: { version: typeof CURRENT_PHOTO_MANIFEST_VERSION } | null }>,
  ): typeof CURRENT_PHOTO_MANIFEST_VERSION {
    for (const record of records) {
      const version = record.manifest?.version
      if (version) {
        return version
      }
    }
    return CURRENT_PHOTO_MANIFEST_VERSION
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
