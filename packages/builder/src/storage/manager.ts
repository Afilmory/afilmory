import type { Logger } from '../logger/index.js'
import { StorageFactory } from './factory.js'
import type {
  StorageConfig,
  StorageObject,
  StorageProvider,
} from './interfaces.js'

export class StorageManager {
  private provider: StorageProvider

  constructor(config: StorageConfig) {
    this.provider = StorageFactory.createProvider(config)
  }

  /**
   * 从存储中获取文件
   * @param key 文件的键值/路径
   * @param logger 可选的日志记录器
   * @returns 文件的 Buffer 数据，如果不存在则返回 null
   */
  async getFile(key: string, logger?: Logger['s3']): Promise<Buffer | null> {
    return this.provider.getFile(key, logger)
  }

  /**
   * 列出存储中的所有图片文件
   * @returns 图片文件对象数组
   */
  async listImages(): Promise<StorageObject[]> {
    return this.provider.listImages()
  }

  /**
   * 列出存储中的所有文件
   * @returns 所有文件对象数组
   */
  async listAllFiles(): Promise<StorageObject[]> {
    return this.provider.listAllFiles()
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
  async detectLivePhotos(
    allObjects?: StorageObject[],
  ): Promise<Map<string, StorageObject>> {
    const objects = allObjects || (await this.listAllFiles())
    return this.provider.detectLivePhotos(objects)
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
