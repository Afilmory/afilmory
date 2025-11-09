# 存储提供商

本目录包含各种存储服务的具体实现。

## S3 存储提供商

支持 AWS S3 和兼容 S3 API 的存储服务（如 MinIO、阿里云 OSS 等）。

### 配置示例

```typescript
const s3Config: StorageConfig = {
  provider: 's3',
  bucket: 'my-bucket',
  region: 'us-east-1',
  endpoint: 'https://s3.amazonaws.com',
  accessKeyId: 'your-access-key',
  secretAccessKey: 'your-secret-key',
  prefix: 'photos/',
  customDomain: 'https://cdn.example.com',
}
```

## GitHub 存储提供商

将照片存储在 GitHub 仓库中，利用 GitHub 的免费存储空间和全球 CDN。

### 特点

- ✅ 免费存储空间（GitHub 仓库限制为 1GB）
- ✅ 全球 CDN 支持
- ✅ 版本控制
- ✅ 公开访问（通过 raw.githubusercontent.com）
- ✅ 支持私有仓库（需要访问令牌）
- ⚠️ GitHub API 有请求频率限制
- ⚠️ 不适合大量文件或频繁更新

### 配置示例

```typescript
const githubConfig: StorageConfig = {
  provider: 'github',
  owner: 'your-username', // GitHub 用户名或组织名
  repo: 'photo-gallery', // 仓库名称
  branch: 'main', // 分支名称（可选，默认 'main'）
  token: 'ghp_xxxxxxxxxxxx', // GitHub 访问令牌（可选）
  path: 'photos', // 照片存储路径（可选）
  useRawUrl: true, // 使用 raw.githubusercontent.com（默认 true）
}
```

### 设置步骤

1. **创建 GitHub 仓库**

   ```bash
   # 创建新仓库（或使用现有仓库）
   git clone https://github.com/your-username/photo-gallery.git
   cd photo-gallery
   mkdir photos
   ```

2. **获取 GitHub 访问令牌**（可选，但推荐）
   - 访问 GitHub Settings > Developer settings > Personal access tokens
   - 创建新的 Fine-grained personal access token
   - 选择你的仓库
   - 赋予 "Contents" 权限（读写）

3. **配置环境变量**

   ```bash
   export GITHUB_TOKEN="ghp_xxxxxxxxxxxx"
   ```

4. **更新配置文件**
   ```typescript
   // builder.config.ts
   export const builderConfig: BuilderConfig = {
     ...defaultBuilderConfig,
     storage: {
       provider: 'github',
       owner: 'your-username',
       repo: 'photo-gallery',
       branch: 'main',
       token: process.env.GITHUB_TOKEN,
       path: 'photos',
       useRawUrl: true,
     },
   }
   ```

### 使用示例

```typescript
import { GitHubStorageProvider } from '@/core/storage'

const githubProvider = new GitHubStorageProvider({
  provider: 'github',
  owner: 'octocat',
  repo: 'Hello-World',
  branch: 'main',
  token: 'your-token',
  path: 'images',
})

// 获取文件
const buffer = await githubProvider.getFile('sunset.jpg')

// 列出所有图片
const images = await githubProvider.listImages()

// 生成公共 URL
const url = githubProvider.generatePublicUrl('sunset.jpg')
// 结果：https://raw.githubusercontent.com/octocat/Hello-World/main/images/sunset.jpg
```

### API 限制

GitHub API 有以下限制：

- **未认证请求**: 60 requests/hour/IP
- **认证请求**: 5,000 requests/hour/token
- **文件大小**: 最大 100MB（通过 API）
- **仓库大小**: 建议不超过 1GB

### 最佳实践

1. **使用访问令牌**: 提高 API 请求限制
2. **合理组织目录结构**: 便于管理和访问
3. **定期清理**: 删除不需要的文件以节省空间
4. **监控 API 使用**: 避免超出请求限制
5. **考虑文件大小**: 对于大文件，考虑使用其他存储服务

