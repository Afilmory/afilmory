import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Plugin } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../../../..')

/**
 * Vite 插件：为本地照片提供静态文件服务
 * 在开发模式下，将 /photos/* 请求映射到本地照片目录
 */
export function photosStaticPlugin(): Plugin {
  // URL 路径验证正则：只允许字母、数字、点、下划线、连字符、斜杠和空格
  const pathValidationRegex = /^[\w\u4e00-\u9fa5\s\-./[\]()]+$/

  // 危险路径模式
  const dangerousPatterns = [
    /\.\.\//, // 路径遍历
    /\.\.\\/,
    /%2e%2e/i, // URL 编码的 ..
    /%252e%252e/i, // 双重编码
    /\0/, // null 字节
  ]

  // ETag 生成函数
  const generateETag = (stats: fs.Stats): string => {
    return `"${stats.mtime.getTime()}-${stats.size}"`
  }
  return {
    name: 'photos-static',
    configureServer(server) {
      // 如果 photos 目录已经存在，则警告并跳过该插件
      const publicPhotosDir = path.resolve(
        projectRoot,
        './apps/web/public/photos',
      )
      if (fs.existsSync(publicPhotosDir)) {
        const msg =
          "[photos-static] Detected 'apps/web/public/photos' directory. Skipping plugin to avoid conflict with Vite static serving."
        server.config.logger.warn(msg)
        return
      }

      server.middlewares.use('/photos', (req, res, next) => {
        if (!req.url) {
          next()
          return
        }

        // 解码 URL 以处理特殊字符
        let decodedUrl: string
        try {
          decodedUrl = decodeURIComponent(req.url)
        } catch {
          // URL 解码失败，可能是恶意请求
          console.error('[photos-static] URL 解码失败:', req.url)
          res.statusCode = 400
          res.end('Bad Request')
          return
        }

        // 移除查询参数
        const cleanPath = decodedUrl.split('?')[0]

        // 检查危险路径模式
        for (const pattern of dangerousPatterns) {
          if (pattern.test(cleanPath)) {
            console.error('[photos-static] 检测到危险路径模式:', cleanPath)
            res.statusCode = 403
            res.end('Forbidden')
            return
          }
        }

        // 验证路径字符
        if (!pathValidationRegex.test(cleanPath)) {
          console.error('[photos-static] 路径包含不允许的字符:', cleanPath)
          res.statusCode = 403
          res.end('Forbidden')
          return
        }

        // 构建本地文件路径
        const localPhotoPath = path.join(projectRoot, 'photos', cleanPath)

        // 安全检查：确保文件路径在 photos 目录内
        const resolvedPath = path.resolve(localPhotoPath)
        const resolvedPhotosDir = path.resolve(projectRoot, 'photos')

        if (!resolvedPath.startsWith(resolvedPhotosDir)) {
          res.statusCode = 403
          res.end('Forbidden')
          return
        }

        // 检查文件是否存在
        if (!fs.existsSync(localPhotoPath)) {
          res.statusCode = 404
          res.end('Not Found')
          return
        }

        // 检查是否是文件（不是目录）
        const stats = fs.statSync(localPhotoPath)
        if (!stats.isFile()) {
          res.statusCode = 404
          res.end('Not Found')
          return
        }

        // 设置正确的 Content-Type
        const ext = path.extname(localPhotoPath).toLowerCase()
        const mimeTypes: Record<string, string> = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.webp': 'image/webp',
          '.gif': 'image/gif',
          '.bmp': 'image/bmp',
          '.tiff': 'image/tiff',
          '.tif': 'image/tiff',
          '.heic': 'image/heic',
          '.heif': 'image/heif',
          '.hif': 'image/heif',
          '.avif': 'image/avif',
          '.svg': 'image/svg+xml',
        }

        const contentType = mimeTypes[ext] || 'application/octet-stream'
        res.setHeader('Content-Type', contentType)

        // 设置缓存头
        res.setHeader('Cache-Control', 'public, max-age=31536000') // 1 year
        const etag = generateETag(stats)
        res.setHeader('ETag', etag)

        // 检查 If-None-Match 头（ETag 缓存）
        const ifNoneMatch = req.headers['if-none-match']

        if (ifNoneMatch === etag) {
          res.statusCode = 304
          res.end()
          return
        }

        // 流式传输文件
        const stream = fs.createReadStream(localPhotoPath)

        stream.on('error', (error) => {
          console.error('[photos-static] Error streaming photo file:', error)
          if (!res.headersSent) {
            res.statusCode = 500
            res.end('Internal Server Error')
          }
        })

        stream.pipe(res)
      })
    },
  }
}
