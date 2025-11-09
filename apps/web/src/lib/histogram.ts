import type { CompressedHistogramData, HistogramData } from '@afilmory/builder/types/photo.js'

/**
 * 将压缩的直方图解压缩并插值到 256 点位
 * @param compressed 压缩的直方图数据
 * @returns 解压缩后的直方图数据
 */
export function decompressHistogram(compressed: CompressedHistogramData): HistogramData {
  const decompressChannel = (data: number[]): number[] => {
    const decompressed: number[] = Array.from({ length: 256 }).fill(0) as number[]

    for (let i = 0; i < 256; i++) {
      const compressedIndex = Math.floor(i / 4) // 对应的压缩索引
      const nextCompressedIndex = Math.min(compressedIndex + 1, 63)

      // 线性插值
      const t = (i % 4) / 4 // 插值因子 0-0.75
      const value1 = (data[compressedIndex] || 0) / 10000 // 还原浮点数
      const value2 = (data[nextCompressedIndex] || 0) / 10000

      decompressed[i] = value1 * (1 - t) + value2 * t
    }

    return decompressed
  }

  return {
    red: decompressChannel(compressed.red),
    green: decompressChannel(compressed.green),
    blue: decompressChannel(compressed.blue),
    luminance: decompressChannel(compressed.luminance),
  }
}