### 错误处理

GitHub 存储提供商会处理以下错误：

- **404 Not Found**: 文件或仓库不存在
- **403 Forbidden**: 权限不足或 API 限制
- **422 Unprocessable Entity**: 请求格式错误
- **500+ Server Error**: GitHub 服务器错误

## 本地存储提供商

将照片存储在本地文件系统中，适合开发环境或私有部署。

### 特点

- ✅ 无需外部依赖
- ✅ 快速访问速度
- ✅ 完全私有控制
- ✅ 支持递归目录扫描
- ✅ 支持 Live Photos 检测
- ⚠️ 需要确保文件系统权限
- ⚠️ 不适合分布式部署

### 配置示例

```typescript
const localConfig: StorageConfig = {
  provider: 'local',
  basePath: './photos', // 本地照片存储路径（相对或绝对路径）
  baseUrl: 'http://localhost:3000/photos', // 可选：用于生成公共 URL
  /**
   * 可选：将 basePath 下的文件复制到发布目录，用于静态托管
   * - 支持绝对/相对路径（相对路径相对于项目根目录解析）
   * - 注意：会覆盖目标目录下的同名文件
   *
   * 如果你使用了下面的配置，你可以将 baseUrl 配置为 '/originals/' 以匹配前端访问路径。
   */
  distPath: './apps/web/public/originals',
  excludeRegex: '\\.(tmp|cache)$', // 可选：排除文件的正则表达式
  maxFileLimit: 1000, // 可选：最大文件数量限制
}
```

### 路径配置

- **相对路径**: 相对于项目根目录，如 `./photos`、`../images`
- **绝对路径**: 完整的文件系统路径，如 `/home/user/photos`、`C:\\Photos`
- **distPath 解析**: 若配置了 `distPath`，同样支持相对/绝对路径；相对路径将以项目根目录为基准进行解析。

### 使用示例

```typescript
import { LocalStorageProvider } from '@/core/storage'

const localProvider = new LocalStorageProvider({
  provider: 'local',
  basePath: './photos',
  baseUrl: 'http://localhost:3000/photos',
  // 可选：在初始化时自动将 basePath 的内容复制到 distPath（会覆盖同名文件）
  distPath: './apps/web/public/photos',
})

// 获取文件
const buffer = await localProvider.getFile('sunset.jpg')

// 列出所有图片
const images = await localProvider.listImages()

// 生成公共 URL
const url = localProvider.generatePublicUrl('sunset.jpg')
// 结果：http://localhost:3000/photos/sunset.jpg

// 检查存储路径
const exists = await localProvider.checkBasePath()
if (!exists) {
  await localProvider.ensureBasePath()
}
```

### 目录结构示例

```
photos/
├── 2024/
│   ├── 01-january/
│   │   ├── IMG_001.jpg
│   │   ├── IMG_001.mov  # Live Photo 视频
│   │   └── IMG_002.heic
│   └── 02-february/
│       └── sunset.jpg
├── 2023/
│   └── vacation/
│       ├── beach.jpg
│       └── mountain.png
└── misc/
    └── screenshot.png
```

### 最佳实践

1. **权限管理**: 确保应用有读取照片目录的权限
2. **路径安全**: 避免使用包含特殊字符的路径
3. **性能优化**: 对于大量文件，考虑使用 `maxFileLimit` 限制
4. **备份策略**: 定期备份重要照片文件
5. **监控空间**: 监控磁盘空间使用情况

### 发布目录复制（distPath）

- 启用 `distPath` 后，提供商会在实例化时将 `basePath` 下的所有文件复制到目标发布目录。
- 复制为增量覆盖模式：目标目录中同名文件会被覆盖，请谨慎使用。
- 适合将本地图片同步到前端应用的静态目录（如 `apps/web/public/photos`），便于直接通过静态资源服务器或 CDN 提供访问。
- 建议在构建阶段使用，避免在高并发运行态频繁触发大规模复制。

