import { Buffer } from 'node:buffer'

const APNS_PAYLOAD_MAX_BYTES = 4096

export type GalleryPushPreviewSource = {
  photoId: string | null
  thumbnailUrl: string | null | undefined
}

export type GalleryPushPreview = {
  imageUrl: string
  photoId: string
}

export type GalleryPushNotification = {
  avatarUrl?: string
  body: string
  eventId: string
  galleryName: string
  gallerySlug: string
  imageUrl?: string
  photoCount: number
  photoId?: string
  title: string
}

type GalleryPushAPNsPayload = {
  aps: {
    'alert': {
      body: string
      title: string
    }
    'mutable-content'?: 1
    'sound': 'default'
    'thread-id': string
  }
  avatarUrl?: string
  eventId: string
  galleryName: string
  gallerySlug: string
  imageUrl?: string
  photoCount: number
  photoId?: string
  route: 'gallery'
}

export function selectGalleryPushPreview(items: readonly GalleryPushPreviewSource[]): GalleryPushPreview | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (!item?.photoId) {
      continue
    }
    const imageUrl = publicHttpsImageUrl(item.thumbnailUrl)
    if (!imageUrl) {
      continue
    }
    return { imageUrl, photoId: item.photoId }
  }
  return null
}

export function buildGalleryPushAPNsPayload(notification: GalleryPushNotification): GalleryPushAPNsPayload {
  const photoId = notification.photoId?.trim() || undefined
  const imageUrl = publicHttpsImageUrl(notification.imageUrl)
  const avatarUrl = publicHttpsImageUrl(notification.avatarUrl)
  const candidates: Array<[string | undefined, string | undefined]> = [
    [imageUrl, avatarUrl],
    [undefined, avatarUrl],
    [imageUrl, undefined],
    [undefined, undefined],
  ]
  for (const [image, avatar] of candidates) {
    const payload = serializePayload(notification, photoId, image, avatar)
    if (utf8Bytes(payload) <= APNS_PAYLOAD_MAX_BYTES) {
      return payload
    }
  }
  return serializePayload(notification, photoId, undefined, undefined)
}

function serializePayload(
  notification: GalleryPushNotification,
  photoId: string | undefined,
  imageUrl: string | undefined,
  avatarUrl: string | undefined,
): GalleryPushAPNsPayload {
  return {
    aps: {
      'alert': {
        body: notification.body,
        title: notification.title,
      },
      ...(imageUrl || avatarUrl ? { 'mutable-content': 1 as const } : {}),
      'sound': 'default',
      'thread-id': `gallery:${notification.gallerySlug}`,
    },
    ...(avatarUrl ? { avatarUrl } : {}),
    eventId: notification.eventId,
    galleryName: notification.galleryName,
    gallerySlug: notification.gallerySlug,
    ...(imageUrl ? { imageUrl } : {}),
    photoCount: notification.photoCount,
    ...(photoId ? { photoId } : {}),
    route: 'gallery',
  }
}

function publicHttpsImageUrl(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) {
    return undefined
  }
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:' || !url.hostname) {
      return undefined
    }
    return trimmed
  }
  catch {
    return undefined
  }
}

function utf8Bytes(payload: GalleryPushAPNsPayload): number {
  return Buffer.byteLength(JSON.stringify(payload), 'utf8')
}
