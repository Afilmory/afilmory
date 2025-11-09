import sharp from 'sharp'
import { rgbaToThumbHash } from 'thumbhash'

import { logger } from '../logger/index.js'

// 生成 blurhash（基于缩略图数据，保持长宽比）
export async function generateBlurhash(thumbnailBuffer: Buffer): Promise<Uint8Array | null> {
  try {
    // 复用缩略图的 Sharp 实例来生成 blurhash
    // 确保转换为 raw RGBA 格式
    const { data, info } = await sharp(thumbnailBuffer)
      .resize(100, 100, { fit: 'inside' })
      .raw()
      .ensureAlpha()
      .toBuffer({
        resolveWithObject: true,
      })

    const thumbHash = rgbaToThumbHash(info.width, info.height, data)
    return thumbHash
  } catch (error) {
    logger.blurhash.error('生成失败：', error)
    return null
  }
}
