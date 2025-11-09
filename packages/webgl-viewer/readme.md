# WebGL Image Viewer

一个高性能的WebGL图片查看器React组件，支持超高分辨率图片的流畅缩放、平移和硬件加速渲染。

## ✨ 特性

- 🚀 **硬件加速**: 基于WebGL的GPU渲染，提供极致性能
- 🖼️ **高分辨率支持**: 支持任意尺寸的图片，智能纹理管理
- 📱 **跨平台兼容**: 支持桌面和移动设备的鼠标、触摸操作
- 🎨 **平滑动画**: 物理感的缓动动画，提供流畅的用户体验
- ⚡ **性能优化**: 渲染节流、防抖更新、内存管理
- 🔧 **高度可配置**: 丰富的配置选项和回调函数
- 🐛 **调试支持**: 内置调试模式，方便开发和优化
- ✅ **完全可用**: 所有功能已实现并通过构建测试

## 📦 安装

```bash
npm install @afilmory/webgl-viewer
# 或
yarn add @afilmory/webgl-viewer
# 或
pnpm add @afilmory/webgl-viewer
```

## 🚀 快速开始

```tsx
import React from 'react'
import { WebGLImageViewer } from '@afilmory/webgl-viewer'

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <WebGLImageViewer
        src="/path/to/your/image.jpg"
        className="image-viewer"
        onZoomChange={(originalScale, relativeScale) => {
          console.log('Zoom changed:', { originalScale, relativeScale })
        }}
      />
    </div>
  )
}
```

## 📁 项目架构

重构后的项目采用模块化架构，每个文件都有明确的职责：

```
src/
├── index.ts                    # 主入口文件，导出所有公共API
├── types.ts                   # TypeScript类型定义
├── constants.ts               # 常量配置和默认值
├── utils.ts                   # 工具函数集合
├── shaders.ts                 # WebGL着色器代码
├── DebugInfo.tsx             # 调试信息React组件
├── WebGLImageViewer.tsx      # 主要的React组件
├── WebGLImageViewerEngine.ts # 完整的WebGL引擎实现
└── example.tsx               # 使用示例
```

### 🏗️ 架构设计

#### **单一职责原则**

- `types.ts`: 完整的TypeScript类型定义和接口
- `constants.ts`: 所有配置常量和默认值
- `utils.ts`: 纯函数工具集，包含数学计算、设备检测等
- `shaders.ts`: WebGL着色器源代码和编译工具
- `DebugInfo.tsx`: 独立的调试信息显示组件
- `WebGLImageViewer.tsx`: React组件包装器，处理生命周期
- `WebGLImageViewerEngine.ts`: 核心WebGL引擎，包含所有功能实现

#### **完整功能实现**

- ✅ WebGL渲染管线完整实现
- ✅ 图像加载和纹理管理
- ✅ 鼠标和触摸事件处理
- ✅ 平滑动画系统
- ✅ 缩放和平移约束
- ✅ 调试信息实时显示
- ✅ 内存管理和资源清理
- ✅ TypeScript类型安全

## 🎯 核心功能

### 交互支持

- **鼠标操作**: 拖拽平移、滚轮缩放、双击切换
- **触摸操作**: 单指拖拽、双指缩放、双击放大
- **键盘操作**: 可扩展的键盘快捷键支持

### 动画系统

- **平滑缓动**: 使用四次方缓出函数
- **可配置时长**: 支持自定义动画时间
- **性能优化**: 60fps渲染节流控制

### 约束系统

- **边界限制**: 可选的图像边界约束
- **缩放限制**: 可配置的最小/最大缩放比例
- **智能居中**: 自动适应屏幕尺寸

## 📚 API 文档

### 基础属性

| 属性           | 类型     | 默认值   | 描述         |
| -------------- | -------- | -------- | ------------ |
| `src`          | `string` | **必需** | 图片源URL    |
| `className`    | `string` | `""`     | CSS类名      |
| `initialScale` | `number` | `1`      | 初始缩放比例 |
| `minScale`     | `number` | `0.1`    | 最小缩放比例 |
| `maxScale`     | `number` | `10`     | 最大缩放比例 |

### 交互配置

