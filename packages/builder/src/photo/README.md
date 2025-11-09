# 照片处理模块

这个模块包含了照片处理的核心逻辑，采用了模块化设计，将不同的处理逻辑分离到不同的文件中。

## 模块结构

### 核心文件

- **`processor.ts`** - 主要的照片处理入口点
- **`image-pipeline.ts`** - 图片处理管道，整合所有处理步骤
- **`cache-manager.ts`** - 缓存管理，处理缩略图、EXIF、影调分析等数据的复用
- **`live-photo-handler.ts`** - Live Photo 检测和处理
- **`logger-adapter.ts`** - Logger 适配器，实现适配器模式
- **`info-extractor.ts`** - 照片信息提取

### 设计模式

#### 适配器模式 (Adapter Pattern)

使用适配器模式来统一不同的 Logger 接口：

```typescript
// 通用 Logger 接口
interface PhotoLogger {
  info(message: string, ...args: any[]): void
  warn(message: string, ...args: any[]): void
  error(message: string, error?: any): void
  success(message: string, ...args: any[]): void
}

// 适配器实现
class CompatibleLoggerAdapter implements PhotoLogger {
  // 既实现通用接口，又兼容原有的 ConsolaInstance
}
```

#### 管道模式 (Pipeline Pattern)

图片处理采用管道模式，按步骤处理：

1. 预处理图片数据
2. 创建 Sharp 实例
3. 处理缩略图和 blurhash
4. 处理 EXIF 数据
5. 处理影调分析
6. 提取照片信息
7. 处理 Live Photo
8. 构建照片清单项

### 主要改进

1. **模块化分离**: 将不同的处理逻辑分离到专门的模块中
2. **Logger 适配器**: 使用异步执行上下文管理 logger，避免全局状态污染
3. **缓存管理**: 统一管理各种数据的缓存和复用逻辑
4. **Live Photo 处理**: 专门的模块处理 Live Photo 检测和匹配
5. **类型安全**: 完善的 TypeScript 类型定义

### 使用方法

#### 基本使用

```typescript
import { processPhoto, createPhotoProcessingLoggers } from './index.js'

const loggers = createPhotoProcessingLoggers(workerId, baseLogger)

const result = await processPhoto(
  obj,
  index,
  workerId,
  totalImages,
  existingManifestMap,
  livePhotoMap,
  options,
  builder,
  pluginRuntime,
)
```

#### 单独使用各个模块

```typescript
import { processLivePhoto, processThumbnailAndBlurhash, processExifData } from './index.js'

// Live Photo 处理
const livePhotoResult = processLivePhoto(photoKey, livePhotoMap, builder.getStorageManager())

// 缩略图处理
const thumbnailResult = await processThumbnailAndBlurhash(imageBuffer, photoId, width, height, existingItem, options)

// EXIF 处理
const exifData = await processExifData(imageBuffer, rawImageBuffer, photoKey, existingItem, options)
```

### 扩展性

新的模块化设计使得扩展新功能变得更加容易：

1. 添加新的处理步骤只需要在管道中插入新的函数
2. 添加新的缓存类型只需要扩展 `cache-manager.ts`
3. 添加新的 Logger 适配器只需要实现 `PhotoLogger` 接口

### 性能优化

1. **缓存复用**: 智能复用现有的缩略图、EXIF、影调分析数据
2. **Sharp 实例复用**: 在处理管道中复用 Sharp 实例
3. **条件处理**: 只在需要时处理特定的数据类型
