import { StorageFactory } from './factory.js'
import type { StorageConfig, StorageObject, StorageProvider, StorageUploadOptions } from './interfaces.js'

export class StorageManager {
  private provider: StorageProvider
  private readonly excludeFilters: Array<(key: string) => boolean> = []

  constructor(config: StorageConfig) {
    this.provider = StorageFactory.createProvider(config)
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

  async deleteFile(key: string): Promise<void> {
    await this.provider.deleteFile(key)
  }

  async uploadFile(key: string, data: Buffer, options?: StorageUploadOptions): Promise<StorageObject> {
    return await this.provider.uploadFile(key, data, options)
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
  }
}
