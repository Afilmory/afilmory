import { randomUUID } from 'node:crypto'

import { RedisQueueDriver, TaskDropError, TaskQueue, TaskQueueManager, TaskRetryError } from '@afilmory/task-queue'
import { RedisAccessor } from '@core/redis/redis.provider'
import { createLogger } from '@tsuki-hono/common'
import { injectable } from 'tsyringe'

import { APNsProvider } from './apns.provider'
import { alternateAPNsEnvironment } from './apns.utils'
import { galleryPushBody } from './gallery-push.copy'
import type { GalleryPushPreview } from './gallery-push.payload'
import { PushDeviceService } from './push-device.service'

const QUEUE_NAME = 'gallery-push-notifications'
const TASK_NAME = 'send-gallery-update'

interface GalleryPushTaskPayload {
  avatarUrl?: string
  deliveryId: string
  deviceId: string
  eventId: string
  galleryName: string
  gallerySlug: string
  imageUrl?: string
  photoCount: number
  photoId?: string
  targetTenantId: string
}

@injectable()
export class GalleryPushQueue {
  private readonly logger = createLogger('GalleryPushQueue')
  private readonly queue: TaskQueue
  private readonly workerRedis: ReturnType<RedisAccessor['get']>

  constructor(
    queueManager: TaskQueueManager,
    redisAccessor: RedisAccessor,
    private readonly apnsProvider: APNsProvider,
    private readonly devices: PushDeviceService,
  ) {
    this.workerRedis = redisAccessor.get().duplicate()
    this.queue = queueManager.createQueue(QUEUE_NAME, {
      concurrency: 8,
      driver: new RedisQueueDriver({
        queueName: QUEUE_NAME,
        redis: this.workerRedis,
        visibilityTimeoutMs: 2 * 60 * 1000,
      }),
      start: false,
      visibilityTimeoutMs: 2 * 60 * 1000,
    })
  }

  async onModuleInit(): Promise<void> {
    this.queue.registerHandler<GalleryPushTaskPayload>(TASK_NAME, this.process.bind(this), {
      maxAttempts: 4,
      retryableFilter: error => error instanceof TaskRetryError,
    })
    await this.queue.start({ pollIntervalMs: 1_000 })
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.shutdown()
    this.apnsProvider.shutdown()
    await this.workerRedis.quit()
  }

  async enqueueGalleryPublished(
    targetTenantId: string,
    photoCount: number,
    preview?: GalleryPushPreview | null,
  ): Promise<void> {
    if (!this.apnsProvider.isConfigured() || photoCount <= 0) {
      return
    }

    const recipients = await this.devices.listGalleryRecipientDeviceIds(targetTenantId)
    if (!recipients.gallery || recipients.deviceIds.length === 0) {
      return
    }

    const eventId = randomUUID()
    await Promise.all(
      recipients.deviceIds.map(async (deviceId) => {
        const deliveryId = randomUUID()
        await this.queue.enqueue<GalleryPushTaskPayload>({
          id: deliveryId,
          name: TASK_NAME,
          payload: {
            avatarUrl: recipients.gallery!.avatarUrl,
            deliveryId,
            deviceId,
            eventId,
            galleryName: recipients.gallery!.name,
            gallerySlug: recipients.gallery!.slug,
            imageUrl: preview?.imageUrl,
            photoCount,
            photoId: preview?.photoId,
            targetTenantId,
          },
        })
      }),
    )

    this.logger.info('Queued gallery update notifications', {
      eventId,
      photoCount,
      recipients: recipients.deviceIds.length,
      targetTenantId,
    })
  }

  private async process(payload: GalleryPushTaskPayload): Promise<void> {
    if (!this.apnsProvider.isConfigured()) {
      throw new TaskDropError('APNs provider credentials are not configured.')
    }

    const device = await this.devices.findDeliverableDevice(payload.deviceId, payload.targetTenantId)
    if (!device) {
      throw new TaskDropError('The device is no longer eligible for this gallery notification.')
    }

    const notification = {
      avatarUrl: payload.avatarUrl,
      body: galleryPushBody(device.locale, payload.photoCount),
      deliveryId: payload.deliveryId,
      eventId: payload.eventId,
      galleryName: payload.galleryName,
      gallerySlug: payload.gallerySlug,
      imageUrl: payload.imageUrl,
      photoCount: payload.photoCount,
      photoId: payload.photoId,
      title: payload.galleryName,
    }
    let result = await this.apnsProvider.send(device.deviceToken, device.environment, notification)

    if (!result.success && result.reason === 'BadDeviceToken') {
      const alternateEnvironment = alternateAPNsEnvironment(device.environment)
      const alternateResult = await this.apnsProvider.send(device.deviceToken, alternateEnvironment, notification)
      if (alternateResult.success) {
        await this.devices.updateEnvironment(device.id, alternateEnvironment)
        return
      }
      result = alternateResult
    }

    if (result.success) {
      return
    }
    if (result.invalidToken) {
      await this.devices.disable(device.id)
      return
    }
    if (result.retryable) {
      throw new TaskRetryError(`APNs delivery is temporarily unavailable (${result.status}).`)
    }
    throw new TaskDropError(`APNs rejected the notification (${result.status}: ${result.reason ?? 'Unknown'}).`)
  }
}
