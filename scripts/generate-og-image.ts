import { Buffer } from 'node:buffer'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

import type { Sharp } from 'sharp'
import sharp from 'sharp'

import { buildTimePhotoLoader } from './photo-loader.js'
import { renderSVGText, wrapSVGText } from './svg-text-renderer.js'

// 获取最新的照片
async function getLatestPhotos(count = 4) {
  const photos = buildTimePhotoLoader.getPhotos()

  // 按拍摄时间排序，获取最新的照片
  const sortedPhotos = photos.sort((a, b) => {
    if (!a?.exif?.DateTimeOriginal || !b?.exif?.DateTimeOriginal) {
      return 0
    }

    const aDate = (a.exif.DateTimeOriginal as unknown as string) || a.lastModified
    const bDate = (b.exif.DateTimeOriginal as unknown as string) || b.lastModified
    return bDate.localeCompare(aDate)
  })

  return sortedPhotos.slice(0, count)
}

// 下载并处理照片缩略图
async function downloadAndProcessThumbnail(thumbnailUrl: string, size = 150) {
  try {
    // 如果是本地路径，直接读取
    if (thumbnailUrl.startsWith('/')) {
      const localPath = join(process.cwd(), 'public', thumbnailUrl)
      if (existsSync(localPath)) {
        return await sharp(localPath).resize(size, size, { fit: 'cover' }).png().toBuffer()
      }
    }

    // 如果是 URL，需要下载（这里先返回 null，后面可以添加网络下载功能）
    console.warn(`Cannot download thumbnail from URL: ${thumbnailUrl}`)
    return null
  }
  catch (error) {
    console.warn(`Failed to process thumbnail: ${thumbnailUrl}`, error)
    return null
  }
}

