import path from 'node:path'

import * as bmp from '@vingle/bmp-js'
import heicConvert from 'heic-convert'
import sharp from 'sharp'

import { HEIC_FORMATS } from '../constants/index.js'
import { getGlobalLoggers } from '../photo/logger-adapter.js'
import type { ImageMetadata } from '../types/photo.js'

// 获取图片元数据（复用 Sharp 实例）
export async function getImageMetadataWithSharp(sharpInstance: sharp.Sharp): Promise<ImageMetadata | null> {
  const log = getGlobalLoggers().image

  try {
    const metadata = await sharpInstance.metadata()

    if (!metadata.width || !metadata.height || !metadata.format) {
      log.error('图片元数据不完整')
      return null
    }

    let { width } = metadata
    let { height } = metadata

    // 根据 EXIF Orientation 信息调整宽高
    const { orientation } = metadata
    if (orientation === 5 || orientation === 6 || orientation === 7 || orientation === 8) {
      // 对于需要旋转 90°的图片，需要交换宽高
      ;[width, height] = [height, width]
      log.info(`检测到需要旋转 90°的图片 (orientation: ${orientation})，交换宽高：${width}x${height}`)
    }

    return {
      width,
      height,
      format: metadata.format,
    }
  } catch (error) {
    log.error('获取图片元数据失败：', error)
    return null
  }
}

// 转换 HEIC/HEIF 格式到 JPEG
export async function convertHeicToJpeg(heicBuffer: Buffer): Promise<Buffer> {
  const log = getGlobalLoggers().image

  try {
    log.info(`开始 HEIC/HEIF → JPEG 转换 (${Math.round(heicBuffer.length / 1024)}KB)`)
    const startTime = Date.now()

    const jpegBuffer = await heicConvert({
      buffer: heicBuffer,
      format: 'JPEG',
      quality: 0.95, // 高质量转换
    })

    const duration = Date.now() - startTime
    const outputSizeKB = Math.round(jpegBuffer.byteLength / 1024)
    log.success(`HEIC/HEIF 转换完成 (${outputSizeKB}KB, ${duration}ms)`)

    return Buffer.from(jpegBuffer)
  } catch (error) {
    log.error('HEIC/HEIF 转换失败：', error)
    throw error
  }
}

// 预处理图片 Buffer（处理 HEIC/HEIF 格式）
export async function preprocessImageBuffer(buffer: Buffer, key: string): Promise<Buffer> {
  const log = getGlobalLoggers().image
  const ext = path.extname(key).toLowerCase()

  // 如果是 HEIC/HEIF 格式，先转换为 JPEG
  if (HEIC_FORMATS.has(ext)) {
    log.info(`检测到 HEIC/HEIF 格式：${key}`)
    return await convertHeicToJpeg(buffer)
  }

  // 其他格式直接返回原始 buffer
  return buffer
}

// BMP 格式
const BUF_BMP = Buffer.from([0x42, 0x4d])

export function isBitmap(buf: Buffer): boolean {
  if (buf.length < 2) {
    return false
  }
  return Buffer.compare(BUF_BMP, buf.slice(0, 2)) === 0
}

/**
 * 将 BMP Buffer 转换为 Sharp 实例
 * @param bmpBuffer Buffer
 * @returns Sharp 实例
 */
export async function convertBmpToJpegSharpInstance(bmpBuffer: Buffer): Promise<sharp.Sharp> {
  const log = getGlobalLoggers().image

  try {
    log.info(`开始 BMP → JPEG 转换 (${Math.round(bmpBuffer.length / 1024)}KB)`)
    const startTime = Date.now()

    // 使用 @vingle/bmp-js 解析 BMP
    const bmpImage = bmp.decode(bmpBuffer, true)
    if (!bmpImage) {
      throw new Error('BMP 解码失败')
    }

    // 创建 Sharp 实例
    // Calculate the number of channels in the BMP image
    const channels = bmpImage.data.length / (bmpImage.width * bmpImage.height)
    if (channels !== 3 && channels !== 4) {
      throw new Error(`Unsupported BMP channel count: ${channels}`)
    }

    // Create Sharp instance with the correct channel count
    const sharpInstance = sharp(bmpImage.data, {
      raw: { width: bmpImage.width, height: bmpImage.height, channels },
    }).jpeg()

    const duration = Date.now() - startTime
    log.success(`BMP 转换完成 (${duration}ms)`)

    return sharpInstance
  } catch (error) {
    log.error('BMP 转换失败：', error)
    throw error
  }
}
