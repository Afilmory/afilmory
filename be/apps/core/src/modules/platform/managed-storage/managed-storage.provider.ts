import { StorageFactory } from '@afilmory/builder/storage/index.js'
import type {
  ManagedStorageConfig,
  ProgressCallback,
  RemoteStorageConfig,
  StorageObject,
  StorageProvider,
  StorageUploadOptions,
} from '@afilmory/builder/storage/interfaces.js'

type PrefixedStorageObject = StorageObject & { key: string }

export class ManagedStorageProvider implements StorageProvider {
  private readonly upstream: StorageProvider
  private readonly upstreamConfig: RemoteStorageConfig
  private readonly effectivePrefix: string
  private readonly needsManualPrefix: boolean

  constructor(private readonly config: ManagedStorageConfig) {
    const tenantSegment = this.normalizePath(config.tenantId)
    if (!tenantSegment) {
      throw new Error('Managed storage provider requires a valid tenantId.')
    }

    const upstreamBase = this.normalizePath(this.extractUpstreamBasePath(config.upstream))
    const customBase = this.normalizePath(config.basePrefix)
    const combinedBase = this.joinSegments(upstreamBase, customBase)
    this.effectivePrefix = this.joinSegments(combinedBase, tenantSegment)

    const scopedConfig = this.applyTenantPrefix(config.upstream, this.effectivePrefix)
    this.upstreamConfig = scopedConfig
    this.needsManualPrefix = scopedConfig.provider === 's3'
    this.upstream = StorageFactory.createProvider(scopedConfig)
  }

  async getFile(key: string): Promise<Buffer | null> {
    const targetKey = this.prepareKeyForUpstream(key)
    return await this.upstream.getFile(targetKey)
  }

  async listImages(): Promise<StorageObject[]> {
    const objects = await this.upstream.listImages()
    return this.normalizeResults(objects)
  }

  async listAllFiles(progressCallback?: ProgressCallback): Promise<StorageObject[]> {
    const objects = await this.upstream.listAllFiles(progressCallback)
    return this.normalizeResults(objects)
  }

  async generatePublicUrl(key: string): Promise<string> {
    const targetKey = this.prepareKeyForUpstream(key)
    return await this.upstream.generatePublicUrl(targetKey)
  }

  async detectLivePhotos(allObjects?: StorageObject[]): Promise<Map<string, StorageObject>> {
    const upstreamObjects = allObjects ? this.toUpstreamObjects(allObjects) : undefined
    const sourceObjects = upstreamObjects ?? (await this.upstream.listAllFiles())
    const liveMap = await Promise.resolve(this.upstream.detectLivePhotos(sourceObjects))
    const result = new Map<string, StorageObject>()

    for (const [key, value] of liveMap.entries()) {
      const normalizedKey = this.stripEffectivePrefix(key)
      if (!normalizedKey) {
        continue
      }
      const normalizedValue: StorageObject = value?.key
        ? { ...value, key: this.stripEffectivePrefix(value.key) }
        : value
      result.set(normalizedKey, normalizedValue)
    }

    return result
  }

  async deleteFile(key: string): Promise<void> {
    const targetKey = this.prepareKeyForUpstream(key)
    await this.upstream.deleteFile(targetKey)
  }

  async uploadFile(key: string, data: Buffer, options?: StorageUploadOptions): Promise<StorageObject> {
    const targetKey = this.prepareKeyForUpstream(key)
    const uploaded = await this.upstream.uploadFile(targetKey, data, options)
    return this.normalizeResult(uploaded)
  }

  async moveFile(sourceKey: string, targetKey: string, options?: StorageUploadOptions): Promise<StorageObject> {
    const source = this.prepareKeyForUpstream(sourceKey)
    const target = this.prepareKeyForUpstream(targetKey)
    const moved = await this.upstream.moveFile(source, target, options)
    return this.normalizeResult(moved)
  }

  private prepareKeyForUpstream(key: string): string {
    const normalizedKey = this.normalizePath(key) ?? ''
    if (!this.needsManualPrefix) {
      return normalizedKey
    }

    return this.joinSegments(this.effectivePrefix, normalizedKey)
  }

  private toUpstreamObjects(objects: StorageObject[]): PrefixedStorageObject[] {
    return objects
      .map((obj) => {
        if (!obj.key) {
          return null
        }
        const upstreamKey = this.prepareKeyForUpstream(obj.key)
        return { ...obj, key: upstreamKey }
      })
      .filter((obj): obj is PrefixedStorageObject => obj !== null)
  }

  private normalizeResult<T extends StorageObject>(object: T): T {
    if (!object.key) {
      return object
    }
    const normalizedKey = this.stripEffectivePrefix(object.key)
    return { ...object, key: normalizedKey } as T
  }

  private normalizeResults(objects: StorageObject[]): StorageObject[] {
    return objects
      .map((obj) => {
        if (!obj.key) {
          return null
        }
        return this.normalizeResult(obj)
      })
      .filter((obj): obj is StorageObject => obj !== null)
  }

  private stripEffectivePrefix(rawKey: string): string {
    const normalizedKey = this.normalizePath(rawKey) ?? ''
    if (!this.effectivePrefix) {
      return normalizedKey
    }

    if (normalizedKey === this.effectivePrefix) {
      return ''
    }

    const prefixWithSlash = `${this.effectivePrefix}/`
    if (normalizedKey.startsWith(prefixWithSlash)) {
      return normalizedKey.slice(prefixWithSlash.length)
    }

    return normalizedKey
  }

  private normalizePath(value?: string | null): string | null {
    if (!value) {
      return null
    }
    const normalized = value
      .replaceAll('\\', '/')
      .replaceAll(/\/+/g, '/')
      .replaceAll(/^\/+|\/+$/g, '')
    return normalized.length > 0 ? normalized : null
  }

  private joinSegments(...segments: Array<string | null>): string {
    const filtered = segments.filter(Boolean)
    if (filtered.length === 0) {
      return ''
    }
    return filtered
      .map((segment) => segment.replaceAll(/^\/+|\/+$/g, ''))
      .filter(Boolean)
      .join('/')
  }

  private extractUpstreamBasePath(config: RemoteStorageConfig): string | null {
    switch (config.provider) {
      case 's3':
      case 'b2': {
        return this.normalizePath(config.prefix)
      }
      case 'github': {
        return this.normalizePath(config.path)
      }
      default: {
        return null
      }
    }
  }

  private applyTenantPrefix(config: RemoteStorageConfig, prefix: string): RemoteStorageConfig {
    const normalizedPrefix = this.normalizePath(prefix)
    if (!normalizedPrefix) {
      return config
    }

    switch (config.provider) {
      case 's3': {
        return { ...config, prefix: normalizedPrefix }
      }
      case 'b2': {
        return { ...config, prefix: normalizedPrefix }
      }
      case 'github': {
        return { ...config, path: normalizedPrefix }
      }
      default: {
        return config
      }
    }
  }
}

export function registerManagedStorageProvider(): void {
  StorageFactory.registerProvider('managed', (config) => new ManagedStorageProvider(config as ManagedStorageConfig), {
    category: 'remote',
  })
}
