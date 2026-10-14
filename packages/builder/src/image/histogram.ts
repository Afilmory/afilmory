import type { HistogramData, ToneAnalysis, ToneType } from '@afilmory/typing'
import type { Sharp } from 'sharp'

import { getGlobalLoggers } from '../photo'

async function calculateHistogram(sharpInstance: Sharp): Promise<HistogramData | null> {
  const log = getGlobalLoggers().image

  try {
    log?.info('开始计算图片直方图')
    const startTime = Date.now()

    // toColourspace guarantees 3/4-channel raw output; grayscale sources would
    // otherwise misalign the RGB-strided reads below
    const { data, info } = await sharpInstance
      .clone()
      .toColourspace('srgb')
      .resize(256, 256, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true })

    const { width, height, channels } = info
    const pixelCount = width * height

    const histogram: HistogramData = {
      red: Array.from({ length: 256 }).fill(0) as number[],
      green: Array.from({ length: 256 }).fill(0) as number[],
      blue: Array.from({ length: 256 }).fill(0) as number[],
      luminance: Array.from({ length: 256 }).fill(0) as number[],
    }

    for (let i = 0; i < data.length; i += channels) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]

      histogram.red[r]++
      histogram.green[g]++
      histogram.blue[b]++

      // ITU-R BT.709, same luminance definition as the web HistogramChart
      const luminance = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)
      histogram.luminance[luminance]++
    }

    Object.keys(histogram).forEach((key) => {
      const channel = histogram[key as keyof HistogramData]
      for (let i = 0; i < channel.length; i++) {
        channel[i] = channel[i] / pixelCount
      }
    })

    const duration = Date.now() - startTime
    log?.success(`直方图计算完成 (${duration}ms)`)

    return histogram
  }
  catch (error) {
    log?.error('计算直方图失败：', error)
    return null
  }
}

function analyzeTone(histogram: HistogramData): ToneAnalysis {
  const log = getGlobalLoggers().image

  try {
    log?.info('开始分析图片影调')

    const { luminance } = histogram

    let totalLuminance = 0
    let totalPixels = 0
    for (const [i, element] of luminance.entries()) {
      totalLuminance += i * element
      totalPixels += element
    }
    const brightness = Math.round((totalLuminance / totalPixels) * (100 / 255))

    let shadowRatio = 0
    let highlightRatio = 0

    for (let i = 0; i < 86; i++) {
      shadowRatio += luminance[i]
    }

    for (let i = 170; i < 256; i++) {
      highlightRatio += luminance[i]
    }

    let variance = 0
    const mean = totalLuminance / totalPixels
    for (const [i, element] of luminance.entries()) {
      variance += element * (i - mean) ** 2
    }
    const stdDev = Math.sqrt(variance)
    const contrast = Math.min(100, Math.round((stdDev / 127.5) * 100))

    let toneType: ToneType

    if (brightness < 30 && shadowRatio > 0.6) {
      toneType = 'low-key'
    }
    else if (brightness > 70 && highlightRatio > 0.6) {
      toneType = 'high-key'
    }
    else if (contrast > 60 && shadowRatio > 0.3 && highlightRatio > 0.3) {
      toneType = 'high-contrast'
    }
    else {
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
  }
  catch (error) {
    log?.error('分析影调失败：', error)

    return {
      toneType: 'normal',
      brightness: 50,
      contrast: 50,
      shadowRatio: 0.33,
      highlightRatio: 0.33,
    }
  }
}

export async function calculateHistogramAndAnalyzeTone(sharpInstance: Sharp): Promise<ToneAnalysis | null> {
  const histogram = await calculateHistogram(sharpInstance)
  if (!histogram) {
    return null
  }

  return analyzeTone(histogram)
}
