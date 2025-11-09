import fs from 'node:fs/promises'
import path from 'node:path'

import { SUPPORTED_FORMATS } from '@afilmory/builder/constants/index.js'
import { workdir } from '@afilmory/builder/path.js'
import { getGlobalLoggers } from '@afilmory/builder/photo/logger-adapter.js'

import { logger } from '../../logger/index.js'
import type { EagleConfig, EagleRule, StorageObject, StorageProvider, StorageUploadOptions } from '../interfaces.js'

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

export interface EagleImageMetadata {
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
  star?: number
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
  folderAsTag: false,
  omitTagNamesInMetadata: [],
} satisfies Required<EagleConfig>

export class EagleStorageProvider implements StorageProvider {
  private readonly config: Required<EagleConfig>
  /**
   * Folder index map: folder ID -> folder path array
   */
  private folderIndex = new Map<string, string[]>()

  constructor(userConfig: EagleConfig) {
    if (!userConfig.libraryPath || userConfig.libraryPath.trim() === '') {
      throw new Error('EagleStorageProvider: libraryPath 不能为空')
    }
    if (!path.isAbsolute(userConfig.libraryPath)) {
      throw new Error(`EagleStorageProvider: libraryPath 必须是绝对路径. libraryPath: ${userConfig.libraryPath}`)
    }
    if (userConfig.distPath && !path.isAbsolute(userConfig.distPath)) {
      throw new Error(`EagleStorageProvider: distPath 必须是绝对路径. distPath: ${userConfig.distPath}`)
    }

    this.config = {
      ...defaultEagleConfig,
      ...userConfig,
      libraryPath: path.resolve(userConfig.libraryPath),
      distPath: path.resolve(userConfig.distPath ?? defaultEagleConfig.distPath),
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
        logger.main.error(`EagleStorageProvider: libraryPath 不是有效的 Eagle 库：${error.message}`)
      }
      throw error
    }

    if (
      !(await fs
        .stat(this.config.distPath)
        .then((res) => res.isDirectory())
        .catch(() => false))
    ) {
      await fs.mkdir(this.config.distPath, { recursive: true })
      logger.main.info(`EagleStorageProvider: 已创建 distPath 目录：${this.config.distPath}`)
    }

    this.folderIndex = await getEagleFolderIndex(this.config.libraryPath)
  }

  async getFile(key: string): Promise<Buffer | null> {
    const logger = getGlobalLoggers().s3
    await this.initialize()

    const imageInfoPath = path.resolve(this.config.libraryPath, 'images', `${key}.info`)
    const infoStats = await fs.stat(imageInfoPath)
    if (!infoStats.isDirectory()) {
      logger.error(`EagleStorageProvider: 请求的文件路径不安全。key: ${key}, 路径: ${imageInfoPath}`)
      return null
    }
    const imageMetadata: EagleImageMetadata = await readImageMetadata(this.config.libraryPath, key)
    if (!SUPPORTED_FORMATS.has(`.${imageMetadata.ext.toLowerCase()}`)) {
      logger.error(`EagleStorageProvider: 不支持的图片格式。key: ${key}, 格式: .${imageMetadata.ext}`)
      return null
    }
    const imageFileName = `${imageMetadata.name}.${imageMetadata.ext}`
    const imageFilePath = path.join(imageInfoPath, imageFileName)
    try {
      const buffer = await fs.readFile(imageFilePath)
      return buffer
    } catch (error) {
      logger.error(`EagleStorageProvider: 读取图片文件失败。key: ${key}, 路径: ${imageFilePath}, 错误: ${error}`)
      return null
    }
  }

  async listImages() {
    return this.listAllFiles()
  }

  async listAllFiles(): Promise<StorageObject[]> {
    await this.initialize()
    const imagesDir = path.join(this.config.libraryPath, 'images')
    const imageEntries = await fs.readdir(imagesDir, { withFileTypes: true })
    const keys = imageEntries
      // Filter out .DS_Store
      .filter((entry) => entry.isDirectory() && entry.name.endsWith('.info'))
      .map((entry) => {
        return entry.name.replace(/\.info$/, '')
      })
    const filtered: StorageObject[] = []

    await Promise.all(
      keys.map(async (key) => {
        const meta = await readImageMetadata(this.config.libraryPath, key)
        if (meta.isDeleted) {
          // Skip deleted images
          return
        }
        const include = this.config.include.length === 0 ? true : this.runPredicate(meta, this.config.include)
        const exclude = this.config.exclude.length === 0 ? false : this.runPredicate(meta, this.config.exclude)
        const supportedFormat = SUPPORTED_FORMATS.has(`.${meta.ext.toLowerCase()}`)

        if (include && !exclude && supportedFormat) {
          filtered.push({
            key,
            size: meta.size,
            lastModified: new Date(meta.lastModified),
          })
        }
      }),
    )

    return filtered
  }

  async deleteFile(_key: string): Promise<void> {
    throw new Error('EagleStorageProvider: 当前不支持删除文件操作')
  }

  async uploadFile(_key: string, _data: Buffer, _options?: StorageUploadOptions): Promise<StorageObject> {
    throw new Error('EagleStorageProvider: 当前不支持上传文件操作')
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
    const sourceImage = path.join(this.config.libraryPath, 'images', `${key}.info`, imageName)
    const distName = `${key}.${imageMeta.ext}`
    const distFile = path.join(this.config.distPath, distName)
    if (
      await fs
        .stat(distFile)
        .then(() => true)
        .catch(() => false)
    ) {
      // 文件已存在，跳过复制
      logger.main.log(`EagleStorageProvider: 发布目录已存在文件，跳过复制： ${imageName} -> ${distFile}`)
      return distName
    }
    await fs.copyFile(sourceImage, distFile)
    logger.main.log(`EagleStorageProvider: 已复制文件到发布目录： ${imageName} -> ${distFile}`)
    return distName
  }

  /**
   * Returns `true` if the image matches any of the given rules.
   */
  private runPredicate(imageMeta: EagleImageMetadata, rules: EagleRule[]): boolean {
    if (rules.length === 0) {
      return true
    }
    return rules.some((condition) => {
      switch (condition.type) {
        case 'tag': {
          return imageMeta.tags.includes(condition.name)
        }
        case 'folder': {
          const includeSubfolder = !!condition.includeSubfolder
          for (const folderId of imageMeta.folders) {
            const folderPath = this.folderIndex.get(folderId)
            if (!folderPath) {
              logger.main.warn(`EagleStorageProvider: 无法找到文件夹索引，跳过该文件夹过滤条件。folderId: ${folderId}`)
              continue
            }
            if (includeSubfolder) {
              if (folderPath.includes(condition.name)) {
                return true
              }
              continue
            } else {
              if (folderPath.at(-1) === condition.name) {
                return true
              }
              continue
            }
          }
          return false
        }
        case 'smartFolder': {
          // Not supported yet
          return false
        }
        default: {
          return false
        }
      }
    })
  }
}

