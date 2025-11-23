import { randomUUID } from 'node:crypto'
import path from 'node:path'

import type { BuilderConfig, StorageConfig, StorageManager, StorageObject } from '@afilmory/builder'
import { resolveBuilderConfig } from '@afilmory/builder'
import type { ThumbnailPluginData } from '@afilmory/builder/plugins/thumbnail-storage/shared.js'
import {
  DEFAULT_DIRECTORY as DEFAULT_THUMBNAIL_DIRECTORY,
  THUMBNAIL_PLUGIN_DATA_KEY,
} from '@afilmory/builder/plugins/thumbnail-storage/shared.js'
import { ContextParam, Controller, createLogger, Post } from '@afilmory/framework'
import { BizException, ErrorCode } from 'core/errors'
import { Roles } from 'core/guards/roles.decorator'
import { BypassResponseTransform } from 'core/interceptors/response-transform.decorator'
import { PhotoBuilderService } from 'core/modules/content/photo/builder/photo-builder.service'
import { runWithBuilderLogRelay } from 'core/modules/infrastructure/data-sync/builder-log-relay'
import type { DataSyncProgressEmitter } from 'core/modules/infrastructure/data-sync/data-sync.types'
import { createProgressSseResponse } from 'core/modules/shared/http/sse'
import type { Context } from 'hono'

import type { BuilderDebugProgressEvent, StorageResolution, UploadedDebugFile } from './InMemoryDebugStorageProvider'
import { InMemoryDebugStorageProvider } from './InMemoryDebugStorageProvider'

const DEBUG_STORAGE_PREFIX = '.afilmory/debug'
const DEBUG_STORAGE_PROVIDER = 'super-admin-debug-storage'

@Controller('super-admin/builder')
@Roles('superadmin')
export class SuperAdminBuilderDebugController {
  private readonly logger = createLogger('SuperAdminBuilderDebugController')

  constructor(private readonly photoBuilderService: PhotoBuilderService) {}