// 创建带特效的照片（旋转、阴影、边框）
async function createPhotoWithEffects(imageBuffer: Buffer, size: number, rotation: number) {
  try {
    // 计算旋转后需要的画布大小
    const diagonal = Math.ceil(size * Math.sqrt(2))
    const canvasSize = diagonal + 40 // 额外空间用于阴影

    // 创建阴影效果的 SVG
    const shadowSvg = `
      <svg width="${canvasSize}" height="${canvasSize}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="4" dy="8" stdDeviation="6" flood-color="rgba(0,0,0,0.4)"/>
          </filter>
        </defs>
        <rect x="${(canvasSize - size - 12) / 2}" y="${(canvasSize - size - 12) / 2}" 
              width="${size + 12}" height="${size + 12}" 
              fill="#f0f0f0" filter="url(#shadow)" 
              transform="rotate(${rotation} ${canvasSize / 2} ${canvasSize / 2})"/>
      </svg>
    `

    // 创建阴影层
    const shadowBuffer = await sharp(Buffer.from(shadowSvg)).png().toBuffer()

    // 处理原图片：添加浅灰色边框并旋转（适配黑色主题）
    const photoWithBorder = await sharp(imageBuffer)
      .extend({
        top: 6,
        bottom: 6,
        left: 6,
        right: 6,
        background: { r: 240, g: 240, b: 240, alpha: 1 },
      })
      .png()
      .toBuffer()

    // 创建最终画布
    const canvas = sharp({
      create: {
        width: canvasSize,
        height: canvasSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })

    // 计算照片在画布中的位置
    const photoX = (canvasSize - size - 12) / 2
    const photoY = (canvasSize - size - 12) / 2

    // 合成阴影和照片
    const result = await canvas
      .composite([
        { input: shadowBuffer, top: 0, left: 0 },
        {
          input: photoWithBorder,
          top: Math.round(photoY),
          left: Math.round(photoX),
        },
      ])
      .png()
      .toBuffer()

    // 旋转整个图像
    return await sharp(result)
      .rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
  }
  catch (error) {
    console.warn('Failed to create photo with effects:', error)
    // 如果特效失败，返回简单的边框版本（适配黑色主题）
    return await sharp(imageBuffer)
      .extend({
        top: 4,
        bottom: 4,
        left: 4,
        right: 4,
        background: { r: 240, g: 240, b: 240, alpha: 1 },
      })
      .png()
      .toBuffer()
  }
}

interface OGImageOptions {
  title: string
  description: string
  width?: number
  height?: number
  outputPath: string
  includePhotos?: boolean
  photoCount?: number
}

export async function generateOGImage(options: OGImageOptions) {
  const { title, description, width = 1200, height = 630, outputPath, includePhotos = true, photoCount = 4 } = options

  // 确保输出目录存在
  const outputDir = join(process.cwd(), 'public')
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  try {
    let finalImage: Sharp

    if (includePhotos) {
      // 获取最新照片
      const latestPhotos = await getLatestPhotos(photoCount)
      console.info(`📸 Found ${latestPhotos.length} latest photos`)

      // 创建基础画布 - 黑色主题
      const canvas = sharp({
        create: {
          width,
          height,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 1 },
        },
      })

      // 创建现代黑色主题渐变背景
      const gradientSvg = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#0f0f0f;stop-opacity:1" />
              <stop offset="50%" style="stop-color:#1a1a1a;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#0a0a0a;stop-opacity:1" />
            </linearGradient>
            <radialGradient id="accent" cx="80%" cy="20%" r="60%">
              <stop offset="0%" style="stop-color:#333333;stop-opacity:0.3" />
              <stop offset="100%" style="stop-color:#000000;stop-opacity:0" />
            </radialGradient>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#bg)"/>
          <rect width="100%" height="100%" fill="url(#accent)"/>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      `

      const gradientBuffer = await sharp(Buffer.from(gradientSvg)).png().toBuffer()

      // 创建文字层 - 使用 SVG 路径绘制 Helvetica 风格字体
      const wrappedTitle = wrapSVGText(title, width - 120, {
        fontSize: 48,
        fontWeight: 'bold',
      })
      const wrappedDescription = wrapSVGText(description, width - 120, {
        fontSize: 24,
      })
      const footerText = `Latest Photos • Generated on ${new Date().toLocaleDateString()}`

      const titleSVG = renderSVGText(wrappedTitle, 60, 72, {
        fontSize: 48,
        fontWeight: 'bold',
        color: 'white',
        letterSpacing: 2,
      })

      const descriptionSVG = renderSVGText(wrappedDescription, 60, 146, {
        fontSize: 24,
        color: 'rgba(255,255,255,0.9)',
        letterSpacing: 1,
      })

      const footerSVG = renderSVGText(footerText, 60, 556, {
        fontSize: 18,
        color: 'rgba(255,255,255,0.7)',
        letterSpacing: 0.5,
      })

      const textSvg = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          ${titleSVG}
          ${descriptionSVG}
          ${footerSVG}
        </svg>
      `

      const textBuffer = await sharp(Buffer.from(textSvg)).png().toBuffer()

      // 准备合成图层
      const composite: sharp.OverlayOptions[] = [
        { input: gradientBuffer, top: 0, left: 0 },
        { input: textBuffer, top: 0, left: 0 },
      ]

      // 处理照片缩略图 - 创建倾斜叠加效果
      const photoSize = 160
      const baseX = 580
      const baseY = 200 // 往下移动 50px
      const rotations = [-12, 5, -8, 10] // 每张照片的旋转角度
      const offsets = [
        { x: 0, y: 20 },
        { x: 90, y: 60 },
        { x: 180, y: -10 },
        { x: 270, y: 70 },
      ]

      const length = Math.min(latestPhotos.length, photoCount)
      for (let i = length - 1; i >= 0; i--) {
        const photo = latestPhotos[i]
        const thumbnailBuffer = await downloadAndProcessThumbnail(photo.thumbnailUrl, photoSize)

        if (thumbnailBuffer) {
          const rotation = rotations[i] || 0
          const offset = offsets[i] || { x: i * 60, y: 0 }
          const x = baseX + offset.x
          const y = baseY + offset.y

          // 创建带阴影和边框的照片
          const photoWithEffects = await createPhotoWithEffects(thumbnailBuffer, photoSize, rotation)

          composite.push({
            input: photoWithEffects,
            top: y,
            left: x,
          })

          console.info(`📷 Added photo: ${photo.title} at position (${x}, ${y}) with rotation ${rotation}°`)
        }
      }

      // 合成最终图像
      finalImage = canvas.composite(composite)
    }
    else {
      // 不包含照片的简单版本 - 黑色主题，使用 SVG 路径绘制字体
      const simpleWrappedTitle = wrapSVGText(title, width - 120, {
        fontSize: 72,
        fontWeight: 'bold',
      })
      const simpleWrappedDescription = wrapSVGText(description, width - 120, {
        fontSize: 32,
      })
      const simpleFooterText = `Generated on ${new Date().toLocaleDateString()}`

      const simpleTitleSVG = renderSVGText(simpleWrappedTitle, 60, 152, {
        fontSize: 72,
        fontWeight: 'bold',
        color: 'white',
        letterSpacing: 3,
      })

      const simpleDescriptionSVG = renderSVGText(simpleWrappedDescription, 60, 256, {
        fontSize: 32,
        color: 'rgba(255,255,255,0.9)',
        letterSpacing: 1.5,
      })

      const simpleFooterSVG = renderSVGText(simpleFooterText, 60, 526, {
        fontSize: 24,
        color: 'rgba(255,255,255,0.7)',
        letterSpacing: 1,
      })

      const svgContent = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#0f0f0f;stop-opacity:1" />
              <stop offset="50%" style="stop-color:#1a1a1a;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#0a0a0a;stop-opacity:1" />
            </linearGradient>
            <radialGradient id="accent" cx="80%" cy="20%" r="60%">
              <stop offset="0%" style="stop-color:#333333;stop-opacity:0.3" />
              <stop offset="100%" style="stop-color:#000000;stop-opacity:0" />
            </radialGradient>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.02)" stroke-width="1"/>
            </pattern>
          </defs>
          
          <rect width="100%" height="100%" fill="url(#bg)"/>
          <rect width="100%" height="100%" fill="url(#accent)"/>
          <rect width="100%" height="100%" fill="url(#grid)" />

          ${simpleTitleSVG}
          ${simpleDescriptionSVG}
          ${simpleFooterSVG}
          
          <circle cx="1000" cy="150" r="80" fill="rgba(255,255,255,0.03)"/>
          <circle cx="1050" cy="200" r="40" fill="rgba(255,255,255,0.02)"/>
          <circle cx="950" cy="250" r="60" fill="rgba(255,255,255,0.025)"/>
        </svg>
      `

      finalImage = sharp(Buffer.from(svgContent))
    }

    // 生成最终图片
    const buffer = await finalImage.png().toBuffer()

    // 写入文件
    const fullOutputPath = join(outputDir, outputPath)
    writeFileSync(fullOutputPath, buffer)

    console.info(`✅ OG image generated: ${fullOutputPath}`)
    return fullOutputPath
  }
  catch (error) {
    console.error('❌ Error generating OG image:', error)
    throw error
  }
}