```tsx
// 滚轮配置
wheel?: {
  step: number              // 缩放步长，默认 0.1
  wheelDisabled?: boolean   // 禁用滚轮，默认 false
  touchPadDisabled?: boolean // 禁用触控板，默认 false
}

// 双指缩放配置
pinch?: {
  step: number             // 缩放步长，默认 0.5
  disabled?: boolean       // 禁用双指缩放，默认 false
}

// 双击配置
doubleClick?: {
  step: number            // 缩放步长，默认 2
  disabled?: boolean      // 禁用双击，默认 false
  mode: 'toggle' | 'zoom' // 双击模式，默认 'toggle'
  animationTime: number   // 动画时长，默认 200ms
}

// 拖拽配置
panning?: {
  disabled?: boolean        // 禁用拖拽，默认 false
  velocityDisabled?: boolean // 禁用惯性，默认 true
}
```

### 回调函数

```tsx
// 缩放变化回调
onZoomChange?: (originalScale: number, relativeScale: number) => void

// 图片复制完成回调
onImageCopied?: () => void
```

### 组件引用方法

```tsx
const viewerRef = useRef<WebGLImageViewerRef>(null)

// 可用方法
viewerRef.current?.zoomIn(true) // 放大（可选动画）
viewerRef.current?.zoomOut(false) // 缩小（可选动画）
viewerRef.current?.resetView() // 重置视图
viewerRef.current?.getScale() // 获取当前缩放比例
```

## 🎮 使用示例

### 基础使用

```tsx
<WebGLImageViewer src="https://example.com/image.jpg" initialScale={1} centerOnInit={true} />
```

### 高级配置

```tsx
<WebGLImageViewer
  src="https://example.com/large-image.jpg"
  minScale={0.1}
  maxScale={20}
  wheel={{ step: 0.05 }}
  doubleClick={{
    mode: 'zoom',
    step: 1.5,
    animationTime: 300,
  }}
  onZoomChange={(original, relative) => {
    console.log(`Zoom: ${relative.toFixed(2)}x`)
  }}
  debug={process.env.NODE_ENV === 'development'}
/>
```

### 使用引用控制

```tsx
function ControlledViewer() {
  const viewerRef = useRef<WebGLImageViewerRef>(null)

  return (
    <>
      <WebGLImageViewer ref={viewerRef} src="/image.jpg" />
      <div>
        <button onClick={() => viewerRef.current?.zoomIn(true)}>放大</button>
        <button onClick={() => viewerRef.current?.zoomOut(true)}>缩小</button>
        <button onClick={() => viewerRef.current?.resetView()}>重置</button>
      </div>
    </>
  )
}
```

## 🐛 调试功能

启用 `debug={true}` 可显示实时调试信息：

- **缩放信息**: 当前缩放比例和相对比例
- **位置信息**: X/Y轴平移量
- **Canvas信息**: 画布尺寸和设备像素比
- **图像信息**: 原始图像尺寸
- **性能信息**: WebGL最大纹理尺寸等

```tsx
<WebGLImageViewer
  src="/image.jpg"
  debug={true} // 显示调试面板
/>
```

## ⚡ 性能特性

### 渲染优化

- **硬件加速**: 基于WebGL的GPU渲染
- **渲染节流**: 16ms节流控制，维持60fps
- **智能更新**: 防抖更新减少不必要的重绘

### 内存管理

- **自动清理**: 组件卸载时自动释放WebGL资源
- **纹理优化**: 智能纹理尺寸计算
- **事件清理**: 完整的事件监听器清理

### 移动端优化

- **触摸优化**: 原生触摸事件处理
- **高DPI支持**: 自动适配Retina等高密度屏幕
- **性能监控**: 移动设备性能信息记录

## 🔧 开发指南

### 构建项目

```bash
npm run build
```

### 类型检查

项目已完全实现TypeScript类型安全，所有API都有完整的类型定义。

### 添加功能

1. 在 `types.ts` 中定义新的类型接口
2. 在 `constants.ts` 中添加相关配置常量
3. 在 `WebGLImageViewerEngine.ts` 中实现功能逻辑
4. 更新 `index.ts` 导出新的API

## 📈 构建状态

✅ **TypeScript编译**: 通过  
✅ **类型检查**: 完整  
✅ **构建输出**:

- `dist/index.js` (39.49 kB, gzip: 11.06 kB)
- `dist/index.d.ts` (16.41 kB, gzip: 5.87 kB)

## 🔗 相关链接

- [WebGL API 文档](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API)
- [React Hooks 文档](https://reactjs.org/docs/hooks-intro.html)
- [TypeScript 手册](https://www.typescriptlang.org/docs/)

## 📄 许可证

[MIT License](LICENSE)
