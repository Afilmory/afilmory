import { clsxm } from '@afilmory/utils'
import type { ImageViewportState } from '@afilmory/webgl-viewer'
import { ImageViewer } from '@afilmory/webgl-viewer'
import { AnimatePresence, m } from 'motion/react'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useShowContextMenu } from '~/atoms/context-menu'
import { SlidingNumber } from '~/components/ui/number/SlidingNumber'
import { isMobileDevice } from '~/lib/device-viewport'
import { HDRBadge } from '~/modules/media/HDRBadge'
import { LivePhotoBadge } from '~/modules/media/LivePhotoBadge'
import type { LivePhotoVideoHandle } from '~/modules/media/LivePhotoVideo'
import { LivePhotoVideo } from '~/modules/media/LivePhotoVideo'

import { ContainedImageFrame } from './ContainedImageFrame'
import { getProgressiveImageVisualReady, isThumbnailElementVisuallyReady } from './entry-animation-state'
import {
  createContextMenuItems,
  useImageLoader,
  useImageViewerLoadingState,
  useLivePhotoControls,
  useProgressiveImageState,
  useScaleIndicator,
} from './hooks'
import { PhotoRegionsOverlay } from './PhotoRegionsOverlay'
import type { ProgressiveImageProps } from './types'

const loadedThumbnailSrcSet = new Set<string>()

