import fs from 'node:fs/promises'
import path from 'node:path'

import { workdir } from '@afilmory/builder/path.js'

import type { Logger } from '../../logger/index.js'
import { logger } from '../../logger/index.js'
import type {
  EagleConfig,
  StorageObject,
  StorageProvider,
} from '../interfaces.js'

const EAGLE_VERSION = '4.0.0'

interface EagleFolderNode {
  id: string
  name: string
  description: string
  children?: EagleFolderNode[]
  modificationTime: number
  tags: string[]
  password: string
  passwordTips: string
  /**
   * For smart folders
   */
  conditions?: unknown[]
}

interface EagleLibraryMetadata {
  folders?: EagleFolderNode[]
  smartFolders?: unknown[]
  quickAccess: unknown[]
  tagsGroups: unknown[]
  modificationTime: number
  applicationVersion: '4.0.0'
}

interface EagleImageMetadata {
  id: string
  name: string
  size: number
  btime: number
  mtime: number
  ext: string
  tags: string[]
  folders: string[]
  isDeleted: boolean
  url: string
  annotation: string
  modificationTime: number
  height: number
  width: number
  noThumbnail: boolean
  palettes: unknown[]
  lastModified: number
}

const defaultEagleConfig = {
  provider: 'eagle',
  libraryPath: '',
  distPath: path.join(workdir, 'public', 'originals'),
  baseUrl: '/originals/',
  include: [],
  exclude: [],
} satisfies Required<EagleConfig>

export class EagleStorageProvider implements StorageProvider {
  private readonly config: Required<EagleConfig>

  constructor(userConfig: EagleConfig) {
    if (!userConfig.libraryPath || userConfig.libraryPath.trim() === '') {
      throw new Error('EagleStorageProvider: libraryPath 不能为空')
    }
    if (!path.isAbsolute(userConfig.libraryPath)) {
      throw new Error(
        `EagleStorageProvider: libraryPath 必须是绝对路径. libraryPath: ${userConfig.libraryPath}`,
      )
    }
    if (userConfig.distPath && !path.isAbsolute(userConfig.distPath)) {
      throw new Error(
        `EagleStorageProvider: distPath 必须是绝对路径. distPath: ${userConfig.distPath}`,
      )
    }

    this.config = {
      ...defaultEagleConfig,
      ...userConfig,
      libraryPath: path.resolve(userConfig.libraryPath),
      distPath: path.resolve(
        userConfig.distPath ?? defaultEagleConfig.distPath,
      ),
    }
  }

  initialized = false
  async initialize(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    try {
      await validateEagleLibrary(this.config.libraryPath)
    } catch (error) {
      if (error instanceof Error) {
        logger.main.error(
          `EagleStorageProvider: libraryPath 不是有效的 Eagle 库：${error.message}`,
        )
      }
      throw error
    }

    if (
      !(await fs
        .stat(this.config.distPath)
        .then((res) => res.isDirectory())
        .catch(() => false))
    ) {
      fs.mkdir(this.config.distPath, { recursive: true })
      logger.main.info(
        `EagleStorageProvider: 已创建 distPath 目录：${this.config.distPath}`,
      )
    }

    const metadata = await readEagleLibraryMetadata(this.config.libraryPath)
    logger.main.info(
      `EagleStorageProvider: 检测到 Eagle 版本：${metadata.applicationVersion}`,
    )
    if (
      Number(metadata.applicationVersion.at(0)) !== Number(EAGLE_VERSION.at(0))
    ) {
      logger.main.warn(
        `EagleStorageProvider: 当前支持 Eagle ${EAGLE_VERSION} 版本的库，检测到的版本为：${metadata.applicationVersion}，可能会导致兼容性问题。`,
      )
    }
  }

  async getFile(key: string, logger?: Logger['s3']): Promise<Buffer | null> {
    await this.initialize()

    const imageInfoPath = path.resolve(
      this.config.libraryPath,
      'images',
      `${key}.info`,
    )
    const infoStats = await fs.stat(imageInfoPath)
    if (!infoStats.isDirectory()) {
      logger?.error?.(
        `EagleStorageProvider: 请求的文件路径不安全。key: ${key}, 路径: ${imageInfoPath}`,
      )
      return null
    }
    const imageMetadata: EagleImageMetadata = await readImageMetadata(
      this.config.libraryPath,
      key,
    )
    const imageFileName = `${imageMetadata.name}.${imageMetadata.ext}`
    const imageFilePath = path.join(imageInfoPath, imageFileName)
    try {
      const buffer = await fs.readFile(imageFilePath)
      return buffer
    } catch (error) {
      logger?.error?.(
        `EagleStorageProvider: 读取图片文件失败。key: ${key}, 路径: ${imageFilePath}, 错误: ${error}`,
      )
      return null
    }
  }

