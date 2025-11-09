import path from 'node:path'

import { getGlobalLoggers } from '@afilmory/builder/photo/logger-adapter.js'

import { SUPPORTED_FORMATS } from '../../constants/index.js'
import type {
  GitHubConfig,
  ProgressCallback,
  StorageObject,
  StorageProvider,
  StorageUploadOptions,
} from '../interfaces.js'

// GitHub API 响应类型
interface GitHubFileContent {
  name: string
  path: string
  sha: string
  size: number
  url: string
  html_url: string
  git_url: string
  download_url: string | null
  type: 'file' | 'dir'
  content?: string
  encoding?: string
}

interface GitHubDirectoryContent extends GitHubFileContent {
  type: 'dir'
}

type GitHubContent = GitHubFileContent | GitHubDirectoryContent

export class GitHubStorageProvider implements StorageProvider {
  private config: GitHubConfig
  private githubConfig: NonNullable<GitHubConfig>
  private baseApiUrl: string

  constructor(config: GitHubConfig) {
    this.config = config

    if (config.provider !== 'github') {
      throw new Error('GitHub 配置不能为空')
    }

    this.githubConfig = {
      branch: 'main',
      path: '',
      useRawUrl: true,
      ...config,
    }

    this.baseApiUrl = `https://api.github.com/repos/${this.githubConfig.owner}/${this.githubConfig.repo}`

    if (!this.githubConfig.owner || !this.githubConfig.repo) {
      throw new Error('GitHub owner 和 repo 配置不能为空')
    }
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'PhotoGallery/1.0',
    }

    if (this.githubConfig.token) {
      headers['Authorization'] = `Bearer ${this.githubConfig.token}`
    }

