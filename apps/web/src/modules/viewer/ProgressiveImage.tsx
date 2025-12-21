import { clsxm } from '@afilmory/utils'
import { WebGLImageViewer } from '@afilmory/webgl-viewer'
import { AnimatePresence, m } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch'
import { useMediaQuery } from 'usehooks-ts'

import { useShowContextMenu } from '~/atoms/context-menu'
import { SlidingNumber } from '~/components/ui/number/SlidingNumber'
import { canUseWebGL } from '~/lib/feature'
import { HDRBadge } from '~/modules/media/HDRBadge'
import { LivePhotoBadge } from '~/modules/media/LivePhotoBadge'
import { LivePhotoVideo } from '~/modules/media/LivePhotoVideo'
import { ThreeDSceneViewer } from '~/modules/media/ThreeDSceneViewer'

import { DOMImageViewer } from './DOMImageViewer'
import {
  createContextMenuItems,
  useImageLoader,
  useLivePhotoControls,
  useProgressiveImageState,
  useScaleIndicator,
  useWebGLLoadingState,
} from './hooks'
import type { ProgressiveImageProps, WebGLImageViewerRef } from './types'

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
  maxZoom = 20,
  minZoom = 1,
  isCurrentImage = false,
  shouldRenderHighRes = true,
  videoSource,
  shouldAutoPlayVideoOnce = false,
  isHDR = false,
  loadingIndicatorRef,
  threeDScene,
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

  const [isThreeDMode, setIsThreeDMode] = useState(false)
  const [isThreeDLoading, setIsThreeDLoading] = useState(false)
  const [threeDError, setThreeDError] = useState<string | null>(null)

  const isActiveImage = Boolean(isCurrentImage && shouldRenderHighRes)
  const hasThreeDScene = Boolean(threeDScene && threeDScene.mode === 'sog')

  // 判断是否有视频内容（Live Photo 或 Motion Photo）
  const hasVideo = Boolean(videoSource && videoSource.type !== 'none')

  // Refs
  const thumbnailRef = useRef<HTMLImageElement>(null)
  const webglImageViewerRef = useRef<WebGLImageViewerRef | null>(null)
  const domImageViewerRef = useRef<ReactZoomPanPinchRef>(null)
  const livePhotoRef = useRef<any>(null)

  useEffect(() => {
    if (!isActiveImage) {
      setIsThreeDMode(false)
      setIsThreeDLoading(false)
      setThreeDError(null)
    }
  }, [isActiveImage])

  useEffect(() => {
    if (!hasThreeDScene) {
      setIsThreeDMode(false)
      setThreeDError(null)
    }
  }, [hasThreeDScene])

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

  const { onTransformed, onDOMTransformed } = useScaleIndicator(
    onZoomChange,
    setState.setCurrentScale,
    setState.setShowScaleIndicator,
  )

  const { handleLongPressStart, handleLongPressEnd } = useLivePhotoControls(hasVideo, isLivePhotoPlaying, livePhotoRef)

  const handleWebGLLoadingStateChange = useWebGLLoadingState(loadingIndicatorRef)

  const handleThumbnailLoad = useCallback(() => {
    setState.setIsThumbnailLoaded(true)
  }, [setState])

  const showContextMenu = useShowContextMenu()

  const isHDRSupported = useMediaQuery('(dynamic-range: high)')
  // Only use HDR if the browser supports it and the image is HDR
  const shouldUseHDR = isHDR && isHDRSupported
  const handleToggleThreeD = useCallback(() => {
    if (!hasThreeDScene || !isActiveImage || !canUseWebGL) return
    setThreeDError(null)
    setIsThreeDMode((prev) => {
      const next = !prev
      if (!next) {
        webglImageViewerRef.current?.resetView()
        domImageViewerRef.current?.resetTransform?.()
        setIsThreeDLoading(false)
        onZoomChange?.(false)
      } else {
        onZoomChange?.(true)
      }
      return next
    })
  }, [hasThreeDScene, isActiveImage, onZoomChange])

  const shouldRenderThreeDScene = hasThreeDScene && isThreeDMode && isActiveImage && canUseWebGL
  const shouldRenderHighResImage = highResLoaded && blobSrc && isActiveImage && !error && !isThreeDMode
  const handleThreeDLoadingChange = useCallback((loading: boolean) => {
    setIsThreeDLoading(loading)
  }, [])
  const handleThreeDError = useCallback((err: Error) => {
    setThreeDError(err?.message ?? 'unknown')
  }, [])
  const handleThreeDReady = useCallback(() => {
    setThreeDError(null)
  }, [])

  return (
    <div
      className={clsxm('relative overflow-hidden', className)}
      onMouseDown={handleLongPressStart}
      onMouseUp={handleLongPressEnd}
      onMouseLeave={handleLongPressEnd}
      onTouchStart={handleLongPressStart}
      onTouchEnd={handleLongPressEnd}
    >
      {hasThreeDScene && (
        <button
          type="button"
          className={clsxm(
            'pointer-events-auto absolute z-20 flex items-center space-x-1 rounded-xl bg-black/50 px-1 py-1 text-xs text-white transition-all duration-200',
            import.meta.env.DEV ? 'top-16 right-4' : 'top-12 lg:top-4 left-4',
            isThreeDMode ? 'bg-accent/70 hover:bg-accent/80' : 'cursor-pointer hover:bg-black/70',
            isThreeDLoading && 'cursor-progress',
            !canUseWebGL && 'cursor-not-allowed opacity-60',
          )}
          onClick={handleToggleThreeD}
          title={t(isThreeDMode ? 'photo.3d.tooltip.disable' : 'photo.3d.tooltip.enable')}
          disabled={!canUseWebGL}
        >
          <i
            className={clsxm(
              'size-4',
              isThreeDLoading ? 'i-mingcute-loading-3-line animate-spin' : 'i-lucide-rotate-3d',
            )}
          />
          <span className="mr-1">{t('photo.3d.badge')}</span>
        </button>
      )}

      {/* 缩略图 - 在高分辨率图片未加载或加载失败时显示 */}
      {thumbnailSrc && (!isHighResImageRendered || error) && (
        <img
          ref={thumbnailRef}
          src={thumbnailSrc}
          key={thumbnailSrc}
          alt={alt}
          className={clsxm(
            'absolute inset-0 h-full w-full object-contain transition-opacity duration-300',
            isThumbnailLoaded ? 'opacity-100' : 'opacity-0',
          )}
          onLoad={handleThumbnailLoad}
        />
      )}

      {/* 高分辨率图片 - 只在成功加载且非错误状态时显示 */}
      {shouldRenderHighResImage && (
        <div
          className="absolute inset-0 h-full w-full"
          onContextMenu={(e) => {
            const items = createContextMenuItems(blobSrc, alt, t)
            showContextMenu(items, e)
          }}
        >
          {/* LivePhoto/Motion Photo 或 HDR 模式使用 DOMImageViewer */}
          {hasVideo || shouldUseHDR ? (
            <DOMImageViewer
              ref={domImageViewerRef}
              onZoomChange={onDOMTransformed}
              minZoom={minZoom}
              maxZoom={maxZoom}
              src={blobSrc}
              alt={alt}
              highResLoaded={highResLoaded}
              onLoad={() => setState.setIsHighResImageRendered(true)}
            >
              {/* LivePhoto/Motion Photo 视频组件作为 children，跟随图片的变换 */}
              {hasVideo && videoSource && imageLoaderManagerRef.current && (
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
            </DOMImageViewer>
          ) : (
            /* 非 LivePhoto 模式使用 WebGLImageViewer */
            <WebGLImageViewer
              ref={webglImageViewerRef}
              src={blobSrc}
              className="absolute inset-0 h-full w-full"
              width={width}
              height={height}
              initialScale={1}
              minScale={minZoom}
              maxScale={maxZoom}
              limitToBounds={true}
              centerOnInit={true}
              smooth={true}
              onZoomChange={onTransformed}
              onLoadingStateChange={handleWebGLLoadingStateChange}
              debug={import.meta.env.DEV}
            />
          )}
        </div>
      )}

      {shouldRenderThreeDScene && threeDScene && (
        <ThreeDSceneViewer
          className="absolute inset-0 h-full w-full"
          scene={threeDScene}
          imageWidth={width}
          imageHeight={height}
          loadingIndicatorRef={loadingIndicatorRef}
          onLoadingChange={handleThreeDLoadingChange}
          onError={handleThreeDError}
          onReady={handleThreeDReady}
        />
      )}

      {hasVideo && shouldRenderHighResImage && (
        <LivePhotoBadge
          livePhotoRef={livePhotoRef}
          isLivePhotoPlaying={isLivePhotoPlaying}
          imageLoaderManagerRef={imageLoaderManagerRef}
        />
      )}

      {shouldUseHDR && shouldRenderHighResImage && <HDRBadge />}

      {/* 备用图片（当 WebGL 不可用时） - 只在非错误状态时显示 */}
      {!canUseWebGL && highResLoaded && blobSrc && isActiveImage && !error && !isThreeDMode && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/20">
          <i className="i-mingcute-warning-line mb-2 text-4xl" />
          <span className="text-center text-sm text-white">{t('photo.webgl.unavailable')}</span>
        </div>
      )}

      {/* 操作提示 */}
      {!hasVideo && !isThreeDMode && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded bg-black/50 px-2 py-1 text-xs text-white opacity-0 duration-200 group-hover:opacity-50">
          {t('photo.zoom.hint')}
        </div>
      )}
      {shouldRenderThreeDScene && !threeDError && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded bg-black/50 px-2 py-1 text-xs text-white opacity-0 duration-200 group-hover:opacity-50">
          {t('photo.3d.hint')}
        </div>
      )}

      {/* 缩放倍率提示 */}
      <AnimatePresence>
        {showScaleIndicator && !isThreeDMode && (
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="pointer-events-none absolute bottom-4 left-4 z-20 flex items-center gap-0.5 rounded bg-black/50 px-3 py-1 text-lg text-white tabular-nums"
          >
            <SlidingNumber number={currentScale} decimalPlaces={1} />x
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export type { ProgressiveImageProps } from './types'
