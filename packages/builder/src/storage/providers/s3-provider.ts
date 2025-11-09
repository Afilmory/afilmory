import path from 'node:path'

import type { _Object, S3Client } from '@aws-sdk/client-s3'
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3'

import { backoffDelay, sleep } from '../../../../utils/src/backoff.js'
import { Semaphore } from '../../../../utils/src/semaphore.js'
import { SUPPORTED_FORMATS } from '../../constants/index.js'
import { logger } from '../../logger/index.js'
import { createS3Client } from '../../s3/client.js'
import type { ProgressCallback, S3Config, StorageObject, StorageProvider, StorageUploadOptions } from '../interfaces'

// 将 AWS S3 对象转换为通用存储对象
function convertS3ObjectToStorageObject(s3Object: _Object): StorageObject {
  return {
    key: s3Object.Key || '',
    size: s3Object.Size,
    lastModified: s3Object.LastModified,
    etag: s3Object.ETag,
  }
}

export class S3StorageProvider implements StorageProvider {
  private config: S3Config
  private s3Client: S3Client
  private limiter: Semaphore

  constructor(config: S3Config) {
    this.config = config
    this.s3Client = createS3Client(config)
    this.limiter = new Semaphore(this.config.downloadConcurrency ?? 16)
  }

  async getFile(key: string): Promise<Buffer | null> {
    return await this.limiter.run(async () => {
      const maxAttempts = this.config.maxAttempts ?? 3
      const totalTimeoutMs = this.config.totalTimeoutMs ?? 60_000
      const idleTimeoutMs = this.config.idleTimeoutMs ?? 10_000
      const requestTimeoutMs = this.config.requestTimeoutMs ?? 20_000

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const startTime = Date.now()
        const controller = new AbortController()
        const totalTimer = setTimeout(() => controller.abort(), totalTimeoutMs)
        let idleTimer: NodeJS.Timeout | null = null
        let firstByteAt: number | null = null

        try {
          logger.s3.info(`下载开始：${key} (attempt ${attempt}/${maxAttempts})`)

          const command = new GetObjectCommand({
            Bucket: this.config.bucket,
            Key: key,
          })

          const response = await this.s3Client.send(command, {
            abortSignal: controller.signal,
            requestTimeout: requestTimeoutMs,
          })

          if (!response.Body) {
            logger.s3.error(`S3 响应中没有 Body: ${key}`)
            return null
          }

          // 如果 Body 已经是 Buffer
          if (response.Body instanceof Buffer) {
            const duration = Date.now() - startTime
            const sizeKB = Math.round(response.Body.length / 1024)
            logger.s3.success(`下载完成：${key} (${sizeKB}KB, ${duration}ms, attempt ${attempt})`)
            return response.Body
          }

          // 以流方式读取并监控首字节与空闲超时
          const chunks: Uint8Array[] = []
          const stream = response.Body as NodeJS.ReadableStream

          const resetIdle = () => {
            if (idleTimer) clearTimeout(idleTimer)
            idleTimer = setTimeout(() => {
              controller.abort()
            }, idleTimeoutMs)
          }

          resetIdle()

          const buffer: Buffer = await new Promise((resolve, reject) => {
            stream.on('data', (chunk: Uint8Array) => {
              if (!firstByteAt) firstByteAt = Date.now()
              chunks.push(chunk)
              resetIdle()
            })

            stream.on('end', () => {
              if (idleTimer) clearTimeout(idleTimer)
              const buf = Buffer.concat(chunks)
              resolve(buf)
            })

            stream.on('error', (error) => {
              if (idleTimer) clearTimeout(idleTimer)
              reject(error)
            })
          })

          const duration = Date.now() - startTime
          const ttfb = firstByteAt ? firstByteAt - startTime : duration
          const sizeKB = Math.round(buffer.length / 1024)
          logger.s3.success(`下载完成：${key} (${sizeKB}KB, ${duration}ms, TTFB ${ttfb}ms, attempt ${attempt})`)
          clearTimeout(totalTimer)
          return buffer
        } catch (error) {
          const elapsed = Date.now() - startTime
          logger.s3.warn(`下载失败：${key} (attempt ${attempt}/${maxAttempts}, ${elapsed}ms)`, error)
          clearTimeout(totalTimer)

          if (attempt < maxAttempts) {
            const delay = backoffDelay(attempt)
            logger.s3.info(`等待 ${delay}ms 后重试：${key}`)
            await sleep(delay)
            continue
          }
          logger.s3.error(`下载最终失败：${key}`)
          return null
        }
      }

      return null
    })
  }

  async listImages(): Promise<StorageObject[]> {
    const listCommand = new ListObjectsV2Command({
      Bucket: this.config.bucket,
      Prefix: this.config.prefix,
      MaxKeys: this.config.maxFileLimit, // 最多获取 1000 张照片
    })

    const listResponse = await this.s3Client.send(listCommand)
    const objects = listResponse.Contents || []
    const excludeRegex = this.config.excludeRegex ? new RegExp(this.config.excludeRegex) : null

    // 过滤出图片文件并转换为通用格式
    const imageObjects = objects
      .filter((obj: _Object) => {
        if (!obj.Key) return false
        if (excludeRegex && excludeRegex.test(obj.Key)) return false

        const ext = path.extname(obj.Key).toLowerCase()
        return SUPPORTED_FORMATS.has(ext)
      })
      .map((obj) => convertS3ObjectToStorageObject(obj))

    return imageObjects
  }

  async listAllFiles(_progressCallback?: ProgressCallback): Promise<StorageObject[]> {
    const listCommand = new ListObjectsV2Command({
      Bucket: this.config.bucket,
      Prefix: this.config.prefix,
      MaxKeys: this.config.maxFileLimit,
    })

    const listResponse = await this.s3Client.send(listCommand)
    const objects = listResponse.Contents || []

    return objects.map((obj) => convertS3ObjectToStorageObject(obj))
  }

  generatePublicUrl(key: string): string {
    // 如果设置了自定义域名，直接使用自定义域名
    if (this.config.customDomain) {
      const customDomain = this.config.customDomain.replace(/\/$/, '') // 移除末尾的斜杠
      return `${customDomain}/${key}`
    }

    // 如果使用自定义端点，构建相应的 URL
    const { endpoint } = this.config

    if (!endpoint) {
      // 默认 AWS S3 端点
      return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${key}`
    }

    // 检查是否是标准 AWS S3 端点
    if (endpoint.includes('amazonaws.com')) {
      return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${key}`
    }

    const baseUrl = endpoint.replace(/\/$/, '') // 移除末尾的斜杠

    if (endpoint.includes('aliyuncs.com')) {
      const protocolEndIndex = baseUrl.indexOf('//')
      if (protocolEndIndex === -1) {
        throw new Error('Invalid base URL format')
      }
      // 将 bucket 插入到 'https://` 之后，region 之前
      const prefix = baseUrl.slice(0, protocolEndIndex + 2) // 包括 'https://'
      const suffix = baseUrl.slice(protocolEndIndex + 2) // 剩余部分
      return `${prefix}${this.config.bucket}.${suffix}/${key}`
    }
    // 对于自定义端点（如 MinIO 等）
    return `${baseUrl}/${this.config.bucket}/${key}`
  }

  detectLivePhotos(allObjects: StorageObject[]): Map<string, StorageObject> {
    const livePhotoMap = new Map<string, StorageObject>() // image key -> video object

    // 按目录和基础文件名分组所有文件
    const fileGroups = new Map<string, StorageObject[]>()

    for (const obj of allObjects) {
      if (!obj.key) continue

      const dir = path.dirname(obj.key)
      const basename = path.parse(obj.key).name
      const groupKey = `${dir}/${basename}`

      if (!fileGroups.has(groupKey)) {
        fileGroups.set(groupKey, [])
      }
      fileGroups.get(groupKey)!.push(obj)
    }

    // 在每个分组中寻找图片 + 视频配对
    for (const files of fileGroups.values()) {
      let imageFile: StorageObject | null = null
      let videoFile: StorageObject | null = null

      for (const file of files) {
        if (!file.key) continue

        const ext = path.extname(file.key).toLowerCase()

        // 检查是否为支持的图片格式
        if (SUPPORTED_FORMATS.has(ext)) {
          imageFile = file
        }
        // 检查是否为 .mov 视频文件
        else if (ext === '.mov') {
          videoFile = file
        }
      }

      // 如果找到配对，记录为 live photo
      if (imageFile && videoFile && imageFile.key) {
        livePhotoMap.set(imageFile.key, videoFile)
      }
    }

    return livePhotoMap
  }

  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    })

    await this.s3Client.send(command)
  }

  async uploadFile(key: string, data: Buffer, options?: StorageUploadOptions): Promise<StorageObject> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      Body: data,
      ContentType: options?.contentType,
    })

    const response = await this.s3Client.send(command)
    const lastModified = new Date()

    return {
      key,
      size: data.byteLength,
      lastModified,
      etag: response.ETag ?? undefined,
    }
  }
}
