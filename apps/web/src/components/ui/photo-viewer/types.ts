import type { ImageLoaderManager } from '~/lib/image-loader-manager'

import type { LivePhotoVideoHandle } from './LivePhotoVideo'
import type { LoadingIndicatorRef } from './LoadingIndicator'

export const SHOW_SCALE_INDICATOR_DURATION = 1000

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

  enableZoom?: boolean
  enablePan?: boolean
  maxZoom?: number
  minZoom?: number

  isCurrentImage?: boolean

  // Live Photo 相关 props
  isLivePhoto?: boolean
  livePhotoVideoUrl?: string

  loadingIndicatorRef: React.RefObject<LoadingIndicatorRef | null>
}

export interface WebGLImageViewerRef {
  zoomIn: (animated?: boolean) => void
  zoomOut: (animated?: boolean) => void
  resetView: () => void
  getScale: () => number
}

export interface DOMImageViewerProps {
  ref?: React.RefObject<
    import('react-zoom-pan-pinch').ReactZoomPanPinchRef | null
  >
  onZoomChange?: (isZoomed: boolean, scale: number) => any
  minZoom: number
  maxZoom: number
  src: string
  alt: string
  highResLoaded: boolean
  onLoad?: () => void
  children?: React.ReactNode
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
