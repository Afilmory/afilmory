import process from 'node:process'
import { deserialize } from 'node:v8'

import type { BuilderOptions } from './builder/builder.js'
import { AfilmoryBuilder } from './builder/builder.js'
import type { PluginRunState } from './plugins/manager.js'
import type { StorageObject } from './storage/interfaces'
import type { BuilderConfig } from './types/config.js'
import type { PhotoManifestItem } from './types/photo'
import type { BatchTaskMessage, BatchTaskResult, TaskMessage, TaskResult } from './worker/cluster-pool'

// 新增接口定义
interface WorkerInitMessage {
  type: 'init'
  sharedData: {
    data: number[] // Buffer 转换为数组传输
    length: number
  }
}

interface SharedData {
  existingManifestMap: Map<string, PhotoManifestItem>
  livePhotoMap: Map<string, StorageObject>
  imageObjects: StorageObject[]
  builderConfig: BuilderConfig
}

// Worker 进程处理逻辑
export async function runAsWorker() {
  process.title = 'photo-gallery-builder-worker'
  const workerId = Number.parseInt(process.env.WORKER_ID || '0')

  // 立即注册消息监听器，避免被异步初始化阻塞
  let isInitialized = false

  let imageObjects: StorageObject[]
  let existingManifestMap: Map<string, PhotoManifestItem>
  let livePhotoMap: Map<string, StorageObject>
  let builder: AfilmoryBuilder
  let pluginRunState: PluginRunState

  // 初始化函数，从主进程接收共享数据
  const initializeWorker = async (serializedData: WorkerInitMessage['sharedData']) => {
    if (isInitialized) return

    // 将数组重新转换为 Buffer，然后反序列化
    const buffer = Buffer.from(serializedData.data)
    const sharedData = deserialize(buffer) as SharedData

    // 从主进程接收的共享数据中恢复数据结构（数据已经是正确的类型）
    imageObjects = sharedData.imageObjects
    existingManifestMap = sharedData.existingManifestMap
    livePhotoMap = sharedData.livePhotoMap
    builder = new AfilmoryBuilder(sharedData.builderConfig)
    await builder.ensurePluginsReady()
    pluginRunState = builder.createPluginRunState()

    isInitialized = true
  }

  const handleTask = async (message: TaskMessage): Promise<void> => {
    try {
      // 确保 worker 已初始化
      if (!isInitialized) {
        throw new Error('Worker 未初始化，请先发送 init 消息')
      }

      // 动态导入 processPhoto（放在这里以避免阻塞消息监听）
      const { processPhoto } = await import('./photo/processor.js')

      const { taskIndex } = message

      // 根据 taskIndex 获取对应的图片对象
      const obj = imageObjects[taskIndex]
      if (!obj) {
        throw new Error(`Invalid taskIndex: ${taskIndex}`)
      }

      // 转换 StorageObject 到旧的 _Object 格式以兼容现有的 processPhoto 函数
      const legacyObj = {
        Key: obj.key,
        Size: obj.size,
        LastModified: obj.lastModified,
        ETag: obj.etag,
      }

      // 转换 Live Photo Map
      const legacyLivePhotoMap = new Map()
      for (const [key, value] of livePhotoMap) {
        legacyLivePhotoMap.set(key, {
          Key: value.key,
          Size: value.size,
          LastModified: value.lastModified,
          ETag: value.etag,
        })
      }

      // 处理器选项（这些可以作为环境变量传递或使用默认值）
      const processorOptions = {
        isForceMode: process.env.FORCE_MODE === 'true',
        isForceManifest: process.env.FORCE_MANIFEST === 'true',
        isForceThumbnails: process.env.FORCE_THUMBNAILS === 'true',
      }

      const builderOptions: BuilderOptions = {
        isForceMode: processorOptions.isForceMode,
        isForceManifest: processorOptions.isForceManifest,
        isForceThumbnails: processorOptions.isForceThumbnails,
        concurrencyLimit: undefined,
      }

      // 处理照片
      const result = await processPhoto(
        legacyObj,
        taskIndex,
        workerId,
        imageObjects.length,
        existingManifestMap,
        legacyLivePhotoMap,
        processorOptions,
        builder,
        {
          runState: pluginRunState,
          builderOptions,
        },
      )

      // 发送结果回主进程
      const response: TaskResult = {
        type: 'result',
        taskId: message.taskId,
        result,
      }

      if (process.send) {
        process.send(response)
      }
    } catch (error) {
      // 发送错误回主进程
      const response: TaskResult = {
        type: 'error',
        taskId: message.taskId,
        error: error instanceof Error ? error.message : String(error),
      }

      if (process.send) {
        process.send(response)
      }
    }
  }

  // 批量任务处理函数
  const handleBatchTask = async (message: BatchTaskMessage): Promise<void> => {
    try {
      // 确保已初始化
      if (!isInitialized) {
        throw new Error('Worker 未初始化，请先发送 init 消息')
      }

      const results: TaskResult[] = []
      const taskPromises: Promise<void>[] = []
      const batchProcessorOptions = {
        isForceMode: process.env.FORCE_MODE === 'true',
        isForceManifest: process.env.FORCE_MANIFEST === 'true',
        isForceThumbnails: process.env.FORCE_THUMBNAILS === 'true',
      }
      const batchBuilderOptions: BuilderOptions = {
        isForceMode: batchProcessorOptions.isForceMode,
        isForceManifest: batchProcessorOptions.isForceManifest,
        isForceThumbnails: batchProcessorOptions.isForceThumbnails,
        concurrencyLimit: undefined,
      }

      // 创建所有任务的并发执行 Promise
      for (const task of message.tasks) {
        const taskPromise = (async () => {
          try {
            const obj = imageObjects[task.taskIndex]

            // 转换 StorageObject 到旧的 _Object 格式以兼容现有的 processPhoto 函数
            const legacyObj = {
              Key: obj.key,
              Size: obj.size,
              LastModified: obj.lastModified,
              ETag: obj.etag,
            }

            // 转换 Live Photo Map
            const legacyLivePhotoMap = new Map()
            for (const [key, value] of livePhotoMap) {
              legacyLivePhotoMap.set(key, {
                Key: value.key,
                Size: value.size,
                LastModified: value.lastModified,
                ETag: value.etag,
              })
            }

            // 处理照片
            const { processPhoto } = await import('./photo/processor.js')
            const result = await processPhoto(
              legacyObj,
              task.taskIndex,
              workerId,
              imageObjects.length,
              existingManifestMap,
              legacyLivePhotoMap,
              batchProcessorOptions,
              builder,
              {
                runState: pluginRunState,
                builderOptions: batchBuilderOptions,
              },
            )

            // 添加成功结果
            results.push({
              type: 'result',
              taskId: task.taskId,
              result,
            })
          } catch (error) {
            // 添加错误结果
            results.push({
              type: 'error',
              taskId: task.taskId,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        })()

        taskPromises.push(taskPromise)
      }

      // 等待所有任务完成
      await Promise.all(taskPromises)

      // 发送批量结果回主进程
      const response: BatchTaskResult = {
        type: 'batch-result',
        results,
      }

      if (process.send) {
        process.send(response)
      }
    } catch (error) {
      // 如果批量处理失败，为每个任务发送错误结果
      const results: TaskResult[] = message.tasks.map((task) => ({
        type: 'error',
        taskId: task.taskId,
        error: error instanceof Error ? error.message : String(error),
      }))

      const response: BatchTaskResult = {
        type: 'batch-result',
        results,
      }

      if (process.send) {
        process.send(response)
      }
    }
  }

  // 立即注册消息监听器
  process.on(
    'message',
    async (message: TaskMessage | BatchTaskMessage | WorkerInitMessage | { type: 'shutdown' } | { type: 'ping' }) => {
      if (message.type === 'shutdown') {
        process.removeAllListeners('message')
        return
      }

      if (message.type === 'ping') {
        // 响应主进程的 ping，表示 worker 已准备好
        if (process.send) {
          process.send({ type: 'pong', workerId })
        }
        return
      }

      if (message.type === 'init') {
        // 处理初始化消息
        try {
          await initializeWorker(message.sharedData)
          if (process.send) {
            process.send({ type: 'init-complete', workerId })
          }
        } catch (error) {
          console.error('Worker initialization failed', error)
          process.exit(1)
        }
        return
      }

      if (message.type === 'batch-task') {
        await handleBatchTask(message)
      } else if (message.type === 'task') {
        await handleTask(message)
      }
    },
  )

  // 错误处理
  process.on('uncaughtException', (error) => {
    console.error('Worker uncaught exception:', error)
    process.exit(1)
  })

  process.on('unhandledRejection', (reason) => {
    console.error('Worker unhandled rejection:', reason)
    process.exit(1)
  })

  process.on('SIGINT', () => {
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    process.exit(0)
  })

  // 告知主进程 worker 已准备好
  if (process.send) {
    process.send({ type: 'ready', workerId })
  }
}
