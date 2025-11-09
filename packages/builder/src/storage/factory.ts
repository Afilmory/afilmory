import type { StorageConfig, StorageProvider } from './interfaces.js'

export type StorageProviderFactory<T extends StorageConfig = StorageConfig> = (config: T) => StorageProvider

export class StorageFactory {
  private static providers = new Map<string, StorageProviderFactory>()

  /**
   * Register or override a storage provider factory.
   */
  static registerProvider(provider: string, factory: StorageProviderFactory): void {
    StorageFactory.providers.set(provider, factory)
  }

  /**
   * 根据配置创建存储提供商实例
   * @param config 存储配置
   * @returns 存储提供商实例
   */
  static createProvider(config: StorageConfig): StorageProvider {
    const factory = StorageFactory.providers.get(config.provider)

    if (!factory) {
      throw new Error(`Unsupported storage provider: ${config.provider as string}`)
    }

    return factory(config)
  }

  static getRegisteredProviders(): string[] {
    return Array.from(StorageFactory.providers.keys())
  }
}
