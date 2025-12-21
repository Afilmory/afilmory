import path from 'node:path'

import { SUPPORTED_FORMATS,THREE_D_SCENE_EXTENSIONS } from '../constants/index.js'
import { StorageFactory } from './factory.js'
import type {
  StorageConfig,
  StorageObject,
  StorageProvider,
  StorageUploadOptions,
  StorageUploadProgress,
  StorageUploadProgressHandler,
} from './interfaces.js'

export class StorageManager {
  protected provider: StorageProvider
  protected currentConfig: StorageConfig
  private readonly excludeFilters: Array<(key: string) => boolean> = []
  private uploadObserver?: StorageUploadProgressHandler

  constructor(config: StorageConfig) {
    this.provider = StorageFactory.createProvider(config)
    this.currentConfig = config
  }

  setUploadObserver(observer?: StorageUploadProgressHandler): void {
    this.uploadObserver = observer
  }

  clearUploadObserver(): void {
    this.uploadObserver = undefined
  }

  private createProgressPipeline(
    localHandler?: StorageUploadProgressHandler,
  ): StorageUploadProgressHandler | undefined {
    if (!localHandler && !this.uploadObserver) {
      return undefined
    }

    return async (event: StorageUploadProgress) => {
      const provider = event.provider ?? this.currentConfig?.provider
      const enriched: StorageUploadProgress = provider ? { ...event, provider } : event
      if (localHandler) {
        await localHandler(enriched)
      }
      if (this.uploadObserver) {
        await this.uploadObserver(enriched)
      }
    }
  }

  private applyExcludes<T extends StorageObject>(objects: T[]): T[] {
    if (this.excludeFilters.length === 0) {
      return objects
    }

    return objects.filter((obj) => {
      const { key } = obj
      if (!key) return true
      return !this.excludeFilters.some((filter) => filter(key))
    })
  }

  /**
   * 从存储中获取文件
   * @param key 文件的键值/路径
   * @param logger 可选的日志记录器
   * @returns 文件的 Buffer 数据，如果不存在则返回 null
   */
  async getFile(key: string): Promise<Buffer | null> {
    return this.provider.getFile(key)
  }

  /**
   * 列出存储中的所有图片文件
   * @returns 图片文件对象数组
   */
  async listImages(): Promise<StorageObject[]> {
    const objects = await this.provider.listImages()
    return this.applyExcludes(objects)
  }

  /**
   * 列出存储中的所有文件
   * @returns 所有文件对象数组
   */
  async listAllFiles(): Promise<StorageObject[]> {
    const objects = await this.provider.listAllFiles()
    return this.applyExcludes(objects)
  }

  /**
   * 生成文件的公共访问 URL
   * @param key 文件的键值/路径
   * @returns 公共访问 URL
   */
  async generatePublicUrl(key: string): Promise<string> {
    return this.provider.generatePublicUrl(key)
  }

  /**
   * 检测 Live Photos 配对
   * @param allObjects 所有文件对象（可选，如果不提供则自动获取）
   * @returns Live Photo 配对映射 (图片 key -> 视频对象)
   */
  async detectLivePhotos(allObjects?: StorageObject[]): Promise<Map<string, StorageObject>> {
    const sourceObjects = allObjects ?? (await this.provider.listAllFiles())
    const filtered = this.applyExcludes(sourceObjects)
    return this.provider.detectLivePhotos(filtered)
  }

