import { getI18n } from '~/i18n'

import { isSafari } from './device-viewport'
import { LRUCache } from './lru-cache'
import { transmuxMovToMp4 } from './mp4-utils'

interface ConversionProgress {
  isConverting: boolean
  progress: number
  message: string
}

interface ConversionResult {
  success: boolean
  videoUrl?: string
  error?: string
  convertedSize?: number
}

// Global video cache instance using the generic LRU cache with custom cleanup
const videoCache: LRUCache<string, ConversionResult> = new LRUCache<string, ConversionResult>(
  10,
  (value, key, reason) => {
    if (value.videoUrl) {
      try {
        URL.revokeObjectURL(value.videoUrl)
        console.info(`Video cache: Revoked blob URL - ${reason}`)
      } catch (error) {
        console.warn(`Failed to revoke video blob URL (${reason}):`, error)
      }
    }
  },
)

function convertMOVtoMP4(
  videoUrl: string,
  onProgress?: (progress: ConversionProgress) => void,
): Promise<ConversionResult> {
  return new Promise((resolve) => {
    // Start transmux conversion
    transmuxMovToMp4(videoUrl, {
      onProgress,
    })
      .then((result) => {
        resolve(result)
      })
      .catch((error) => {
        console.error('Transmux conversion failed:', error)
        resolve({
          success: false,
          error: error instanceof Error ? error.message : 'Transmux failed',
        })
      })
  })
}

// 检测浏览器是否原生支持 MOV 格式
function isBrowserSupportMov(): boolean {
  // 创建一个临时的 video 元素来测试格式支持
  const video = document.createElement('video')

  // 检测是否支持 MOV 容器格式
  const canPlayMov = video.canPlayType('video/quicktime')

  // Safari 通常原生支持 MOV
  if (isSafari) {
    return true
  }

  // 对于其他浏览器，只有当 canPlayType 明确返回支持时才认为支持
  // 'probably' 或 'maybe' 表示支持，空字符串表示不支持
  return canPlayMov === 'probably' || canPlayMov === 'maybe'
}

// 检测是否需要转换 mov 文件
export function needsVideoConversion(url: string): boolean {
  const lowerUrl = url.toLowerCase()
  const isMovFile = lowerUrl.includes('.mov') || lowerUrl.endsWith('.mov')

  // 如果不是 MOV 文件，不需要转换
  if (!isMovFile) {
    return false
  }

  // 如果浏览器原生支持 MOV，不需要转换
  if (isBrowserSupportMov()) {
    console.info('Browser natively supports MOV format, skipping conversion')
    return false
  }

  // 浏览器不支持 MOV，需要转换
  console.info('Browser does not support MOV format, conversion needed')
  return true
}

export async function convertMovToMp4(
  videoUrl: string,

  onProgress?: (progress: ConversionProgress) => void,
  forceReconvert = false, // 添加强制重新转换参数
): Promise<ConversionResult> {
  const { t } = getI18n()
  // Check cache first, unless forced to reconvert
  if (!forceReconvert) {
    const cachedResult = videoCache.get(videoUrl)
    if (cachedResult) {
      console.info('Using cached video conversion result')
      onProgress?.({
        isConverting: false,
        progress: 100,
        message: t('video.conversion.cached.result'),
      })
      console.info(`Cached video conversion result:`, cachedResult)
      return cachedResult
    }
  } else {
    console.info('Force reconversion: clearing cached result for', videoUrl)
    videoCache.delete(videoUrl)
  }

  try {
    console.info(`🎯 Target format: MP4 (H.264)`)
    onProgress?.({
      isConverting: true,
      progress: 0,
      message: t('video.conversion.transmux.high.quality'),
    })

    const result = await convertMOVtoMP4(videoUrl, onProgress)

    // Cache the result
    videoCache.set(videoUrl, result)

    if (result.success) {
      console.info('conversion completed successfully and cached')
    } else {
      console.error('conversion failed:', result.error)
    }

    return result
  } catch (error) {
    console.error('conversion failed:', error)
    const fallbackResult = {
      success: false,
      error: `Conversion Failed: ${error instanceof Error ? error.message : error}`,
    }

    return fallbackResult
  }
}
