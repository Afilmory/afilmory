import { Thumbhash } from '@afilmory/ui'
import clsx from 'clsx'
import { m } from 'motion/react'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useContextPhotos, usePhotoViewer } from '~/hooks/usePhotoViewer'
import {
  CarbonIsoOutline,
  MaterialSymbolsShutterSpeed,
  StreamlineImageAccessoriesLensesPhotosCameraShutterPicturePhotographyPicturesPhotoLens,
  TablerAperture,
} from '~/icons'
import { isMobileDevice } from '~/lib/device-viewport'
import { ImageLoaderManager } from '~/lib/image-loader-manager'
import { getImageFormat } from '~/lib/image-utils'
import type { PhotoManifest } from '~/types/photo'

export const MasonryPhotoItem = ({ data, width, index: _ }: { data: PhotoManifest; width: number; index: number }) => {
  const photos = useContextPhotos()
  const photoViewer = usePhotoViewer()
  const { t } = useTranslation()
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)

  // Live Photo 相关状态
  const [isPlayingLivePhoto, setIsPlayingLivePhoto] = useState(false)
  const [livePhotoVideoLoaded, setLivePhotoVideoLoaded] = useState(false)
  const [isConvertingVideo, setIsConvertingVideo] = useState(false)
  const [videoConvertionError, setVideoConversionError] = useState<unknown>(null)

  const imageRef = useRef<HTMLImageElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null)
  const imageLoaderManagerRef = useRef<ImageLoaderManager | null>(null)

  const handleImageLoad = () => {
    setImageLoaded(true)
  }

  const handleImageError = () => {
    setImageError(true)
  }

  const handleClick = () => {
    const photoIndex = photos.findIndex((photo) => photo.id === data.id)
    if (photoIndex !== -1) {
      const triggerEl =
        imageRef.current?.parentElement instanceof HTMLElement ? imageRef.current.parentElement : imageRef.current

      photoViewer.openViewer(photoIndex, triggerEl ?? undefined)
    }
  }

  // 计算基于宽度的高度
  const calculatedHeight = width / data.aspectRatio

  // 格式化 EXIF 数据
  const formatExifData = () => {
    const { exif } = data

    // 安全处理：如果 exif 不存在或为空，则返回空对象
    if (!exif) {
      return {
        focalLength35mm: null,
        iso: null,
        shutterSpeed: null,
        aperture: null,
      }
    }

    // 等效焦距 (35mm)
    const focalLength35mm = exif.FocalLengthIn35mmFormat
      ? Number.parseInt(exif.FocalLengthIn35mmFormat)
      : exif.FocalLength
        ? Number.parseInt(exif.FocalLength)
        : null

    // ISO
    const iso = exif.ISO

    // 快门速度
    const exposureTime = exif.ExposureTime
    const shutterSpeed = exposureTime ? `${exposureTime}s` : null

    // 光圈
    const aperture = exif.FNumber ? `f/${exif.FNumber}` : null

    return {
      focalLength35mm,
      iso,
      shutterSpeed,
      aperture,
    }
  }

  const exifData = formatExifData()

  // 使用通用的图片格式提取函数
  const imageFormat = getImageFormat(data.originalUrl || data.s3Key || '')

  // Live Photo 视频加载逻辑
  useEffect(() => {
    if (
      !data.isLivePhoto ||
      !data.livePhotoVideoUrl ||
      !imageLoaded ||
      livePhotoVideoLoaded ||
      isConvertingVideo ||
      !videoRef.current
    ) {
      return
    }

    const loadLivePhotoVideo = async () => {
      setIsConvertingVideo(true)

      // 创建新的 image loader manager
      const imageLoaderManager = new ImageLoaderManager()
      imageLoaderManagerRef.current = imageLoaderManager

      try {
        await imageLoaderManager.processLivePhotoVideo(data.livePhotoVideoUrl!, videoRef.current!)

        setLivePhotoVideoLoaded(true)
      } catch (videoError) {
        console.error('Failed to process Live Photo video:', videoError)
        setVideoConversionError(videoError)
      } finally {
        setIsConvertingVideo(false)
      }
    }

    loadLivePhotoVideo()

    return () => {
      if (imageLoaderManagerRef.current) {
        imageLoaderManagerRef.current.cleanup()
        imageLoaderManagerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.isLivePhoto, data.livePhotoVideoUrl, imageLoaded, livePhotoVideoLoaded])

  // Live Photo hover 处理（仅在桌面端）
  const handleMouseEnter = useCallback(() => {
    if (isMobileDevice || !data.isLivePhoto || !livePhotoVideoLoaded || isPlayingLivePhoto || isConvertingVideo) {
      return
    }

    hoverTimerRef.current = setTimeout(() => {
      setIsPlayingLivePhoto(true)
      const video = videoRef.current
      if (video) {
        video.currentTime = 0
        video.play()
      }
    }, 200) // 200ms hover 延迟
  }, [data.isLivePhoto, livePhotoVideoLoaded, isPlayingLivePhoto, isConvertingVideo])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }

    if (isPlayingLivePhoto) {
      setIsPlayingLivePhoto(false)
      const video = videoRef.current
      if (video) {
        video.pause()
        video.currentTime = 0
      }
    }
  }, [isPlayingLivePhoto])

  // 视频播放结束处理
  const handleVideoEnded = useCallback(() => {
    setIsPlayingLivePhoto(false)
  }, [])

  // 清理定时器
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = null
      }
    }
  }, [])

  return (
    <m.div
      className="bg-fill-quaternary group relative w-full cursor-pointer overflow-hidden"
      style={{
        width,
        height: calculatedHeight,
      }}
      data-photo-id={data.id}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Blurhash 占位符 */}
      {data.thumbHash && <Thumbhash thumbHash={data.thumbHash} className="absolute inset-0" />}

      {!imageError && (
        <img
          ref={imageRef}
          src={data.thumbnailUrl}
          alt={data.title}
          className={clsx('absolute inset-0 h-full w-full object-cover duration-300 group-hover:scale-105')}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      )}

      {/* Live Photo 视频 */}
      {data.isLivePhoto && data.livePhotoVideoUrl && (
        <video
          ref={videoRef}
          className={clsx(
            'absolute inset-0 h-full w-full object-cover duration-300 group-hover:scale-105',
            isPlayingLivePhoto ? 'z-10' : 'pointer-events-none opacity-0',
          )}
          muted
          playsInline
          onEnded={handleVideoEnded}
        />
      )}

      {/* 错误状态 */}
      {imageError && (
        <div className="bg-fill-quaternary text-text-tertiary absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <i className="i-mingcute-image-line text-2xl" />
            <p className="mt-2 text-sm">{t('photo.error.loading')}</p>
          </div>
        </div>
      )}

      {/* Live Photo 标识 */}
      {data.isLivePhoto && (
        <div
          className={clsx(
            'absolute z-20 flex items-center space-x-1 rounded-xl bg-black/50 px-1 py-1 text-xs text-white transition-all duration-200 hover:bg-black/70',
            'top-2 left-2',
            'flex-wrap gap-y-1',
          )}
          title={isMobileDevice ? t('photo.live.tooltip.mobile.main') : t('photo.live.tooltip.desktop.main')}
        >
          {isConvertingVideo ? (
            <div className="flex items-center gap-1 px-1">
              <i className="i-mingcute-loading-line animate-spin" />
              <span>{t('loading.converting')}</span>
            </div>
          ) : (
            <Fragment>
              <i className="i-mingcute-live-photo-line size-4 shrink-0" />
              <span className="mr-1 shrink-0">{t('photo.live.badge')}</span>
              {videoConvertionError ? (
                <span className={'bg-warning/20 ml-0.5 rounded px-1 text-xs'}>
                  <div
                    className="text-yellow w-3 text-center font-bold"
                    title={(videoConvertionError as Error).message}
                  >
                    !
                  </div>
                </span>
              ) : null}
            </Fragment>
          )}
        </div>
      )}

      {/* 图片信息和 EXIF 覆盖层 */}
      {imageLoaded && (
        <div className="pointer-events-none">
          {/* 渐变背景 - 独立的层 */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

          {/* 内容层 - 独立的层以支持 backdrop-filter */}
          <div className="absolute inset-x-0 bottom-0 p-4 pb-0 text-white">
            {/* 基本信息和标签 section */}
            <div className="mb-3 [&_*]:duration-300">
              <h3 className="mb-2 truncate text-sm font-medium opacity-0 group-hover:opacity-100">{data.title}</h3>
              {data.description && (
                <p className="mb-2 line-clamp-2 text-sm text-white/80 opacity-0 group-hover:opacity-100">
                  {data.description}
                </p>
              )}

              {/* 基本信息 */}
              <div className="mb-2 flex flex-wrap gap-2 text-xs text-white/80 opacity-0 group-hover:opacity-100">
                <span>{imageFormat}</span>
                <span>•</span>
                <span>
                  {data.width} × {data.height}
                </span>
                <span>•</span>
                <span>{(data.size / 1024 / 1024).toFixed(1)}MB</span>
              </div>

              {/* Tags */}
              {data.tags && data.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {data.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-white/20 px-2 py-0.5 text-xs text-white/90 opacity-0 backdrop-blur-sm group-hover:opacity-100"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* EXIF 信息网格 */}
            {calculatedHeight >= 200 && (
              <div className="grid grid-cols-2 gap-2 pb-4 text-xs">
                {exifData.focalLength35mm && (
                  <div className="flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 opacity-0 backdrop-blur-md transition-opacity duration-300 group-hover:opacity-100">
                    <StreamlineImageAccessoriesLensesPhotosCameraShutterPicturePhotographyPicturesPhotoLens className="text-white/70" />
                    <span className="text-white/90">{exifData.focalLength35mm}mm</span>
                  </div>
                )}

                {exifData.aperture && (
                  <div className="flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 opacity-0 backdrop-blur-md transition-opacity duration-300 group-hover:opacity-100">
                    <TablerAperture className="text-white/70" />
                    <span className="text-white/90">{exifData.aperture}</span>
                  </div>
                )}

                {exifData.shutterSpeed && (
                  <div className="flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 opacity-0 backdrop-blur-md transition-opacity duration-300 group-hover:opacity-100">
                    <MaterialSymbolsShutterSpeed className="text-white/70" />
                    <span className="text-white/90">{exifData.shutterSpeed}</span>
                  </div>
                )}

                {exifData.iso && (
                  <div className="flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 opacity-0 backdrop-blur-md transition-opacity duration-300 group-hover:opacity-100">
                    <CarbonIsoOutline className="text-white/70" />
                    <span className="text-white/90">ISO {exifData.iso}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </m.div>
  )
}