async function validateEagleLibrary(libraryPath: string): Promise<void> {
  // Check for directory existence
  try {
    const stats = await fs.stat(libraryPath)
    if (!stats.isDirectory()) {
      throw new Error(`EagleStorageProvider: 指定的 libraryPath 不是目录。libraryPath: ${libraryPath}`)
    }
  } catch (error) {
    throw new Error(`EagleStorageProvider: 无法访问指定的 libraryPath: ${libraryPath} - ${error}`)
  }

  // Check for metadata.json existence
  try {
    const metadataPath = path.join(libraryPath, 'metadata.json')
    await fs.access(metadataPath)
  } catch (error) {
    throw new Error(`EagleStorageProvider: library metadata.json 不存在：${libraryPath} - ${error}`)
  }

  // Check for images directory existence
  try {
    const imagesDir = path.join(libraryPath, 'images')
    const stats = await fs.stat(imagesDir)
    if (!stats.isDirectory()) {
      throw new Error(`EagleStorageProvider: images 不是目录。libraryPath: ${imagesDir}`)
    }
  } catch (error) {
    throw new Error(`EagleStorageProvider: 无法访问指定的 images 目录: ${libraryPath} - ${error}`)
  }
}

async function readEagleLibraryMetadata(libraryPath: string): Promise<EagleLibraryMetadata> {
  const metadataPath = path.join(libraryPath, 'metadata.json')

  try {
    const content = await fs.readFile(metadataPath, 'utf-8')
    return JSON.parse(content) as EagleLibraryMetadata
  } catch (error) {
    const errorMsg = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    throw new Error(`EagleStorageProvider: 无法解析 library metadata：${errorMsg}`)
  }
}

export async function readImageMetadata(libraryPath: string, key: string): Promise<EagleImageMetadata> {
  const metadataPath = path.join(libraryPath, 'images', `${key}.info`, 'metadata.json')
  const content = await fs.readFile(metadataPath, 'utf-8')
  return JSON.parse(content) as EagleImageMetadata
}

function buildFolderIndexes(folders: EagleFolderNode[]) {
  const map = new Map<string, string[]>()
  const traverse = (node: EagleFolderNode, parent: string[]) => {
    const path = [...parent, node.name]
    map.set(node.id, path)
    const children = node.children ?? []
    for (const child of children) {
      traverse(child, path)
    }
  }

  for (const folder of folders) {
    traverse(folder, [])
  }
  return map
}

/**
 * Public helper for plugins to retrieve the folder index (folderId -> path segments)
 * from the Eagle library metadata.
 */
export async function getEagleFolderIndex(libraryPath: string): Promise<Map<string, string[]>> {
  const metadata = await readEagleLibraryMetadata(libraryPath)
  logger.main.info(`EagleStorageProvider: 检测到 Eagle 版本：${metadata.applicationVersion}`)
  if (Number(metadata.applicationVersion.at(0)) !== Number(EAGLE_VERSION.at(0))) {
    logger.main.warn(
      `EagleStorageProvider: 当前支持 Eagle ${EAGLE_VERSION} 版本的库，检测到的版本为：${metadata.applicationVersion}，可能会导致兼容性问题。`,
    )
  }
  return buildFolderIndexes(metadata.folders ?? [])
}