    return headers
  }

  private normalizeKey(key: string): string {
    // 移除开头的斜杠，确保路径格式正确
    return key.replace(/^\/+/, '')
  }

  private getFullPath(key: string): string {
    const normalizedKey = this.normalizeKey(key)
    if (this.githubConfig.path) {
      return `${this.githubConfig.path}/${normalizedKey}`.replaceAll(/\/+/g, '/')
    }
    return normalizedKey
  }

  private async fetchContentMetadata(key: string): Promise<GitHubFileContent | null> {
    const fullPath = this.getFullPath(key)
    const url = `${this.baseApiUrl}/contents/${fullPath}?ref=${this.githubConfig.branch}`

    const response = await fetch(url, {
      headers: this.getAuthHeaders(),
    })

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      throw new Error(`GitHub API 请求失败：${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as GitHubContent
    return data.type === 'file' ? data : null
  }

  async getFile(key: string): Promise<Buffer | null> {
    const logger = getGlobalLoggers().s3

    try {
      logger.info(`下载文件：${key}`)
      const startTime = Date.now()

      const fullPath = this.getFullPath(key)
      const url = `${this.baseApiUrl}/contents/${fullPath}?ref=${this.githubConfig.branch}`

      const response = await fetch(url, {
        headers: this.getAuthHeaders(),
      })

      if (!response.ok) {
        if (response.status === 404) {
          logger.warn(`文件不存在：${key}`)
          return null
        }
        throw new Error(`GitHub API 请求失败：${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as GitHubFileContent

      if (data.type !== 'file') {
        logger.error(`路径不是文件：${key}`)
        return null
      }

      let fileBuffer: Buffer

      if (data.download_url) {
        // 使用 download_url 获取文件内容（推荐方式）
        const fileResponse = await fetch(data.download_url)
        if (!fileResponse.ok) {
          throw new Error(`下载文件失败：${fileResponse.status} ${fileResponse.statusText}`)
        }
        const arrayBuffer = await fileResponse.arrayBuffer()
        fileBuffer = Buffer.from(arrayBuffer)
      } else if (data.content && data.encoding === 'base64') {
        // 从 API 响应中解码 base64 内容
        fileBuffer = Buffer.from(data.content, 'base64')
      } else {
        throw new Error('无法获取文件内容')
      }

      const duration = Date.now() - startTime
      const sizeKB = Math.round(fileBuffer.length / 1024)
      logger.success(`下载完成：${key} (${sizeKB}KB, ${duration}ms)`)

      return fileBuffer
    } catch (error) {
      logger.error(`下载失败：${key}`, error)
      return null
    }
  }

  async listImages(): Promise<StorageObject[]> {
    const allFiles = await this.listAllFiles()

    // 过滤出图片文件
    return allFiles.filter((file) => {
      const ext = path.extname(file.key).toLowerCase()
      return SUPPORTED_FORMATS.has(ext)
    })
  }

  async listAllFiles(progressCallback?: ProgressCallback): Promise<StorageObject[]> {
    const files: StorageObject[] = []
    const basePath = this.githubConfig.path || ''

    await this.listFilesRecursive(basePath, files, progressCallback)

    return files
  }

  private async listFilesRecursive(
    dirPath: string,
    files: StorageObject[],
    progressCallback?: ProgressCallback,
  ): Promise<void> {
    try {
      const url = `${this.baseApiUrl}/contents/${dirPath}?ref=${this.githubConfig.branch}`

      const response = await fetch(url, {
        headers: this.getAuthHeaders(),
      })

      if (!response.ok) {
        if (response.status === 404) {
          // 目录不存在，返回空数组
          return
        }
        throw new Error(`GitHub API 请求失败：${response.status} ${response.statusText}`)
      }

      const contents = (await response.json()) as GitHubContent[]

      for (const item of contents) {
        if (item.type === 'file') {
          // 计算相对于配置路径的 key
          let key = item.path
          if (this.githubConfig.path) {
            key = item.path.replace(new RegExp(`^${this.githubConfig.path}/`), '')
          }

          files.push({
            key,
            size: item.size,
            // GitHub API 不直接提供最后修改时间，使用当前时间或从其他 API 获取
            lastModified: new Date(),
            etag: item.sha,
          })
        } else if (item.type === 'dir') {
          // 递归处理子目录
          await this.listFilesRecursive(item.path, files, progressCallback)
        }
      }
    } catch (error) {
      console.error(`列出目录 ${dirPath} 失败:`, error)
      throw error
    }
  }

  async deleteFile(key: string): Promise<void> {
    const metadata = await this.fetchContentMetadata(key)
    if (!metadata) {
      return
    }

    const fullPath = this.getFullPath(key)
    const url = `${this.baseApiUrl}/contents/${fullPath}`
    const body = {
      message: `Delete ${fullPath}`,
      sha: metadata.sha,
      branch: this.githubConfig.branch,
    }

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(`GitHub 删除文件失败：${response.status} ${response.statusText}`)
    }
  }

  async uploadFile(key: string, data: Buffer, _options?: StorageUploadOptions): Promise<StorageObject> {
    const metadata = await this.fetchContentMetadata(key)
    const fullPath = this.getFullPath(key)
    const url = `${this.baseApiUrl}/contents/${fullPath}`

    const payload: Record<string, unknown> = {
      message: `Upload ${fullPath}`,
      content: data.toString('base64'),
      branch: this.githubConfig.branch,
    }

    if (metadata?.sha) {
      payload.sha = metadata.sha
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`GitHub 上传文件失败：${response.status} ${response.statusText}`)
    }

    const result = (await response.json()) as { content?: GitHubFileContent }
    const content = result.content ?? (await this.fetchContentMetadata(key))

    return {
      key,
      size: content?.size ?? data.byteLength,
      lastModified: new Date(),
      etag: content?.sha,
    }
  }

  generatePublicUrl(key: string): string {
    const fullPath = this.getFullPath(key)

    if (this.githubConfig.useRawUrl) {
      // 使用 raw.githubusercontent.com 获取文件
      return `https://raw.githubusercontent.com/${this.githubConfig.owner}/${this.githubConfig.repo}/${this.githubConfig.branch}/${fullPath}`
    } else {
      // 使用 GitHub 的 blob URL
      return `https://github.com/${this.githubConfig.owner}/${this.githubConfig.repo}/blob/${this.githubConfig.branch}/${fullPath}`
    }
  }

  detectLivePhotos(allObjects: StorageObject[]): Map<string, StorageObject> {
    const livePhotoMap = new Map<string, StorageObject>()

    // 按目录和基础文件名分组所有文件
    const fileGroups = new Map<string, StorageObject[]>()

    for (const obj of allObjects) {
      if (!obj.key) continue

      const dir = path.dirname(obj.key)
      // use path.parse to safely get the filename without extension (case-insensitive extension handling)
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
}