  /**
   * 检测 3D Gaussian Splat 资源（.sog）
   * @param allObjects 可选的文件列表
   * @returns 图片 key -> 3D 场景文件 的映射
   */
  async detectThreeDScenes(allObjects?: StorageObject[]): Promise<Map<string, StorageObject>> {
    const sourceObjects = allObjects ?? (await this.provider.listAllFiles())
    const filtered = this.applyExcludes(sourceObjects)
    const result = new Map<string, StorageObject>()
    const groups = new Map<
      string,
      {
        image?: StorageObject
        scene?: StorageObject
      }
    >()

    for (const obj of filtered) {
      const {key} = obj
      if (!key) continue
      const normalized = key.replaceAll('\\', '/')
      const ext = path.posix.extname(normalized).toLowerCase()
      const parsed = path.posix.parse(normalized)
      const groupKey = parsed.dir ? `${parsed.dir}/${parsed.name}` : parsed.name
      const group = groups.get(groupKey) ?? {}

      if (SUPPORTED_FORMATS.has(ext)) {
        group.image = obj
      } else if (THREE_D_SCENE_EXTENSIONS.has(ext)) {
        group.scene = obj
      }

      groups.set(groupKey, group)
    }

    for (const value of groups.values()) {
      if (value.image?.key && value.scene) {
        result.set(value.image.key, value.scene)
      }
    }

    return result
  }

  async deleteFile(key: string): Promise<void> {
    await this.provider.deleteFile(key)
  }

  async deleteFolder(prefix: string): Promise<void> {
    await this.provider.deleteFolder(prefix)
  }

  async uploadFile(key: string, data: Buffer, options?: StorageUploadOptions): Promise<StorageObject> {
    const bytes = data?.byteLength ?? 0
    const progressHandler = this.createProgressPipeline(options?.onProgress)
    const providerOptions = progressHandler ? { ...options, onProgress: progressHandler } : options

    if (progressHandler) {
      await progressHandler({
        key,
        status: 'start',
        size: bytes || undefined,
        bytesUploaded: bytes || undefined,
        totalBytes: bytes || undefined,
      })
    }
    const startedAt = Date.now()

    try {
      const uploaded = await this.provider.uploadFile(key, data, providerOptions)
      const elapsedMs = Date.now() - startedAt
      const resolvedSize = uploaded.size ?? (bytes || undefined)
      if (progressHandler) {
        await progressHandler({
          key,
          status: 'complete',
          size: resolvedSize,
          elapsedMs,
        })
      }
      return uploaded
    } catch (error) {
      if (progressHandler) {
        await progressHandler({
          key,
          status: 'error',
          error,
        })
      }
      throw error
    }
  }

  async moveFile(sourceKey: string, targetKey: string, options?: StorageUploadOptions): Promise<StorageObject> {
    if (!sourceKey || !targetKey) {
      throw new Error('moveFile requires both sourceKey and targetKey')
    }

    if (sourceKey === targetKey) {
      const buffer = await this.provider.getFile(sourceKey)
      if (!buffer) {
        throw new Error(`moveFile failed: source ${sourceKey} does not exist`)
      }
      return {
        key: targetKey,
        size: buffer.length,
        lastModified: new Date(),
      }
    }

    if (typeof this.provider.moveFile === 'function') {
      return await this.provider.moveFile(sourceKey, targetKey, options)
    }

    // Fallback: download, upload, delete
    const fileBuffer = await this.provider.getFile(sourceKey)
    if (!fileBuffer) {
      throw new Error(`moveFile failed: source ${sourceKey} does not exist`)
    }
    const uploaded = await this.provider.uploadFile(targetKey, fileBuffer, options)
    try {
      await this.provider.deleteFile(sourceKey)
    } catch (error) {
      try {
        await this.provider.deleteFile(targetKey)
      } catch {
        // ignore rollback error, rethrow original failure
      }
      throw error
    }
    return uploaded
  }

  addExcludeFilter(filter: (key: string) => boolean): void {
    this.excludeFilters.push(filter)
  }

  addExcludePrefix(prefix: string): void {
    const normalized = prefix.replaceAll('\\', '/').replace(/^\/+/, '')
    if (!normalized) {
      return
    }

    const effectivePrefix = normalized.endsWith('/') ? normalized : `${normalized}/`
    this.addExcludeFilter((key) => key.startsWith(effectivePrefix))
  }

  /**
   * 获取当前使用的存储提供商
   * @returns 存储提供商实例
   */
  getProvider(): StorageProvider {
    return this.provider
  }

  /**
   * 切换存储提供商
   * @param config 新的存储配置
   */
  switchProvider(config: StorageConfig): void {
    this.provider = StorageFactory.createProvider(config)
    this.currentConfig = config
  }
}
