// 导出接口
export type { ProgressCallback, ScanProgress, StorageConfig, StorageObject, StorageProvider } from './interfaces.js'

// 导出工厂类
export type { StorageProviderFactory } from './factory.js'
export { StorageFactory } from './factory.js'

// 导出管理器
export { StorageManager } from './manager.js'

// 导出具体提供商（如果需要直接使用）
export { EagleStorageProvider } from './providers/eagle-provider.js'
export { GitHubStorageProvider } from './providers/github-provider.js'
export { LocalStorageProvider } from './providers/local-provider.js'
export { S3StorageProvider } from './providers/s3-provider.js'
