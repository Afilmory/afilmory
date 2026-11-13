import type { VideoSource } from '~/modules/viewer/types'
import type { PhotoManifest } from '~/types/photo'

export type PlayableVideoSource = Exclude<VideoSource, { type: 'none' }>

export const liveVideoSource = (photo: PhotoManifest): PlayableVideoSource | null => {
  const { video } = photo
  if (!video) {
    return null
  }
  if (video.type === 'live-photo') {
    return { type: 'live-photo', videoUrl: video.videoUrl }
  }
  return {
    type: 'motion-photo',
    imageUrl: photo.originalUrl,
    offset: video.offset,
    size: video.size,
    presentationTimestamp: video.presentationTimestamp,
  }
}
