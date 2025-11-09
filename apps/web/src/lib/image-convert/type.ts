import type { LoadingCallbacks } from '../image-loader-manager'

// 转换结果接口
export interface ConversionResult {
  url: string
  convertedSize: number
  format: string
  originalSize: number
}

// 图像转换策略接口
export interface ImageConverterStrategy {
  /**
   * 检测是否需要转换此格式
   */
  shouldConvert: (blob: Blob) => Promise<boolean>

  /**
   * 执行转换
   */
  convert: (blob: Blob, originalUrl: string, callbacks?: LoadingCallbacks) => Promise<ConversionResult>

  /**
   * 策略名称，用于日志和调试
   */
  getName: () => string

  /**
   * 获取支持的格式
   */
  getSupportedFormats: () => string[]
}
