import type { CanvasPhoto } from '@afilmory/photo-canvas'
import { decompressUint8Array } from '@afilmory/utils'

import type { PhotoManifest } from '~/types/photo'

const cameraOf = (photo: PhotoManifest) => {
  const make = photo.exif?.Make?.trim()
  const model = photo.exif?.Model?.trim()
  return make && model ? `${make} ${model}` : null
}

const thumbHashOf = (photo: PhotoManifest) => {
  if (!photo.thumbHash) {
    return null
  }
  try {
    return decompressUint8Array(photo.thumbHash)
  }
  catch {
    return null
  }
}

export const toCanvasPhoto = (photo: PhotoManifest): CanvasPhoto => ({
  id: photo.id,
  aspectRatio: photo.aspectRatio,
  thumbnailUrl: photo.thumbnailUrl,
  thumbHash: thumbHashOf(photo),
  dateTaken: photo.dateTaken,
  camera: cameraOf(photo),
  tags: photo.tags,
  place: photo.location?.city || photo.location?.country || null,
})
