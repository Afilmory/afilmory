import path from 'node:path'

import type { AfilmoryManifest, CameraInfo, LensInfo, PhotoManifestItem, ProcessPhotoResult } from '@afilmory/typing'

import { thumbnailExists } from '../image/thumbnail.js'
import { logger } from '../logger/index.js'
import { handleDeletedPhotos, loadExistingManifest, needsUpdate, saveManifest } from '../manifest/manager.js'
import { CURRENT_MANIFEST_VERSION } from '../manifest/version.js'
import type { PhotoProcessorOptions } from '../photo/processor.js'
import { processPhoto } from '../photo/processor.js'
import type { PluginRunState } from '../plugins/manager.js'
import { PluginManager } from '../plugins/manager.js'
import type {
  BuilderPluginConfigEntry,
  BuilderPluginESMImporter,
  BuilderPluginEventPayloads,
} from '../plugins/types.js'
import type { StorageProviderFactory, StorageProviderRegistrationOptions } from '../storage/factory.js'
import type { StorageConfig } from '../storage/index.js'
import { StorageFactory, StorageManager } from '../storage/index.js'
import type { BuilderConfig, UserBuilderSettings } from '../types/config.js'
import { ClusterPool } from '../worker/cluster-pool.js'
import type { TaskCompletedPayload } from '../worker/pool.js'
import { WorkerPool } from '../worker/pool.js'

export interface BuilderOptions {
  isForceMode: boolean
  isForceManifest: boolean
  isForceThumbnails: boolean
  concurrencyLimit?: number // 可选，如果未提供则使用配置文件中的默认值
  progressListener?: BuildProgressListener
}

export interface BuilderResult {
  hasUpdates: boolean
  newCount: number
  processedCount: number
  skippedCount: number
  deletedCount: number
  totalPhotos: number
}

export interface BuildProgressStartPayload {
  total: number
  mode: 'worker' | 'cluster'
  concurrency: number
}

export interface BuildProgressSnapshot {
  total: number
  completed: number
  newCount: number
  processedCount: number
  skippedCount: number
  failedCount: number
  currentKey?: string
}

export interface BuildProgressListener {
  onStart?: (payload: BuildProgressStartPayload) => void
  onProgress?: (snapshot: BuildProgressSnapshot) => void
  onComplete?: (summary: BuildProgressSnapshot) => void
  onError?: (error: unknown) => void
}

export class AfilmoryBuilder {
  private storageManager: StorageManager | null = null
  private config: BuilderConfig
  private pluginManager: PluginManager
  private readonly pluginReferences: BuilderPluginConfigEntry[]

  constructor(config: BuilderConfig) {
    this.config = config

    this.pluginReferences = this.resolvePluginReferences()

    this.pluginManager = new PluginManager(this.pluginReferences, {
      baseDir: process.cwd(),
    })
  }

  async buildManifest(options: BuilderOptions): Promise<BuilderResult> {
    try {
      await this.ensurePluginsReady()
      this.ensureStorageManager()
      return await this.#buildManifest(options)
    } catch (error) {
      logger.main.error('❌ 构建 manifest 失败：', error)
      throw error
    }
  }
  /**
   * 构建照片清单
   * @param options 构建选项
   */
  async #buildManifest(options: BuilderOptions): Promise<BuilderResult> {
    const startTime = Date.now()
    const runState = this.pluginManager.createRunState()
    const manifest: PhotoManifestItem[] = []
    const processingResults: ProcessPhotoResult[] = []
    let processedCount = 0
    let skippedCount = 0
    let newCount = 0
    let failedCount = 0
    let deletedCount = 0

