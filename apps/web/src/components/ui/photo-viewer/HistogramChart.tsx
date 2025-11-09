import { cx } from '@afilmory/utils'
import clsx from 'clsx'
import type { FC } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface CompressedHistogramData {
  red: number[]
  green: number[]
  blue: number[]
  luminance: number[]
}

interface HistogramData {
  red: number[]
  green: number[]
  blue: number[]
  luminance: number[]
}

const calculateHistogram = (imageData: ImageData): CompressedHistogramData => {
  const histogram: HistogramData = {
    red: Array.from({ length: 256 }).fill(0) as number[],
    green: Array.from({ length: 256 }).fill(0) as number[],
    blue: Array.from({ length: 256 }).fill(0) as number[],
    luminance: Array.from({ length: 256 }).fill(0) as number[],
  }

  const { data } = imageData
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    histogram.red[r]++
    histogram.green[g]++
    histogram.blue[b]++
    const luminance = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)
    histogram.luminance[luminance]++
  }

  const compress = (channelData: number[]): number[] => {
    const compressed = Array.from({ length: 128 }).fill(0) as number[]
    for (let i = 0; i < 256; i++) {
      compressed[Math.floor(i / 2)] += channelData[i]
    }
    return compressed
  }

  return {
    red: compress(histogram.red),
    green: compress(histogram.green),
    blue: compress(histogram.blue),
    luminance: compress(histogram.luminance),
  }
}

const drawHistogram = (canvas: HTMLCanvasElement, histogram: CompressedHistogramData) => {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 获取 Canvas 的实际显示尺寸
  const rect = canvas.getBoundingClientRect()
  const { width } = rect
  const { height } = rect
  const dpr = window.devicePixelRatio || 1

  // 设置高分辨率
  canvas.width = width * dpr
  canvas.height = height * dpr
  ctx.scale(dpr, dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  // 清空画布
  ctx.clearRect(0, 0, width, height)

  // 找到最大值用于归一化
  const maxVal = Math.max(...histogram.luminance, ...histogram.red, ...histogram.green, ...histogram.blue)

  if (maxVal === 0) return

  const padding = 0
  const chartWidth = width - padding * 2
  const chartHeight = height - padding * 2

  // Apple 风格的颜色定义
  const colors = {
    red: 'rgb(255, 105, 97)',
    green: 'rgb(52, 199, 89)',
    blue: 'rgb(64, 156, 255)',
    luminance: 'rgba(255, 255, 255, 0.6)',
    background: 'rgba(28, 28, 30, 0.95)',
    grid: 'rgba(255, 255, 255, 0.04)',
    border: 'rgba(255, 255, 255, 0.08)',
  }

  // 绘制背景
  ctx.fillStyle = colors.background
  ctx.fillRect(0, 0, width, height)

  // 绘制极简网格
  ctx.strokeStyle = colors.grid
  ctx.lineWidth = 0.5

  // 只绘制几条关键的网格线
  for (let i = 1; i <= 3; i++) {
    const y = padding + (chartHeight / 4) * i
    ctx.beginPath()
    ctx.moveTo(padding, y)
    ctx.lineTo(width - padding, y)
    ctx.stroke()
  }

  // 绘制柱状图函数
  const drawBars = (data: number[], color: string, alpha = 1) => {
    const barWidth = chartWidth / data.length

    for (const [i, datum] of data.entries()) {
      const barHeight = (datum / maxVal) * chartHeight
      const x = padding + i * barWidth
      const y = height - padding - barHeight

      // 创建渐变
      const gradient = ctx.createLinearGradient(0, y, 0, height - padding)

      // 正确处理颜色字符串转换
      let topColor: string
      let bottomColor: string

      if (color.startsWith('rgba')) {
        // 如果已经是 rgba 格式，替换最后的透明度值
        topColor = color.replace(/[\d.]+\)$/, `${alpha})`)
        bottomColor = color.replace(/[\d.]+\)$/, `${alpha * 0.1})`)
      } else if (color.startsWith('rgb')) {
        // 如果是 rgb 格式，转换为 rgba
        topColor = color.replace('rgb', 'rgba').replace(')', `, ${alpha})`)
        bottomColor = color.replace('rgb', 'rgba').replace(')', `, ${alpha * 0.1})`)
      } else {
        // 其他格式直接使用
        topColor = color
        bottomColor = color
      }

      gradient.addColorStop(0, topColor)
      gradient.addColorStop(1, bottomColor)

      ctx.fillStyle = gradient
      ctx.fillRect(x, y, barWidth * 0.8, barHeight)
    }
  }

  // 先绘制亮度通道作为背景
  drawBars(histogram.luminance, colors.luminance, 0.3)

  // 设置混合模式
  ctx.globalCompositeOperation = 'screen'

  // 绘制 RGB 通道
  drawBars(histogram.red, colors.red, 0.7)
  drawBars(histogram.green, colors.green, 0.7)
  drawBars(histogram.blue, colors.blue, 0.7)

  // 重置混合模式
  ctx.globalCompositeOperation = 'source-over'

  // 绘制边框
  ctx.strokeStyle = colors.border
  ctx.lineWidth = 1
  ctx.strokeRect(padding - 0.5, padding - 0.5, chartWidth + 1, chartHeight + 1)

  // 添加顶部高光
  const highlightGradient = ctx.createLinearGradient(0, 0, 0, height * 0.2)
  highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.03)')
  highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

  ctx.fillStyle = highlightGradient
  ctx.fillRect(0, 0, width, height * 0.2)
}

