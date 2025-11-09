# Afilmory Builder

这是照片库构建系统的核心模块，采用模块化设计，将不同功能分离到各自的模块中。

## 架构概览

```
src/core/
├── types/          # 类型定义
│   └── photo.ts    # 照片相关类型
├── logger/         # 日志系统
│   └── index.ts    # 统一日志器
├── s3/             # S3 存储操作
│   ├── client.ts   # S3 客户端配置
│   └── operations.ts # S3 操作（上传、下载、列表）
├── image/          # 图像处理
│   ├── processor.ts # 图像预处理和元数据
│   ├── blurhash.ts # Blurhash 生成
│   ├── thumbnail.ts # 缩略图生成
│   └── exif.ts     # EXIF 数据提取
├── photo/          # 照片处理
│   ├── info-extractor.ts # 照片信息提取
│   └── processor.ts # 照片处理主逻辑
├── manifest/       # Manifest 管理
│   └── manager.ts  # Manifest 读写和管理
├── worker/         # 并发处理
│   └── pool.ts     # Worker 池管理
├── builder/        # 主构建器
│   └── index.ts    # 构建流程编排
└── index.ts        # 模块入口
```

## 模块说明

### 1. 类型定义 (`types/`)

- `PhotoInfo`: 照片基本信息
- `ImageMetadata`: 图像元数据
- `PhotoManifestItem`: Manifest 项目
- `ProcessPhotoResult`: 处理结果
- `ThumbnailResult`: 缩略图生成结果

### 2. 日志系统 (`logger/`)

- 统一的日志管理
- 支持不同模块的标签化日志
- Worker 专用日志器

### 3. S3 存储操作 (`s3/`)

- **client.ts**: S3 客户端配置和连接
- **operations.ts**: 图片下载、列表获取、URL 生成

### 4. 图像处理 (`image/`)

- **processor.ts**: 图像预处理、HEIC 转换、元数据提取
- **blurhash.ts**: Blurhash 生成算法
- **thumbnail.ts**: 缩略图生成和管理
- **exif.ts**: EXIF 数据提取和清理

### 5. 照片处理 (`photo/`)

- **info-extractor.ts**: 从文件名和 EXIF 提取照片信息
- **processor.ts**: 照片处理主流程，整合所有处理步骤

### 6. Manifest 管理 (`manifest/`)

- **manager.ts**: Manifest 文件的读取、保存、更新检测

### 7. 并发处理 (`worker/`)

- **pool.ts**: Worker 池管理，支持并发处理

### 8. 主构建器 (`builder/`)

- **index.ts**: 整个构建流程的编排和协调

## 使用方式

### 基本使用

```typescript
import { buildManifest } from './src/core/index.js'

await buildManifest({
  isForceMode: false,
  isForceManifest: false,
  isForceThumbnails: false,
  concurrencyLimit: 10,
})
```

### 单独使用模块

```typescript
import { getImageFromS3, generateThumbnailAndBlurhash, extractExifData } from './src/core/index.js'

// 下载图片
const buffer = await getImageFromS3('path/to/image.jpg')

// 生成缩略图
const result = await generateThumbnailAndBlurhash(buffer, 'photo-id', 1920, 1080)

// 提取 EXIF
const exif = await extractExifData(buffer)
```

## 特性

### 1. 模块化设计

- 每个功能模块独立，便于测试和维护
- 清晰的依赖关系
- 易于扩展新功能

### 2. 类型安全

- 完整的 TypeScript 类型定义
- 编译时错误检查

### 3. 性能优化

- Worker 池并发处理
- Sharp 实例复用
- 增量更新支持

### 4. 错误处理

- 统一的错误处理机制
- 详细的日志记录
- 优雅的失败处理

### 5. 配置灵活

- 支持多种运行模式
- 可配置的并发数
- 环境变量配置

## 扩展指南

### 添加新的图像处理功能

1. 在 `image/` 目录下创建新模块
2. 在 `index.ts` 中导出新功能
3. 在 `photo/processor.ts` 中集成

### 添加新的存储后端

1. 在 `s3/` 目录下创建新的操作模块
2. 实现相同的接口
3. 在配置中切换

### 自定义日志器

```typescript
import { logger } from './src/core/index.js'

const customLogger = logger.worker(1).withTag('CUSTOM')
customLogger.info('自定义日志')
```

## 性能考虑

- 使用 Worker 池避免过度并发
- Sharp 实例复用减少内存开销
- 增量更新减少不必要的处理
- 缩略图和 Blurhash 缓存复用
