import type { StorageProviderFieldDefinition, StorageProviderType } from './types'

export const STORAGE_SETTING_KEYS = {
  providers: 'builder.storage.providers',
  activeProvider: 'builder.storage.activeProvider',
} as const

export const STORAGE_PROVIDER_TYPES: readonly StorageProviderType[] = ['s3', 'github']

export const STORAGE_PROVIDER_TYPE_OPTIONS: ReadonlyArray<{
  value: StorageProviderType
  label: string
}> = [
  { value: 's3', label: 'S3 / 兼容对象存储' },
  { value: 'github', label: 'GitHub 仓库' },
]

export const STORAGE_PROVIDER_FIELD_DEFINITIONS: Record<
  StorageProviderType,
  readonly StorageProviderFieldDefinition[]
> = {
  s3: [
    {
      key: 'bucket',
      label: 'Bucket 名称',
      placeholder: 'afilmory-photos',
      description: 'S3 存储桶名称，用于读取图片文件。',
    },
    {
      key: 'region',
      label: '区域 (Region)',
      placeholder: 'ap-southeast-1',
      description: 'S3 区域代码，例如 ap-southeast-1。',
    },
    {
      key: 'endpoint',
      label: '自定义 Endpoint',
      placeholder: 'https://s3.example.com',
      description: '可选，S3 兼容服务的自定义 Endpoint 地址。',
      helper: '对于 AWS 官方 S3 可留空；MinIO 等第三方服务需要填写。',
    },
    {
      key: 'accessKeyId',
      label: 'Access Key ID',
      placeholder: 'AKIAxxxxxxxxxxxx',
    },
    {
      key: 'secretAccessKey',
      label: 'Secret Access Key',
      placeholder: '************',
      sensitive: true,
    },
    {
      key: 'prefix',
      label: '文件前缀',
      placeholder: 'photos/',
      description: '可选，仅访问指定前缀下的文件。',
    },
    {
      key: 'customDomain',
      label: '自定义访问域名',
      placeholder: 'https://cdn.example.com',
      description: '设置公开访问照片时使用的自定义域名。',
    },
    {
      key: 'excludeRegex',
      label: '排除规则 (正则)',
      placeholder: '\\.(tmp|bak)$',
      description: '可选，排除不需要的文件。',
      multiline: true,
      helper: '正则表达式需符合 JavaScript 语法。',
    },
    {
      key: 'maxFileLimit',
      label: '最大文件数量',
      placeholder: '1000',
      description: '可选，为扫描过程设置最大文件数量限制。',
    },
  ],
  github: [
    {
      key: 'owner',
      label: '仓库 Owner',
      placeholder: 'afilmory',
      description: 'GitHub 仓库的拥有者（用户或组织名称）。',
    },
    {
      key: 'repo',
      label: '仓库名称',
      placeholder: 'photo-assets',
      description: '存储照片的仓库名称。',
    },
    {
      key: 'branch',
      label: '分支',
      placeholder: 'main',
      description: '可选，指定需要同步的分支。',
      helper: '默认 master/main，如需其它分支请填写完整名称。',
    },
    {
      key: 'token',
      label: '访问令牌',
      placeholder: 'ghp_xxxxxxxxxxxxxxxxxxxx',
      description: '用于访问私有仓库的 GitHub Personal Access Token。',
      sensitive: true,
    },
    {
      key: 'path',
      label: '仓库路径',
      placeholder: 'public/photos',
      description: '可选，仅同步仓库中的特定路径。',
    },
    {
      key: 'useRawUrl',
      label: '使用 Raw URL',
      placeholder: 'true / false',
      description: '是否使用 raw.githubusercontent.com 生成公开访问链接。',
      helper: '使用自定义域名则可填写 false。',
    },
  ],
}
