# Image Viewer

React 19 图片查看器，优先使用 WebGPU。WebGPU 不可用、初始化失败或设备丢失时自动切换到 WebGL；运行中降级保留当前缩放和平移位置。包名仍为 `@afilmory/webgl-viewer`。

```tsx
import { ImageViewer } from '@afilmory/webgl-viewer'

<ImageViewer
  src="/photo.jpg"
  alt="Photo description"
  minScale={1}
  maxScale={20}
  onLoad={() => console.log('First frame rendered')}
  onError={console.error}
  onHDRChange={hdr => console.log({ hdr })}
  onRendererChange={renderer => console.log({ renderer })}
  onViewportChange={viewport => console.log(viewport)}
/>
```

容器需要明确的宽高。支持滚轮、鼠标拖动、双指缩放、双击切换、缩放边界及减少动态效果偏好。`ImageViewerRef` 提供 `zoomIn`、`zoomOut`、`resetView` 和 `getScale`。

WebGPU 在 Worker 中解码原图，生成概览和可见区域瓦片。LOD 随缩放和设备像素比变化；纹理使用受 128 MiB 预算限制。预算不包含解码后的 CPU 图像、浏览器画布、视频和驱动内存。无需服务端预切片。

支持带 Adobe XMP 或 ISO 21496-1 元数据的 JPEG gain map：分别上传基础图和增益图，在着色器中恢复 HDR，输出 Display P3 / `rgba16float` / extended range。HDR 需要支持扩展动态范围的浏览器、画布和显示器；其他格式、无效或不支持的 gain map、WebGL 降级均按 SDR 显示。`onHDRChange` 表示实际启用的 HDR 输出。

`ImageViewportState` 包含图像尺寸、容器尺寸、缩放和平移，供 Live Photo 视频和区域标注共用同一个视口。资源在切图和卸载时释放。

验证命令（仓库根目录）：

```sh
pnpm exec tsx --test scripts/webgpu-hdr-spike/production.test.ts
pnpm --filter @afilmory/webgl-viewer type-check
pnpm --filter @afilmory/webgl-viewer build
pnpm --filter @afilmory/web type-check
pnpm --filter @afilmory/web build:serve
```