export const HistogramChart: FC<{
  thumbnailUrl: string
  className?: string
}> = ({ thumbnailUrl, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previousHistogramRef = useRef<CompressedHistogramData | null>(null)
  const animationRef = useRef<number | null>(null)
  const [histogram, setHistogram] = useState<CompressedHistogramData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    setLoading(true)
    setError(false)

    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.src = thumbnailUrl

    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        setError(true)
        setLoading(false)
        return
      }

      // 为了更好的性能，缩放图片到合适的大小
      const maxSize = 300
      const scale = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight)
      const scaledWidth = Math.floor(img.naturalWidth * scale)
      const scaledHeight = Math.floor(img.naturalHeight * scale)

      canvas.width = scaledWidth
      canvas.height = scaledHeight
      ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight)

      try {
        const imageData = ctx.getImageData(0, 0, scaledWidth, scaledHeight)
        const calculatedHistogram = calculateHistogram(imageData)
        setHistogram(calculatedHistogram)
      } catch (e) {
        console.error('Error calculating histogram:', e)
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    img.onerror = () => {
      setError(true)
      setLoading(false)
    }
  }, [thumbnailUrl])

  useEffect(() => {
    if (!histogram || !canvasRef.current) return

    const canvas = canvasRef.current

    // Cancel any ongoing animation before starting a new one
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }

    // If we don't have a previous histogram, draw immediately and set baseline
    if (!previousHistogramRef.current) {
      drawHistogram(canvas, histogram)
      previousHistogramRef.current = histogram
      return
    }

    const startAt = performance.now()
    const prev = previousHistogramRef.current

    // Spring parameters (slightly underdamped for natural feel)
    const frequency = 8 // rad/s, controls oscillation speed (lower = smoother)
    const damping = 7 // higher = faster decay, tuned for subtle bounce
    const restDelta = 0.001
    const maxMs = 1200

    const springProgress = (tSec: number) => {
      // Analytic solution for underdamped second-order system step response
      // y(t) = 1 - e^{-d t} (cos(w t) + (d/w) sin(w t))
      const w = frequency
      const d = damping
      const exp = Math.exp(-d * tSec)
      const value = 1 - exp * (Math.cos(w * tSec) + (d / w) * Math.sin(w * tSec))
      // Clamp to [0, 1] to avoid overshoot drawing artifacts
      return Math.max(0, Math.min(1, value))
    }

    const lerpArray = (from: number[], to: number[], p: number) => from.map((v, i) => v + (to[i] - v) * p)

    const frame = (now: number) => {
      const elapsedMs = now - startAt
      const tSec = elapsedMs / 1000
      const eased = springProgress(tSec)

      const interpolated: CompressedHistogramData = {
        red: lerpArray(prev.red, histogram.red, eased),
        green: lerpArray(prev.green, histogram.green, eased),
        blue: lerpArray(prev.blue, histogram.blue, eased),
        luminance: lerpArray(prev.luminance, histogram.luminance, eased),
      }

      drawHistogram(canvas, interpolated)

      const done = Math.abs(1 - eased) < restDelta || elapsedMs >= maxMs
      if (!done) {
        animationRef.current = requestAnimationFrame(frame)
      } else {
        previousHistogramRef.current = histogram
        animationRef.current = null
      }
    }

    animationRef.current = requestAnimationFrame(frame)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [histogram])

  return (
    <div className={cx('relative grow w-full h-32 group', className)}>
      {loading && (
        <div className="bg-material-ultra-thin absolute inset-0 z-10 flex items-center justify-center rounded-sm backdrop-blur-xl">
          <div className="i-mingcute-loading-3-line animate-spin text-xl" />
        </div>
      )}
      {error && (
        <div className="bg-material-ultra-thin absolute inset-0 flex items-center justify-center rounded-sm backdrop-blur-xl">
          <div className="text-center">
            <div className="text-text-secondary text-xs">{t('photo.error.loading')}</div>
          </div>
        </div>
      )}
      {histogram && (
        <canvas
          ref={canvasRef}
          className={clsx(
            'bg-material-ultra-thin ring-fill-tertiary/20 group-hover:ring-fill-tertiary/40 h-full w-full rounded-sm ring-1 backdrop-blur-xl transition-all duration-200',
            loading && 'opacity-30',
          )}
        />
      )}
    </div>
  )
}
