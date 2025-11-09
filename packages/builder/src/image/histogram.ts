import type { HistogramData, ToneAnalysis, ToneType } from '@afilmory/builder/types/photo.js'
import type sharp from 'sharp'

import { getGlobalLoggers } from '../photo'

/**
 * 计算图片的直方图
 * @param sharpInstance Sharp 实例
 * @param imageLogger 日志记录器
 * @returns 直方图数据
 */
async function calculateHistogram(sharpInstance: sharp.Sharp): Promise<HistogramData | null> {
  const log = getGlobalLoggers().image

  try {
    log?.info('开始计算图片直方图')
    const startTime = Date.now()

    // 获取图片的原始像素数据
    const { data, info } = await sharpInstance
      .clone()
      .resize(256, 256, { fit: 'inside' }) // 缩小图片以提高处理速度
      .raw()
      .toBuffer({ resolveWithObject: true })

    const { width, height, channels } = info
    const pixelCount = width * height

    // 初始化直方图数组 (0-255)
    const histogram: HistogramData = {
      red: Array.from({ length: 256 }).fill(0) as number[],
      green: Array.from({ length: 256 }).fill(0) as number[],
      blue: Array.from({ length: 256 }).fill(0) as number[],
      luminance: Array.from({ length: 256 }).fill(0) as number[],
    }

    // 遍历每个像素
    for (let i = 0; i < data.length; i += channels) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]

      // 更新RGB直方图
      histogram.red[r]++
      histogram.green[g]++
      histogram.blue[b]++

      // 计算亮度 (使用ITU-R BT.709标准)
      const luminance = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
      histogram.luminance[luminance]++
    }

    // 归一化直方图 (转换为0-1的比例)
    Object.keys(histogram).forEach((key) => {
      const channel = histogram[key as keyof HistogramData]
      for (let i = 0; i < channel.length; i++) {
        channel[i] = channel[i] / pixelCount
      }
    })

    const duration = Date.now() - startTime
    log?.success(`直方图计算完成 (${duration}ms)`)

    return histogram
  } catch (error) {
    log?.error('计算直方图失败：', error)
    return null
  }
}

/**
 * 根据直方图分析影调类型
 * @param histogram 直方图数据
 * @param imageLogger 日志记录器
 * @returns 影调分析结果
 */
function analyzeTone(histogram: HistogramData): ToneAnalysis {
  const log = getGlobalLoggers().image

  try {
    log?.info('开始分析图片影调')

    const { luminance } = histogram

    // 计算平均亮度
    let totalLuminance = 0
    let totalPixels = 0
    for (const [i, element] of luminance.entries()) {
      totalLuminance += i * element
      totalPixels += element
    }
    const brightness = Math.round((totalLuminance / totalPixels) * (100 / 255))

    // 计算阴影和高光区域占比
    let shadowRatio = 0
    let highlightRatio = 0

    // 阴影区域 (0-85)
    for (let i = 0; i < 86; i++) {
      shadowRatio += luminance[i]
    }

    // 高光区域 (170-255)
    for (let i = 170; i < 256; i++) {
      highlightRatio += luminance[i]
    }

    // 计算对比度 (使用标准差)
    let variance = 0
    const mean = totalLuminance / totalPixels
    for (const [i, element] of luminance.entries()) {
      variance += element * Math.pow(i - mean, 2)
    }
    const stdDev = Math.sqrt(variance)
    const contrast = Math.min(100, Math.round((stdDev / 127.5) * 100)) // 归一化到0-100

    // 判断影调类型
    let toneType: ToneType

    if (brightness < 30 && shadowRatio > 0.6) {
      // 低调：平均亮度低，阴影区域占比大
      toneType = 'low-key'
    } else if (brightness > 70 && highlightRatio > 0.6) {
      // 高调：平均亮度高，高光区域占比大
      toneType = 'high-key'
    } else if (contrast > 60 && shadowRatio > 0.3 && highlightRatio > 0.3) {
      // 高对比度：对比度高，阴影和高光区域都有相当占比
      toneType = 'high-contrast'
    } else {
      // 正常影调
      toneType = 'normal'
    }

    const result: ToneAnalysis = {
      toneType,
      brightness,
      contrast,
      shadowRatio: Math.round(shadowRatio * 100) / 100,
      highlightRatio: Math.round(highlightRatio * 100) / 100,
    }

    log?.success(`影调分析完成：${toneType} (亮度：${brightness}, 对比度：${contrast})`)

    return result
  } catch (error) {
    log.error('分析影调失败：', error)
    // 返回默认值

    return {
      toneType: 'normal',
      brightness: 50,
      contrast: 50,
      shadowRatio: 0.33,
      highlightRatio: 0.33,
    }
  }
}

/**
 * 计算直方图并分析影调（一体化函数）
 * @param sharpInstance Sharp 实例
 * @param imageLogger 日志记录器
 * @returns 影调分析结果
 */
export async function calculateHistogramAndAnalyzeTone(sharpInstance: sharp.Sharp): Promise<ToneAnalysis | null> {
  const histogram = await calculateHistogram(sharpInstance)
  if (!histogram) {
    return null
  }

  return analyzeTone(histogram)
}
