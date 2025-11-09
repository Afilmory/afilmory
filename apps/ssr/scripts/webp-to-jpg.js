import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

import sharp from 'sharp'

const __dirname = new URL('.', import.meta.url).pathname
// 定义目标目录
const thumbnailsDir = join(__dirname, '../public/thumbnails')

// 转换 WebP 到 JPG 的函数
async function convertWebpToJpg(inputPath, outputPath) {
  try {
    await sharp(inputPath)
      .jpeg({ quality: 90 }) // 设置 JPG 质量为 90
      .toFile(outputPath)
    console.info(`✅ 转换成功：${basename(inputPath)} -> ${basename(outputPath)}`)
  } catch (error) {
    console.error(`❌ 转换失败：${basename(inputPath)}`, error.message)
  }
}

// 递归处理目录
async function processDirectory(dirPath) {
  try {
    const items = readdirSync(dirPath)

    for (const item of items) {
      const fullPath = join(dirPath, item)
      const stat = statSync(fullPath)

      if (stat.isDirectory()) {
        // 递归处理子目录
        await processDirectory(fullPath)
      } else if (stat.isFile() && extname(item).toLowerCase() === '.webp') {
        // 处理 WebP 文件
        const baseName = basename(item, '.webp')
        const outputPath = join(dirPath, `${baseName}.jpg`)

        await convertWebpToJpg(fullPath, outputPath)
      }
    }
  } catch (error) {
    console.error(`❌ 处理目录失败：${dirPath}`, error.message)
  }
}

// 主函数
async function main() {
  console.info('🚀 开始转换 WebP 图片到 JPG...')
  console.info(`📁 目标目录：${thumbnailsDir}`)

  // 检查目录是否存在
  if (!existsSync(thumbnailsDir)) {
    console.error(`❌ 目录不存在：${thumbnailsDir}`)
    throw new Error('目标目录不存在')
  }

  try {
    await processDirectory(thumbnailsDir)
    console.info('✨ 所有转换任务完成！')
  } catch (error) {
    console.error('❌ 转换过程中发生错误：', error.message)
    throw error
  }
}

main()