### 开发环境配置

对于开发环境，推荐使用相对路径：

```json
{
  "storage": {
    "provider": "local",
    "basePath": "./dev-photos",
    "baseUrl": "http://localhost:1924/photos",
    "distPath": "./apps/web/public/photos"
  }
}
```

### 生产环境配置

对于生产环境，推荐使用绝对路径：

```json
{
  "storage": {
    "provider": "local",
    "basePath": "/var/www/photos",
    "baseUrl": "https://yourdomain.com/photos",
    "distPath": "/var/www/site/public/photos",
    "excludeRegex": "\\.(tmp|cache|DS_Store)$",
    "maxFileLimit": 5000
  }
}
```

### 与其他提供商的对比

| 特性       | S3       | GitHub         |
| ---------- | -------- | -------------- |
| 存储空间   | 按需付费 | 1GB 免费       |
| CDN        | 额外付费 | 免费全球 CDN   |
| API 限制   | 很高     | 有限制         |
| 适用场景   | 生产环境 | 小型项目、演示 |
| 设置复杂度 | 中等     | 简单           |

选择存储提供商时，请根据你的具体需求和预算进行选择。

## Eagle 存储提供商

直接读取 Eagle 桌面应用生成的素材库，并在构建时将所需图片复制到指定目录。

### 特点

- ✅ 方便管理：直接在已有 Eagle 素材库中管理图片
- ✅ 多条件筛选：支持按文件夹（含子文件夹）或标签过滤
- ✅ 自动复制：首次访问时自动复制原图到发布目录
- ⚠️ 需自行托管筛选出的图片文件

### 配置示例

```typescript
import type { EagleConfig } from '@afilmory/builder'

const eagleConfig: EagleConfig = {
  provider: 'eagle',
  libraryPath: '/Users/alice/Pictures/Eagle.library',
  distPath: '/Users/alice/workspaces/afilmory/apps/web/public/originals',
  baseUrl: '/originals/',
  include: [
    { type: 'folder', name: '精选', includeSubfolder: true },
    { type: 'tag', name: 'Published' },
  ],
  exclude: [{ type: 'tag', name: 'Private' }],
  folderAsTag: true,
  omitTagNamesInMetadata: ['Temp'],
}
```

### 设置步骤

1. **定位 Eagle 素材库**：找到 Eagle 「库位置」，复制完整路径。
2. **准备 distPath**：指定一个绝对路径，默认为 `apps/web/public/originals` 或自定义静态资源目录。
3. **调整访问 URL**：设置 `baseUrl` 以匹配前端访问路径（默认 `/originals/`）。
4. **定义筛选规则（可选）**：通过 `include` 与 `exclude` 精确控制导出范围。

### 规则说明

- `include` 为空时表示包含库内所有支持格式的图片。
- `exclude` 优先级高于 `include`，命中后即排除。
- `folder` 规则的 `name` 仅填写文件夹名称；勾选 `includeSubfolder` 可递归包含子目录。
- `tag` 规则将与 Eagle 标签匹配，大小写敏感。

### 使用示例

```typescript
import { EagleStorageProvider } from '@/core/storage'

const provider = new EagleStorageProvider(eagleConfig)

const files = await provider.listImages()
const buffer = await provider.getFile(files[0].key)
const publicUrl = await provider.generatePublicUrl(files[0].key)
```

首次生成公共 URL 时，提供商会将原图复制到 `distPath`，后续则复用已存在文件。

### 常见问题

- **路径错误**：`libraryPath` 或 `distPath` 不是绝对路径会导致实例化失败。
- **版本兼容**：若检测到非 4.x 版本，会输出告警，建议升级 Eagle。
- **不支持的格式**：仅处理 `SUPPORTED_FORMATS` 中列出的扩展名（与其它提供商一致）。
- **权限限制**：确保进程具备对素材库与目标目录的读写权限。