  @Post('debug')
  @BypassResponseTransform()
  async runDebug(@ContextParam() context: Context): Promise<Response> {
    const payload = await context.req.parseBody()
    const file = await this.extractFirstFile(payload)
    if (!file) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: '请上传一张待调试的图片文件',
      })
    }

    if (file.contentType && !file.contentType.toLowerCase().startsWith('image/')) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: '调试通道仅支持图片文件',
      })
    }

    const storage = await this.createDebugStorageContext()
    return createProgressSseResponse<BuilderDebugProgressEvent>({
      context,
      handler: async ({ sendEvent }) => {
        const logEmitter: DataSyncProgressEmitter = async (event) => {
          if (event.type !== 'log') {
            return
          }
          await sendEvent({ type: 'log', payload: event.payload })
        }

        try {
          const result = await this.executeDebugRun({
            ...storage,
            file,
            sendEvent,
            logEmitter,
          })

          await sendEvent({
            type: 'complete',
            payload: {
              storageKey: result.storageKey,
              resultType: result.resultType,
              manifestItem: result.manifestItem,
              thumbnailUrl: result.thumbnailUrl,
              filesDeleted: result.filesDeleted,
            },
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          this.logger.error('Builder debug run failed', error)
          await sendEvent({ type: 'error', payload: { message } })
        }
      },
    })
  }

  private async createDebugStorageContext(): Promise<StorageResolution> {
    const builderConfig = resolveBuilderConfig({})

    const storageConfig: StorageConfig = { provider: DEBUG_STORAGE_PROVIDER }

    if (!builderConfig.user || typeof builderConfig.user !== 'object') {
      builderConfig.user = {} as NonNullable<BuilderConfig['user']>
    }

    builderConfig.user.storage = storageConfig

    const builder = this.photoBuilderService.createBuilder(builderConfig)
    builder.registerStorageProvider(DEBUG_STORAGE_PROVIDER, () => new InMemoryDebugStorageProvider(), {
      category: 'local',
    })
    this.photoBuilderService.applyStorageConfig(builder, storageConfig)

    return {
      builder,
      builderConfig,
      storageConfig,
      storageManager: builder.getStorageManager(),
    }
  }

  private async executeDebugRun(
    params: StorageResolution & {
      file: UploadedDebugFile
      sendEvent: (event: BuilderDebugProgressEvent) => Promise<void>
      logEmitter: DataSyncProgressEmitter
    },
  ) {
    const { builder, builderConfig, storageManager, file, sendEvent, logEmitter } = params
    const cleanupKeys = new Set<string>()

    const tempKey = this.createTemporaryStorageKey(file.name)
    const uploaded = await storageManager.uploadFile(tempKey, file.buffer, {
      contentType: file.contentType ?? undefined,
    })
    const normalizedObject = this.normalizeStorageObjectKey(uploaded, tempKey)
    cleanupKeys.add(normalizedObject.key)

    await sendEvent({
      type: 'start',
      payload: {
        storageKey: normalizedObject.key,
        filename: file.name,
        contentType: file.contentType,
        size: file.size,
      },
    })

    let processed: Awaited<ReturnType<typeof this.photoBuilderService.processPhotoFromStorageObject>> | null = null
    let filesDeleted = false
    try {
      processed = await runWithBuilderLogRelay(logEmitter, () =>
        this.photoBuilderService.processPhotoFromStorageObject(normalizedObject, {
          builder,
          builderConfig,
          processorOptions: {
            isForceMode: true,
            isForceManifest: true,
            isForceThumbnails: true,
          },
        }),
      )

      const thumbnailKey = this.resolveThumbnailStorageKey(processed?.pluginData)
      if (thumbnailKey) {
        cleanupKeys.add(thumbnailKey)
      }
    } finally {
      filesDeleted = await this.cleanupDebugArtifacts(storageManager, cleanupKeys)
    }

    return {
      storageKey: normalizedObject.key,
      resultType: processed?.type ?? 'failed',
      manifestItem: processed?.item ?? null,
      thumbnailUrl: processed?.item?.thumbnailUrl ?? null,
      filesDeleted,
    }
  }

  private async extractFirstFile(payload: Record<string, unknown>): Promise<UploadedDebugFile | null> {
    const files: File[] = []

    for (const value of Object.values(payload)) {
      if (value instanceof File) {
        files.push(value)
      } else if (Array.isArray(value)) {
        for (const entry of value) {
          if (entry instanceof File) {
            files.push(entry)
          }
        }
      }
    }

    const file = files[0]
    if (!file) {
      return null
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    return {
      name: file.name || 'debug-upload',
      size: file.size,
      contentType: file.type || null,
      buffer,
    }
  }

  private createTemporaryStorageKey(filename: string): string {
    const ext = path.extname(filename)
    const safeExt = ext || '.jpg'
    const baseName = `${Date.now()}-${randomUUID()}`
    return this.joinSegments(DEBUG_STORAGE_PREFIX, `${baseName}${safeExt}`)
  }

  private normalizeStorageObjectKey(object: StorageObject, fallbackKey: string): StorageObject {
    const normalizedKey = this.normalizeKeyPath(object?.key ?? fallbackKey)
    if (normalizedKey === object?.key) {
      return object
    }
    return {
      ...object,
      key: normalizedKey,
    }
  }

  private normalizeKeyPath(raw: string | undefined | null): string {
    if (!raw) {
      return ''
    }
    const segments = raw.split(/[\\/]+/)
    const safeSegments: string[] = []
    for (const segment of segments) {
      const trimmed = segment.trim()
      if (!trimmed || trimmed === '.' || trimmed === '..') {
        continue
      }
      safeSegments.push(trimmed)
    }
    return safeSegments.join('/')
  }

  private async cleanupDebugArtifacts(storageManager: StorageManager, keys: Set<string>): Promise<boolean> {
    let success = true
    for (const key of keys) {
      try {
        await storageManager.deleteFile(key)
      } catch (error) {
        success = false
        this.logger.warn(`Failed to delete debug artifact ${key}`, error)
      }
    }
    return success
  }

  private resolveThumbnailStorageKey(pluginData?: Record<string, unknown>): string | null {
    if (!pluginData || !pluginData[THUMBNAIL_PLUGIN_DATA_KEY]) {
      return null
    }

    const data = pluginData[THUMBNAIL_PLUGIN_DATA_KEY] as ThumbnailPluginData
    if (!data?.fileName) {
      return null
    }

    const remotePrefix = this.joinSegments(DEFAULT_THUMBNAIL_DIRECTORY)

    return this.joinSegments(remotePrefix, data.fileName)
  }

  private joinSegments(...segments: Array<string | null | undefined>): string {
    const parts: string[] = []

    for (const raw of segments) {
      if (!raw) {
        continue
      }
      const normalized = raw
        .replaceAll('\\', '/')
        .replaceAll(/^\/+|\/+$/g, '')
        .trim()
      if (normalized.length > 0) {
        parts.push(normalized)
      }
    }

    return parts.join('/')
  }
}