export const ProgressiveImage = ({
  src,
  thumbnailSrc,
  alt,
  width,
  height,
  className,
  onError,
  onProgress,
  onZoomChange,
  onBlobSrcChange,
  onVisualReadyChange,
  disableThumbnailTransition = false,
  enableZoom = true,
  enablePan = true,
  maxZoom = 20,
  minZoom = 1,
  isCurrentImage = false,
  shouldRenderHighRes = true,
  videoSource,
  shouldAutoPlayVideoOnce = false,
  regions = [],
  regionOrientation,
  regionAccentColor,
  regionLabelPlacement,
  activeRegionId,
  showAllRegions = false,
  enableRegionHover = true,
  onActiveRegionChange,
  loadingIndicatorRef,
}: ProgressiveImageProps) => {
  const { t } = useTranslation()

  // State management
  const [state, setState] = useProgressiveImageState()
  const {
    blobSrc,
    highResLoaded,
    error,
    isHighResImageRendered,
    currentScale,
    showScaleIndicator,
    isThumbnailLoaded,
    isLivePhotoPlaying,
  } = state

  const isActiveImage = Boolean(isCurrentImage && shouldRenderHighRes)

  // 判断是否有视频内容（Live Photo 或 Motion Photo）
  const hasVideo = Boolean(videoSource && videoSource.type !== 'none')

  // Refs
  const thumbnailRef = useRef<HTMLImageElement>(null)
  const imageViewerHostRef = useRef<HTMLDivElement>(null)
  const viewportFrameRef = useRef<HTMLDivElement>(null)
  const livePhotoRef = useRef<LivePhotoVideoHandle | null>(null)
  const [hasOverlayViewport, setHasOverlayViewport] = useState(false)
  const hasOverlayViewportRef = useRef(false)

  const resolvedSrc = useMemo(() => {
    if (src.startsWith('/')) {
      return new URL(src, window.location.origin).toString()
    }
    return src
  }, [src])

  // Hooks
  const imageLoaderManagerRef = useImageLoader(
    resolvedSrc,
    isCurrentImage,
    highResLoaded,
    error,
    onProgress,
    onError,
    onBlobSrcChange,
    loadingIndicatorRef,
    setState.setBlobSrc,
    setState.setHighResLoaded,
    setState.setError,
    setState.setIsHighResImageRendered,
  )

  const { onTransformed } = useScaleIndicator(onZoomChange, setState.setCurrentScale, setState.setShowScaleIndicator)

  const { handleLongPressStart, handleLongPressEnd } = useLivePhotoControls(hasVideo, isLivePhotoPlaying, livePhotoRef)

  const handleImageLoadingStateChange = useImageViewerLoadingState(loadingIndicatorRef)

  const handleThumbnailLoad = useCallback(() => {
    if (thumbnailSrc) {
      loadedThumbnailSrcSet.add(thumbnailSrc)
    }
    setState.setIsThumbnailLoaded(true)
  }, [setState, thumbnailSrc])

  useLayoutEffect(() => {
    if (!thumbnailSrc) {
      setState.setIsThumbnailLoaded(false)
      return
    }

    const thumbnailElement = thumbnailRef.current
    const isAlreadyLoaded
      = loadedThumbnailSrcSet.has(thumbnailSrc)
        || isThumbnailElementVisuallyReady({
          currentSrc: thumbnailElement?.currentSrc,
          naturalWidth: thumbnailElement?.naturalWidth,
          src: thumbnailElement?.src,
          thumbnailSrc,
        })

    if (isAlreadyLoaded) {
      loadedThumbnailSrcSet.add(thumbnailSrc)
      setState.setIsThumbnailLoaded(true)
      return
    }

    setState.setIsThumbnailLoaded(false)
  }, [setState, thumbnailSrc])

  const showContextMenu = useShowContextMenu()

  const [renderedHDR, setRenderedHDR] = useState(false)
  const hasRegions = regions.length > 0
  const shouldRenderThumbnailPhase = Boolean(thumbnailSrc && (!highResLoaded || !blobSrc || !isActiveImage || error))

  const imagePinchConfig = useMemo(
    () => ({
      step: 0.5,
      disabled: !enableZoom,
    }),
    [enableZoom],
  )

  const imageDoubleClickConfig = useMemo(
    () => ({
      step: 2,
      disabled: !enableZoom,
      mode: 'toggle' as const,
      animationTime: 200,
    }),
    [enableZoom],
  )

  const imagePanningConfig = useMemo(
    () => ({
      disabled: !enablePan,
    }),
    [enablePan],
  )

  const isVisualReady = getProgressiveImageVisualReady({
    isHighResImageRendered,
    isThumbnailLoaded,
    thumbnailSrc,
  })

  useLayoutEffect(() => {
    onVisualReadyChange?.(isVisualReady)
  }, [isVisualReady, onVisualReadyChange])

  const handleViewportChange = useCallback((viewport: ImageViewportState) => {
    const overlayFrame = viewportFrameRef.current
    if (!overlayFrame) {
      return
    }

    const renderedWidth = viewport.imageWidth * viewport.scale
    const renderedHeight = viewport.imageHeight * viewport.scale
    const left = viewport.containerWidth / 2 + viewport.translateX - renderedWidth / 2
    const top = viewport.containerHeight / 2 + viewport.translateY - renderedHeight / 2

    overlayFrame.style.width = `${renderedWidth}px`
    overlayFrame.style.height = `${renderedHeight}px`
    overlayFrame.style.transform = `translate3d(${left}px, ${top}px, 0)`

    if (!hasOverlayViewportRef.current) {
      hasOverlayViewportRef.current = true
      setHasOverlayViewport(true)
    }
  }, [])

  const getViewerCanvas = useCallback(() => {
    const canvas = imageViewerHostRef.current?.querySelector('canvas')
    return canvas instanceof HTMLCanvasElement ? canvas : null
  }, [])

  const shouldForwardViewerEvent = useCallback((target: EventTarget | null, canvas: HTMLCanvasElement) => {
    return target instanceof Node && !canvas.contains(target)
  }, [])

  const dispatchMouseEventToCanvas = useCallback(
    (type: 'mousedown' | 'mousemove' | 'mouseup' | 'dblclick', event: React.MouseEvent<HTMLDivElement>) => {
      const canvas = getViewerCanvas()
      if (!canvas || !shouldForwardViewerEvent(event.target, canvas)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      canvas.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          button: event.button,
          buttons: event.buttons,
          clientX: event.clientX,
          clientY: event.clientY,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
        }),
      )
    },
    [getViewerCanvas, shouldForwardViewerEvent],
  )

  const dispatchTouchEventToCanvas = useCallback(
    (type: 'touchstart' | 'touchmove' | 'touchend', event: React.TouchEvent<HTMLDivElement>) => {
      const canvas = getViewerCanvas()
      if (!canvas || !shouldForwardViewerEvent(event.target, canvas) || typeof TouchEvent === 'undefined') {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      canvas.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: Array.from(event.nativeEvent.touches),
          targetTouches: Array.from(event.nativeEvent.targetTouches),
          changedTouches: Array.from(event.nativeEvent.changedTouches),
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
        }),
      )
    },
    [getViewerCanvas, shouldForwardViewerEvent],
  )

  const handleOverlayWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      const canvas = imageViewerHostRef.current?.querySelector('canvas')
      if (!(canvas instanceof HTMLCanvasElement) || !shouldForwardViewerEvent(event.target, canvas)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      canvas.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          clientX: event.clientX,
          clientY: event.clientY,
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaZ: event.deltaZ,
          deltaMode: event.deltaMode,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
        }),
      )
    },
    [shouldForwardViewerEvent],
  )

  useLayoutEffect(() => {
    setRenderedHDR(false)
    hasOverlayViewportRef.current = false
    setHasOverlayViewport(false)

    const overlayFrame = viewportFrameRef.current
    if (!overlayFrame) {
      return
    }

    overlayFrame.style.width = '0px'
    overlayFrame.style.height = '0px'
    overlayFrame.style.transform = 'translate3d(0px, 0px, 0)'
  }, [blobSrc, highResLoaded, isActiveImage, src])

  return (
    <div
      className={clsxm('relative overflow-hidden', className)}
      onMouseDown={handleLongPressStart}
      onMouseUp={handleLongPressEnd}
      onMouseLeave={handleLongPressEnd}
      onTouchStart={handleLongPressStart}
      onTouchEnd={handleLongPressEnd}
    >
      {/* 缩略图 - 在高分辨率图片未加载或加载失败时显示 */}
      {thumbnailSrc && (!isHighResImageRendered || error) && (
        <ContainedImageFrame
          width={width}
          height={height}
          className="absolute inset-0 flex h-full w-full items-center justify-center overflow-visible"
        >
          <img
            ref={thumbnailRef}
            src={thumbnailSrc}
            key={thumbnailSrc}
            alt={alt}
            className={clsxm(
              'block size-full object-contain transition-opacity duration-300',
              disableThumbnailTransition && 'transition-none',
              isThumbnailLoaded ? 'opacity-100' : 'opacity-0',
            )}
            onLoad={handleThumbnailLoad}
          />
          {hasRegions && shouldRenderThumbnailPhase && (
            <PhotoRegionsOverlay
              regions={regions}
              photoWidth={width}
              photoHeight={height}
              orientation={regionOrientation}
              accentColor={regionAccentColor}
              labelPlacement={regionLabelPlacement}
              activeRegionId={activeRegionId}
              showAllBoxes={showAllRegions}
              interactive={enableRegionHover}
              onActiveRegionChange={onActiveRegionChange}
            />
          )}
        </ContainedImageFrame>
      )}

      {/* 高分辨率图片 - 只在成功加载且非错误状态时显示 */}
      {highResLoaded && blobSrc && isActiveImage && !error && (
        <div
          className="absolute inset-0 h-full w-full"
          onContextMenu={(e) => {
            const items = createContextMenuItems(blobSrc, alt, t)
            showContextMenu(items, e)
          }}
        >
          <div
            ref={imageViewerHostRef}
            className="absolute inset-0 h-full w-full"
            onWheelCapture={handleOverlayWheel}
            onMouseDownCapture={event => dispatchMouseEventToCanvas('mousedown', event)}
            onMouseMoveCapture={event => dispatchMouseEventToCanvas('mousemove', event)}
            onMouseUpCapture={event => dispatchMouseEventToCanvas('mouseup', event)}
            onDoubleClickCapture={event => dispatchMouseEventToCanvas('dblclick', event)}
            onTouchStartCapture={event => dispatchTouchEventToCanvas('touchstart', event)}
            onTouchMoveCapture={event => dispatchTouchEventToCanvas('touchmove', event)}
            onTouchEndCapture={event => dispatchTouchEventToCanvas('touchend', event)}
          >
            <ImageViewer
              src={blobSrc}
              alt={alt}
              onLoad={() => setState.setIsHighResImageRendered(true)}
              onHDRChange={setRenderedHDR}
              onError={() => {
                setState.setError(true)
                onError?.()
              }}
              className="absolute inset-0 h-full w-full"
              width={width}
              height={height}
              initialScale={1}
              minScale={minZoom}
              maxScale={maxZoom}
              pinch={imagePinchConfig}
              doubleClick={imageDoubleClickConfig}
              panning={imagePanningConfig}
              limitToBounds={true}
              centerOnInit={true}
              smooth={true}
              onZoomChange={onTransformed}
              onViewportChange={handleViewportChange}
              onLoadingStateChange={handleImageLoadingStateChange}
              debug={import.meta.env.DEV && !isMobileDevice}
            />
            {(hasRegions || hasVideo) && (
              <div className="pointer-events-none absolute inset-0 z-20">
                <div
                  ref={viewportFrameRef}
                  className={clsxm(
                    'absolute left-0 top-0 overflow-visible transition-opacity duration-200',
                    hasOverlayViewport ? 'opacity-100' : 'opacity-0',
                  )}
                >
                  {hasVideo && videoSource && imageLoaderManagerRef.current && hasOverlayViewport && (
                    <LivePhotoVideo
                      ref={livePhotoRef}
                      videoSource={videoSource}
                      imageLoaderManager={imageLoaderManagerRef.current}
                      loadingIndicatorRef={loadingIndicatorRef}
                      isCurrentImage={isCurrentImage}
                      onPlayingChange={setState.setIsLivePhotoPlaying}
                      shouldAutoPlayOnce={shouldAutoPlayVideoOnce}
                    />
                  )}
                  {hasRegions && (
                    <PhotoRegionsOverlay
                      regions={regions}
                      photoWidth={width}
                      photoHeight={height}
                      orientation={regionOrientation}
                      accentColor={regionAccentColor}
                      labelPlacement={regionLabelPlacement}
                      activeRegionId={activeRegionId}
                      showAllBoxes={showAllRegions}
                      interactive={enableRegionHover}
                      onActiveRegionChange={onActiveRegionChange}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {hasVideo && highResLoaded && blobSrc && isActiveImage && !error && (
        <LivePhotoBadge
          livePhotoRef={livePhotoRef}
          isLivePhotoPlaying={isLivePhotoPlaying}
          imageLoaderManagerRef={imageLoaderManagerRef}
        />
      )}

      {renderedHDR && highResLoaded && blobSrc && isActiveImage && !error && <HDRBadge />}

      {/* 操作提示 */}
      {!hasVideo && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded bg-black/50 px-2 py-1 text-xs text-white opacity-0 duration-200 group-hover:opacity-50">
          {t('photo.zoom.hint')}
        </div>
      )}

      {/* 缩放倍率提示 */}
      <AnimatePresence>
        {showScaleIndicator && (
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="pointer-events-none absolute bottom-4 left-4 z-20 flex items-center gap-0.5 rounded bg-black/50 px-3 py-1 text-lg text-white tabular-nums"
          >
            <SlidingNumber number={currentScale} decimalPlaces={1} />
            <span>x</span>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export type { ProgressiveImageProps } from './types'
