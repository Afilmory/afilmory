import { isSafari } from '~/lib/device-viewport'
import type { LoadingCallbacks } from '~/lib/image-loader-manager'

import type { ConversionResult, ImageConverterStrategy } from '../type'

// TIFF 转换策略
export class TiffConverterStrategy implements ImageConverterStrategy {
  getName(): string {
    return 'TIFF'
  }

  getSupportedFormats(): string[] {
    return ['image/tiff', 'image/tif']
  }

  async shouldConvert(_blob: Blob): Promise<boolean> {
    return !this.isBrowserSupportTiff()
  }

  async convert(blob: Blob, _originalUrl: string, callbacks?: LoadingCallbacks): Promise<ConversionResult> {
    const { onLoadingStateUpdate } = callbacks || {}

    try {
      // 更新转换状态
      onLoadingStateUpdate?.({
        isConverting: true,
        isQueueWaiting: false,
        conversionMessage: 'Converting TIFF image...',
      })

      // 执行转换逻辑
      const result = await this.convertTiffToJpeg(blob)

      return {
        url: result.url,
        convertedSize: result.size,
        format: 'image/jpeg',
        originalSize: blob.size,
      }
    } catch (error) {
      console.error('TIFF conversion failed:', error)
      throw new Error(`TIFF conversion failed: ${error}`)
    }
  }

  // 浏览器支持检测
  private isBrowserSupportTiff(): boolean {
    // safari 支持 tiff
    if (isSafari) {
      return true
    }
    return false
  }

  // 转换实现
  private async convertTiffToJpeg(blob: Blob): Promise<{ url: string; size: number }> {
    try {
      // 动态导入 tiff 库
      const tiff = await import('tiff')

      // 将 Blob 转换为 ArrayBuffer
      const arrayBuffer = await blob.arrayBuffer()

      // 解码 TIFF 数据
      const ifds = tiff.decode(arrayBuffer)

      if (!ifds || ifds.length === 0) {
        throw new Error('Failed to decode TIFF image')
      }

      // 获取第一个图像帧（页面）
      const ifd = ifds[0]
      const { width, height, data, bitsPerSample } = ifd

      // 创建 Canvas 元素
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        throw new Error('Failed to get canvas context')
      }

      canvas.width = width
      canvas.height = height

      // 创建 ImageData
      const imageData = ctx.createImageData(width, height)
      const pixelData = imageData.data

      // 根据位深度和通道数处理像素数据
      this.processPixelData(data, pixelData, bitsPerSample, ifd.alpha)

      // 将数据绘制到 Canvas
      ctx.putImageData(imageData, 0, 0)

      // 转换为 JPEG Blob
      return new Promise((resolve, reject) => {
        canvas.toBlob(
          (convertedBlob) => {
            if (convertedBlob) {
              const url = URL.createObjectURL(convertedBlob)
              resolve({ url, size: convertedBlob.size })
            } else {
              reject(new Error('Failed to convert TIFF to JPEG'))
            }
          },
          'image/jpeg',
          1,
        )
      })
    } catch (error) {
      console.error('TIFF to JPEG conversion failed:', error)
      throw error
    }
  }

  // 处理像素数据
  private processPixelData(
    sourceData: Uint8Array | Uint16Array | Float32Array | Float64Array,
    targetData: Uint8ClampedArray,
    bitsPerSample: number,
    hasAlpha = false,
  ): void {
    const channels = hasAlpha ? 4 : 3 // RGBA 或 RGB
    const pixelCount = targetData.length / 4

    for (let i = 0; i < pixelCount; i++) {
      const srcIndex = i * channels
      const dstIndex = i * 4

      switch (bitsPerSample) {
        case 8: {
          // 8位数据
          const data = sourceData as Uint8Array
          targetData[dstIndex] = data[srcIndex] || 0 // R
          targetData[dstIndex + 1] = channels > 1 ? data[srcIndex + 1] || 0 : data[srcIndex] || 0 // G
          targetData[dstIndex + 2] = channels > 2 ? data[srcIndex + 2] || 0 : data[srcIndex] || 0 // B
          targetData[dstIndex + 3] = hasAlpha ? data[srcIndex + 3] || 255 : 255 // A

          break
        }
        case 16: {
          // 16 位数据，需要转换为 8 位
          const data = sourceData as Uint16Array
          targetData[dstIndex] = Math.round((data[srcIndex] || 0) / 257) // R
          targetData[dstIndex + 1] =
            channels > 1 ? Math.round((data[srcIndex + 1] || 0) / 257) : Math.round((data[srcIndex] || 0) / 257) // G
          targetData[dstIndex + 2] =
            channels > 2 ? Math.round((data[srcIndex + 2] || 0) / 257) : Math.round((data[srcIndex] || 0) / 257) // B
          targetData[dstIndex + 3] = hasAlpha ? Math.round((data[srcIndex + 3] || 65535) / 257) : 255 // A

          break
        }
        case 32: {
          // 32 位浮点数据
          const data = sourceData as Float32Array | Float64Array
          targetData[dstIndex] = Math.round((data[srcIndex] || 0) * 255) // R
          targetData[dstIndex + 1] =
            channels > 1 ? Math.round((data[srcIndex + 1] || 0) * 255) : Math.round((data[srcIndex] || 0) * 255) // G
          targetData[dstIndex + 2] =
            channels > 2 ? Math.round((data[srcIndex + 2] || 0) * 255) : Math.round((data[srcIndex] || 0) * 255) // B
          targetData[dstIndex + 3] = hasAlpha ? Math.round((data[srcIndex + 3] || 1) * 255) : 255 // A

          break
        }
        // No default
      }
    }
  }
}
