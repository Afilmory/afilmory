import type { PhotoRegion } from '@afilmory/builder'

import type { ImageLoaderManager } from '~/lib/image-loader-manager'

import type { LoadingIndicatorRef } from '../inspector'
import type { LivePhotoVideoHandle } from '../media'

export const SHOW_SCALE_INDICATOR_DURATION = 1000

// Video source 的 sum type：Live Photo 或 Motion Photo
export type VideoSource
  = | { type: 'live-photo', videoUrl: string }
    | {
      type: 'motion-photo'
      imageUrl: string
      offset: number
      size?: number
      presentationTimestamp?: number
    }
    | { type: 'none' }

export interface ProgressiveImageProps {
  src: string
  thumbnailSrc?: string

  alt: string
  width?: number
  height?: number
  className?: string
  onError?: () => void
  onProgress?: (progress: number) => void
  onZoomChange?: (isZoomed: boolean) => void
  onBlobSrcChange?: (blobSrc: string | null) => void
  onVisualReadyChange?: (ready: boolean) => void

  enableZoom?: boolean
  enablePan?: boolean
  maxZoom?: number
  minZoom?: number
  disableThumbnailTransition?: boolean

  isCurrentImage?: boolean
  shouldRenderHighRes?: boolean

  // Video source (Live Photo or Motion Photo)
  videoSource?: VideoSource
  shouldAutoPlayVideoOnce?: boolean
  regions?: PhotoRegion[]
  regionOrientation?: number
  regionAccentColor?: string
  regionLabelPlacement?: 'edge' | 'floating'
  activeRegionId?: string | null
  showAllRegions?: boolean
  enableRegionHover?: boolean
  onActiveRegionChange?: (regionId: string | null) => void

  // HDR 相关 props
  isHDR?: boolean

  loadingIndicatorRef: React.RefObject<LoadingIndicatorRef | null>
}

export interface LivePhotoBadgeProps {
  livePhotoRef: React.RefObject<LivePhotoVideoHandle | null>
  isLivePhotoPlaying: boolean
  imageLoaderManagerRef: React.RefObject<ImageLoaderManager | null>
}

export interface ProgressiveImageState {
  blobSrc: string | null
  highResLoaded: boolean
  error: boolean
  isHighResImageRendered: boolean
  currentScale: number
  showScaleIndicator: boolean
  isThumbnailLoaded: boolean
  isLivePhotoPlaying: boolean
}