    try {
      await this.emitPluginEvent(runState, 'beforeBuild', {
        options,
      })

      this.logBuildStart()

      // 读取现有的 manifest（如果存在）
      const existingManifest = await this.loadExistingManifest(options)
      const existingManifestItems = existingManifest.data
      const existingManifestMap = new Map(existingManifestItems.map((item) => [item.s3Key, item]))

      await this.emitPluginEvent(runState, 'afterManifestLoad', {
        options,
        manifest: existingManifest,
        manifestMap: existingManifestMap,
      })

      logger.main.info(`现有 manifest 包含 ${existingManifestItems.length} 张照片`)

      const storageConfig = this.getStorageConfig()
      logger.main.info('使用存储提供商：', storageConfig.provider)

      const storageManager = this.getStorageManager()

      // 列出存储中的所有文件
      const allObjects = await storageManager.listAllFiles()
      logger.main.info(`存储中找到 ${allObjects.length} 个文件`)

      await this.emitPluginEvent(runState, 'afterAllFilesListed', {
        options,
        allObjects,
      })

      // 检测 Live Photo 配对（如果启用）
      const livePhotoMap = await this.detectLivePhotos(allObjects)
      if (this.config.system.processing.enableLivePhotoDetection) {
        logger.main.info(`检测到 ${livePhotoMap.size} 个 Live Photo`)
      }

      await this.emitPluginEvent(runState, 'afterLivePhotoDetection', {
        options,
        livePhotoMap,
      })

      const threeDSceneMap = await this.detectThreeDScenes(allObjects)
      if (threeDSceneMap.size > 0) {
        logger.main.info(`检测到 ${threeDSceneMap.size} 个 3D 场景文件`)
      }

      // 列出存储中的所有图片文件
      const imageObjects = await storageManager.listImages()
      logger.main.info(`存储中找到 ${imageObjects.length} 张照片`)

      await this.emitPluginEvent(runState, 'afterImagesListed', {
        options,
        imageObjects,
      })

      if (imageObjects.length === 0) {
        logger.main.error('❌ 没有找到需要处理的照片')
        const result: BuilderResult = {
          hasUpdates: false,
          newCount: 0,
          processedCount: 0,
          skippedCount: 0,
          deletedCount: 0,
          totalPhotos: 0,
        }

        await this.emitPluginEvent(runState, 'afterBuild', {
          options,
          result,
          manifest,
        })

        return result
      }

      // 创建存储中存在的图片 key 集合，用于检测已删除的图片
      const s3ImageKeys = new Set(imageObjects.map((obj) => obj.key))

      // 筛选出实际需要处理的图片
      let tasksToProcess = await this.filterTaskImages(imageObjects, existingManifestMap, options)

      // 为减少尾部长耗时，按文件大小降序处理（优先处理大文件）
      if (tasksToProcess.length > 1) {
        const beforeFirst = tasksToProcess[0]?.key
        tasksToProcess = tasksToProcess.sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
        if (beforeFirst !== tasksToProcess[0]?.key) {
          logger.main.info('已按文件大小降序重排处理队列')
        }
      }

      await this.emitPluginEvent(runState, 'afterTasksPrepared', {
        options,
        tasks: tasksToProcess,
        totalImages: imageObjects.length,
      })

      logger.main.info(`存储中找到 ${imageObjects.length} 张照片，实际需要处理 ${tasksToProcess.length} 张`)

      const processorOptions: PhotoProcessorOptions = {
        isForceMode: options.isForceMode,
        isForceManifest: options.isForceManifest,
        isForceThumbnails: options.isForceThumbnails,
      }

      const concurrency = options.concurrencyLimit ?? this.config.system.processing.defaultConcurrency
      const { useClusterMode } = this.config.system.observability.performance.worker
      const shouldUseCluster = useClusterMode && tasksToProcess.length >= concurrency * 2
      const { progressListener } = options

      await this.emitPluginEvent(runState, 'beforeProcessTasks', {
        options,
        tasks: tasksToProcess,
        processorOptions,
        mode: shouldUseCluster ? 'cluster' : 'worker',
        concurrency,
      })

      if (tasksToProcess.length === 0) {
        logger.main.info('💡 没有需要处理的照片，使用现有 manifest')
        for (const item of existingManifestItems) {
          if (!s3ImageKeys.has(item.s3Key)) continue

          await this.emitPluginEvent(runState, 'beforeAddManifestItem', {
            options,
            item,
            pluginData: {},
            resultType: 'skipped',
          })

          manifest.push(item)
        }
      } else {
        const totalTasks = tasksToProcess.length
        let completedTaskCount = 0

        const applyResultCounters = (result: ProcessPhotoResult | null | undefined): void => {
          if (!result) return

          switch (result.type) {
            case 'new': {
              newCount++
              processedCount++
              break
            }
            case 'processed': {
              processedCount++
              break
            }
            case 'skipped': {
              skippedCount++
              break
            }
            case 'failed': {
              failedCount++
              break
            }
          }
        }

        const emitProgress = (currentKey?: string): void => {
          progressListener?.onProgress?.({
            total: totalTasks,
            completed: completedTaskCount,
            newCount,
            processedCount,
            skippedCount,
            failedCount,
            currentKey,
          })
        }

        const handleTaskCompleted = ({
          result,
          taskIndex,
          completed,
        }: TaskCompletedPayload<ProcessPhotoResult>): void => {
          if (result) {
            applyResultCounters(result)
          }

          completedTaskCount = completed
          const key = tasksToProcess[taskIndex]?.key
          emitProgress(key)
        }

        progressListener?.onStart?.({
          total: totalTasks,
          mode: shouldUseCluster ? 'cluster' : 'worker',
          concurrency,
        })
        emitProgress()

        let results: ProcessPhotoResult[]

        logger.main.info(
          `开始${shouldUseCluster ? '多进程' : '并发'}处理任务，${shouldUseCluster ? '进程' : 'Worker'}数：${concurrency}${shouldUseCluster ? `，每进程并发：${this.config.system.observability.performance.worker.workerConcurrency}` : ''}`,
        )

        if (shouldUseCluster) {
          const clusterPool = new ClusterPool<ProcessPhotoResult>({
            concurrency,
            totalTasks: tasksToProcess.length,
            workerConcurrency: this.config.system.observability.performance.worker.workerConcurrency,
            workerEnv: {
              FORCE_MODE: processorOptions.isForceMode.toString(),
              FORCE_MANIFEST: processorOptions.isForceManifest.toString(),
              FORCE_THUMBNAILS: processorOptions.isForceThumbnails.toString(),
            },
            sharedData: {
              existingManifestMap,
              livePhotoMap,
              threeDSceneMap,
              imageObjects: tasksToProcess,
              builderConfig: this.getConfig(),
            },
            onTaskCompleted: handleTaskCompleted,
          })

          results = await clusterPool.execute()
        } else {
          const workerPool = new WorkerPool<ProcessPhotoResult>({
            concurrency,
            totalTasks: tasksToProcess.length,
            onTaskCompleted: handleTaskCompleted,
          })

          results = await workerPool.execute(async (taskIndex, workerId) => {
            const obj = tasksToProcess[taskIndex]

            const legacyObj = {
              Key: obj.key,
              Size: obj.size,
              LastModified: obj.lastModified,
              ETag: obj.etag,
            }

            const legacyLivePhotoMap = new Map()
            for (const [key, value] of livePhotoMap) {
              legacyLivePhotoMap.set(key, {
                Key: value.key,
                Size: value.size,
                LastModified: value.lastModified,
                ETag: value.etag,
              })
            }
            const legacyThreeDSceneMap = new Map()
            for (const [key, value] of threeDSceneMap) {
              legacyThreeDSceneMap.set(key, {
                Key: value.key,
                Size: value.size,
                LastModified: value.lastModified,
                ETag: value.etag,
              })
            }

            return await processPhoto(
              legacyObj,
              taskIndex,
              workerId,
              tasksToProcess.length,
              existingManifestMap,
              legacyLivePhotoMap,
              legacyThreeDSceneMap,
              processorOptions,
              this,
              {
                runState,
                builderOptions: options,
              },
            )
          })
        }

        processingResults.push(...results)

        for (const result of results) {
          if (!result.item) continue

          await this.emitPluginEvent(runState, 'beforeAddManifestItem', {
            options,
            item: result.item,
            pluginData: result.pluginData ?? {},
            resultType: result.type,
          })

          manifest.push(result.item)
        }

        completedTaskCount = Math.max(completedTaskCount, totalTasks)
        emitProgress()
        progressListener?.onComplete?.({
          total: totalTasks,
          completed: completedTaskCount,
          newCount,
          processedCount,
          skippedCount,
          failedCount,
        })

        for (const [key, item] of existingManifestMap) {
          if (s3ImageKeys.has(key) && !manifest.some((m) => m.s3Key === key)) {
            await this.emitPluginEvent(runState, 'beforeAddManifestItem', {
              options,
              item,
              pluginData: {},
              resultType: 'skipped',
            })

            manifest.push(item)
            skippedCount++
          }
        }
      }

      if (tasksToProcess.length === 0 && progressListener) {
        progressListener.onComplete?.({
          total: 0,
          completed: 0,
          newCount,
          processedCount,
          skippedCount,
          failedCount,
        })
      }

      await this.emitPluginEvent(runState, 'afterProcessTasks', {
        options,
        tasks: tasksToProcess,
        results: processingResults,
        manifest,
        stats: {
          newCount,
          processedCount,
          skippedCount,
        },
      })

      // 检测并处理已删除的图片
      deletedCount = await handleDeletedPhotos(manifest)

      await this.emitPluginEvent(runState, 'afterCleanup', {
        options,
        manifest,
        deletedCount,
      })

      // 生成相机和镜头集合
      const cameras = this.generateCameraCollection(manifest)
      const lenses = this.generateLensCollection(manifest)

      await this.emitPluginEvent(runState, 'beforeSaveManifest', {
        options,
        manifest,
        cameras,
        lenses,
      })

      await saveManifest(manifest, cameras, lenses)

      await this.emitPluginEvent(runState, 'afterSaveManifest', {
        options,
        manifest,
        cameras,
        lenses,
      })

      if (this.config.system.observability.showDetailedStats) {
        this.logBuildResults(
          manifest,
          {
            newCount,
            processedCount,
            skippedCount,
            deletedCount,
          },
          Date.now() - startTime,
        )
      }

      const hasUpdates = newCount > 0 || processedCount > 0 || deletedCount > 0
      const result: BuilderResult = {
        hasUpdates,
        newCount,
        processedCount,
        skippedCount,
        deletedCount,
        totalPhotos: manifest.length,
      }

      await this.emitPluginEvent(runState, 'afterBuild', {
        options,
        result,
        manifest,
      })

      return result
    } catch (error) {
      options.progressListener?.onError?.(error)
      await this.emitPluginEvent(runState, 'onError', {
        options,
        error,
      })
      throw error
    }
  }

  private async loadExistingManifest(options: BuilderOptions): Promise<AfilmoryManifest> {
    return options.isForceMode || options.isForceManifest
      ? {
          version: CURRENT_MANIFEST_VERSION,
          data: [],
          cameras: [],
          lenses: [],
        }
      : await loadExistingManifest()
  }

  private async detectLivePhotos(
    allObjects: Awaited<ReturnType<StorageManager['listAllFiles']>>,
  ): Promise<Map<string, (typeof allObjects)[0]>> {
    if (!this.config.system.processing.enableLivePhotoDetection) {
      return new Map()
    }

    return await this.getStorageManager().detectLivePhotos(allObjects)
  }

  private async detectThreeDScenes(
    allObjects: Awaited<ReturnType<StorageManager['listAllFiles']>>,
  ): Promise<Map<string, (typeof allObjects)[0]>> {
    return await this.getStorageManager().detectThreeDScenes(allObjects)
  }

  private logBuildStart(): void {
    const storage = this.getStorageConfig()
    switch (storage.provider) {
      case 's3':
      case 'oss':
      case 'cos': {
        const endpoint = storage.endpoint || '默认 AWS S3'
        const customDomain = storage.customDomain || '未设置'
        const { bucket } = storage
        const prefix = storage.prefix || '无前缀'

        logger.main.info('🚀 开始从存储获取照片列表...')
        logger.main.info(`🔗 使用端点：${endpoint}`)
        logger.main.info(`🌐 自定义域名：${customDomain}`)
        logger.main.info(`🪣 存储桶：${bucket}`)
        logger.main.info(`📂 前缀：${prefix}`)
        break
      }
      case 'github': {
        const { owner, repo, branch, path } = storage
        logger.main.info('🚀 开始从存储获取照片列表...')
        logger.main.info(`👤 仓库所有者：${owner}`)
        logger.main.info(`🏷️ 仓库名称：${repo}`)
        logger.main.info(`🌲 分支：${branch}`)
        logger.main.info(`📂 路径：${path}`)
        break
      }
    }
  }

  private logBuildResults(
    manifest: PhotoManifestItem[],
    stats: {
      newCount: number
      processedCount: number
      skippedCount: number
      deletedCount: number
    },
    totalDuration: number,
  ): void {
    const durationSeconds = Math.round(totalDuration / 1000)
    const durationMinutes = Math.floor(durationSeconds / 60)
    const remainingSeconds = durationSeconds % 60

    logger.main.success(`🎉 Manifest 构建完成!`)
    logger.main.info(`📊 处理统计:`)
    logger.main.info(`   📸 总照片数：${manifest.length}`)
    logger.main.info(`   🆕 新增照片：${stats.newCount}`)
    logger.main.info(`   🔄 处理照片：${stats.processedCount}`)
    logger.main.info(`   ⏭️ 跳过照片：${stats.skippedCount}`)
    logger.main.info(`   🗑️ 删除照片：${stats.deletedCount}`)
    logger.main.info(
      `   ⏱️ 总耗时：${durationMinutes > 0 ? `${durationMinutes}分${remainingSeconds}秒` : `${durationSeconds}秒`}`,
    )
  }

  /**
   * 获取当前使用的存储管理器
   */
  getStorageManager(): StorageManager {
    return this.ensureStorageManager()
  }

  setStorageManager(manager: StorageManager): void {
    this.storageManager = manager
  }

  registerStorageProvider(
    provider: string,
    factory: StorageProviderFactory,
    options?: StorageProviderRegistrationOptions,
  ): void {
    StorageFactory.registerProvider(provider, factory, options)

    if (this.getStorageConfig().provider === provider) {
      this.storageManager = null
      this.ensureStorageManager()
    }
  }

  createPluginRunState(): PluginRunState {
    return this.pluginManager.createRunState()
  }

  async emitPluginEvent<TEvent extends keyof BuilderPluginEventPayloads>(
    runState: PluginRunState,
    event: TEvent,
    payload: BuilderPluginEventPayloads[TEvent],
  ): Promise<void> {
    await this.pluginManager.emit(this, runState, event, payload)
  }

  async ensurePluginsReady(): Promise<void> {
    await this.pluginManager.ensureLoaded(this)
  }

  private resolvePluginReferences(): BuilderPluginConfigEntry[] {
    const references: BuilderPluginConfigEntry[] = []
    const seen = new Set<string>()

    const addReference = (ref: BuilderPluginConfigEntry) => {
      if (typeof ref === 'string') {
        if (seen.has(ref)) return
        seen.add(ref)
        references.push(ref)
        return
      }

      const pluginName = ref.name
      if (pluginName) {
        const key = `plugin:${pluginName}`
        if (seen.has(key)) {
          return
        }
        seen.add(key)
      }
      references.push(ref)
    }

    const hasPluginWithName = (name: string): boolean => {
      return references.some((ref) => {
        if (typeof ref === 'string') {
          return false
        }
        return ref.name === name
      })
    }

    const storagePluginByProvider: Record<string, BuilderPluginESMImporter> = {
      s3: () => import('@afilmory/builder/plugins/storage/s3.js'),
      b2: () => import('@afilmory/builder/plugins/storage/b2.js'),
      github: () => import('@afilmory/builder/plugins/storage/github.js'),
      eagle: () => import('@afilmory/builder/plugins/storage/eagle.js'),
      local: () => import('@afilmory/builder/plugins/storage/local.js'),
    }

    const storageProvider = this.getStorageConfig().provider
    const storagePlugin = storagePluginByProvider[storageProvider]
    if (storagePlugin) {
      const expectedName = `afilmory:storage:${storageProvider}`
      if (hasPluginWithName(expectedName)) {
        return references
      }
      addReference(storagePlugin)
    }

    for (const ref of this.config.plugins) {
      addReference(ref)
    }

    return references
  }

  private ensureStorageManager(): StorageManager {
    if (!this.storageManager) {
      this.storageManager = new StorageManager(this.getStorageConfig())
    }

    return this.storageManager
  }

  private getUserSettings(): UserBuilderSettings {
    if (!this.config.user) {
      throw new Error('User configuration is missing. 请配置 system/user 设置。')
    }
    return this.config.user
  }

  getStorageConfig(): StorageConfig {
    const { storage } = this.getUserSettings()
    if (!storage) {
      throw new Error('Storage configuration is missing. 请配置 system/user storage 设置。')
    }
    return storage
  }

  /**
   * 获取当前配置
   */
  getConfig(): BuilderConfig {
    return Object.freeze(this.config)
  }

  /**
   * 筛选出实际需要处理的图片
   * @param imageObjects 存储中的图片对象列表
   * @param existingManifestMap 现有 manifest 的映射
   * @param options 构建选项
   * @returns 实际需要处理的图片数组
   */
  private async filterTaskImages(
    imageObjects: Awaited<ReturnType<StorageManager['listImages']>>,
    existingManifestMap: Map<string, PhotoManifestItem>,
    options: BuilderOptions,
  ): Promise<Awaited<ReturnType<StorageManager['listImages']>>> {
    // 强制模式下所有图片都需要处理
    if (options.isForceMode || options.isForceManifest) {
      return imageObjects
    }

    const tasksToProcess: Awaited<ReturnType<StorageManager['listImages']>> = []

    for (const obj of imageObjects) {
      const { key } = obj
      const photoId = path.basename(key, path.extname(key))
      const existingItem = existingManifestMap.get(key)

      // 新图片需要处理
      if (!existingItem) {
        tasksToProcess.push(obj)
        continue
      }

      // 检查是否需要更新（基于修改时间）
      const legacyObj = {
        Key: key,
        Size: obj.size,
        LastModified: obj.lastModified,
        ETag: obj.etag,
      }

      if (needsUpdate(existingItem, legacyObj)) {
        tasksToProcess.push(obj)
        continue
      }

      // 检查缩略图是否存在，如果不存在或强制刷新缩略图则需要处理
      const hasThumbnail = await thumbnailExists(photoId)
      if (!hasThumbnail || options.isForceThumbnails) {
        tasksToProcess.push(obj)
        continue
      }

      // 其他情况下跳过处理
    }

    return tasksToProcess
  }

  /**
   * 生成相机信息集合
   * @param manifest 照片清单数组
   * @returns 唯一相机信息数组
   */
  private generateCameraCollection(manifest: PhotoManifestItem[]): CameraInfo[] {
    const cameraMap = new Map<string, CameraInfo>()

    for (const photo of manifest) {
      if (!photo.exif?.Make || !photo.exif?.Model) continue

      const make = photo.exif.Make.trim()
      const model = photo.exif.Model.trim()
      const displayName = `${make} ${model}`

      // 使用 displayName 作为唯一键，避免重复
      if (!cameraMap.has(displayName)) {
        cameraMap.set(displayName, {
          make,
          model,
          displayName,
        })
      }
    }

    // 按 displayName 排序返回
    return Array.from(cameraMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName))
  }

  /**
   * 生成镜头信息集合
   * @param manifest 照片清单数组
   * @returns 唯一镜头信息数组
   */
  private generateLensCollection(manifest: PhotoManifestItem[]): LensInfo[] {
    const lensMap = new Map<string, LensInfo>()

    for (const photo of manifest) {
      if (!photo.exif?.LensModel) continue

      const lensModel = photo.exif.LensModel.trim()
      const lensMake = photo.exif.LensMake?.trim()

      // 生成显示名称：如果有厂商信息则包含，否则只显示型号
      const displayName = lensMake ? `${lensMake} ${lensModel}` : lensModel

      // 使用 displayName 作为唯一键，避免重复
      if (!lensMap.has(displayName)) {
        lensMap.set(displayName, {
          make: lensMake,
          model: lensModel,
          displayName,
        })
      }
    }

    // 按 displayName 排序返回
    return Array.from(lensMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName))
  }
}