  async listImages(): Promise<StorageObject[]> {
    const allFiles = await this.listAllFiles()
    // TODO
    return allFiles
    // return allFiles.filter((file) => {
    //   const ext = path.extname(file.key)
    //   return SUPPORTED_FORMATS.has(ext)
    // })
  }

  async listAllFiles(): Promise<StorageObject[]> {
    await this.initialize()
    const imagesDir = path.join(this.config.libraryPath, 'images')
    const imageEntries = await fs.readdir(imagesDir, { withFileTypes: true })
    const objs = imageEntries
      .filter((entry) => entry.isDirectory() && entry.name.endsWith('.info'))
      .map((entry) => {
        return { key: entry.name.replace(/\.info$/, '') }
      })
    // TODO filter include/exclude rules
    return objs
  }

  async generatePublicUrl(key: string) {
    const imageName = await this.copyToDist(key)
    const publicPath = path.join(this.config.baseUrl, imageName)
    return publicPath
  }

  detectLivePhotos(_allObjects: StorageObject[]): Map<string, StorageObject> {
    // TODO
    return new Map()
  }

  private async copyToDist(key: string) {
    const imageMeta = await readImageMetadata(this.config.libraryPath, key)
    const imageName = `${imageMeta.name}.${imageMeta.ext}`
    const sourceImage = path.join(
      this.config.libraryPath,
      'images',
      `${key}.info`,
      imageName,
    )
    const distFile = path.join(this.config.distPath, imageName)
    await fs.copyFile(sourceImage, distFile)
    logger.main.info(
      `EagleStorageProvider: 已复制文件到发布目录： ${imageName} -> ${distFile}`,
    )
    return imageName
  }
}

async function validateEagleLibrary(libraryPath: string): Promise<void> {
  // Check for directory existence
  try {
    const stats = await fs.stat(libraryPath)
    if (!stats.isDirectory()) {
      throw new Error(
        `EagleStorageProvider: 指定的 libraryPath 不是目录。libraryPath: ${libraryPath}`,
      )
    }
  } catch (error) {
    throw new Error(
      `EagleStorageProvider: 无法访问指定的 libraryPath: ${libraryPath} - ${error}`,
    )
  }

  // Check for metadata.json existence
  try {
    const metadataPath = path.join(libraryPath, 'metadata.json')
    await fs.access(metadataPath)
  } catch (error) {
    throw new Error(
      `EagleStorageProvider: library metadata.json 不存在：${libraryPath} - ${error}`,
    )
  }

  // Check for images directory existence
  try {
    const imagesDir = path.join(libraryPath, 'images')
    const stats = await fs.stat(imagesDir)
    if (!stats.isDirectory()) {
      throw new Error(
        `EagleStorageProvider: images 不是目录。libraryPath: ${imagesDir}`,
      )
    }
  } catch (error) {
    throw new Error(
      `EagleStorageProvider: 无法访问指定的 images 目录: ${libraryPath} - ${error}`,
    )
  }
}

async function readEagleLibraryMetadata(
  libraryPath: string,
): Promise<EagleLibraryMetadata> {
  const metadataPath = path.join(libraryPath, 'metadata.json')

  try {
    const content = await fs.readFile(metadataPath, 'utf-8')
    return JSON.parse(content) as EagleLibraryMetadata
  } catch (error) {
    const errorMsg =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    throw new Error(
      `EagleStorageProvider: 无法解析 library metadata：${errorMsg}`,
    )
  }
}

async function readImageMetadata(
  libraryPath: string,
  key: string,
): Promise<EagleImageMetadata> {
  const metadataPath = path.join(
    libraryPath,
    'images',
    `${key}.info`,
    'metadata.json',
  )
  const content = await fs.readFile(metadataPath, 'utf-8')
  return JSON.parse(content) as EagleImageMetadata
}
