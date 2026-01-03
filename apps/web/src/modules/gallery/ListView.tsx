import { useScrollViewElement } from '@afilmory/ui'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { useMobile } from '~/hooks/useMobile'
import { useContextPhotos, usePhotoViewer } from '~/hooks/usePhotoViewer'
import type { PhotoManifest } from '~/types/photo'

interface ListViewProps {
  photos: PhotoManifest[]
}

export const ListView = ({ photos }: ListViewProps) => {
  const scrollElement = useScrollViewElement()
  const isMobile = useMobile()

  // 间距大小（更紧凑，即 0.5rem = 8px）
  const gap = 8
  // 固定卡片高度：移动端使用动态测量（因为图片高度根据宽高比变化），桌面端 176px (h-44)
  const cardHeight = isMobile ? 300 : 176 // 移动端给一个初始估算值
  const estimateSize = () => cardHeight + gap

  const virtualizer = useVirtualizer({
    count: photos.length,
    getScrollElement: () => scrollElement,
    estimateSize,
    overscan: 5,
    // 移动端需要动态测量，桌面端使用固定高度
    measureElement: isMobile
      ? (element) => {
          if (!element) return estimateSize()
          const { height } = element.getBoundingClientRect()
          return height + gap
        }
      : undefined,
  })

  // 计算总高度：减去最后一个项目的间距（因为最后一个项目不应该有间距）
  const totalSize = virtualizer.getTotalSize() - gap

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-6">
      <div
        style={{
          height: `${totalSize}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const photo = photos[virtualItem.index]
          const isLast = virtualItem.index === photos.length - 1

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
                paddingBottom: isLast ? 0 : `${gap}px`,
              }}
            >
              <PhotoCard photo={photo} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

const PhotoCard = ({ photo }: { photo: PhotoManifest }) => {
  const { i18n } = useTranslation()
  const photos = useContextPhotos()
  const photoViewer = usePhotoViewer()
  const imageRef = useRef<HTMLImageElement>(null)

  const handleClick = () => {
    const photoIndex = photos.findIndex((p) => p.id === photo.id)
    if (photoIndex !== -1) {
      const triggerEl =
        imageRef.current?.parentElement instanceof HTMLElement ? imageRef.current.parentElement : imageRef.current

      photoViewer.openViewer(photoIndex, triggerEl ?? undefined)
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  // 格式化 EXIF 数据
  const formatExifData = () => {
    if (!photo.exif) {
      return {
        camera: null,
        lens: null,
        iso: null,
        aperture: null,
        shutterSpeed: null,
        focalLength: null,
        exposureCompensation: null,
      }
    }

    const { exif } = photo

    // 相机信息
    const camera = exif.Make && exif.Model ? `${exif.Make} ${exif.Model}` : exif.Model || exif.Make || null

    // 镜头信息
    const lens = exif.LensMake && exif.LensModel ? `${exif.LensMake} ${exif.LensModel}` : exif.LensModel || null

    // ISO
    const iso = exif.ISO || null

    // 光圈
    const aperture = exif.FNumber ? `f/${exif.FNumber}` : null

    // 快门速度
    const exposureTime = exif.ExposureTime
    let shutterSpeed: string | null = null
    if (exposureTime) {
      if (typeof exposureTime === 'number') {
        if (exposureTime >= 1) {
          shutterSpeed = `${exposureTime}s`
        } else {
          shutterSpeed = `1/${Math.round(1 / exposureTime)}s`
        }
      } else {
        shutterSpeed = `${exposureTime}s`
      }
    } else if (exif.ShutterSpeedValue) {
      const speed =
        typeof exif.ShutterSpeedValue === 'number'
          ? exif.ShutterSpeedValue
          : Number.parseFloat(String(exif.ShutterSpeedValue))
      if (speed >= 1) {
        shutterSpeed = `${speed}s`
      } else {
        shutterSpeed = `1/${Math.round(1 / speed)}s`
      }
    }

    // 焦距 (优先使用 35mm 等效焦距)
    const focalLength = exif.FocalLengthIn35mmFormat
      ? `${Number.parseInt(exif.FocalLengthIn35mmFormat)}mm`
      : exif.FocalLength
        ? `${Number.parseInt(exif.FocalLength)}mm`
        : null

    // 曝光补偿
    const exposureCompensation = exif.ExposureCompensation ? `${exif.ExposureCompensation} EV` : null

    return {
      camera,
      lens,
      iso,
      aperture,
      shutterSpeed,
      focalLength,
      exposureCompensation,
    }
  }

  const exifData = formatExifData()

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
      className="group flex flex-col gap-2 overflow-hidden border border-white/5 bg-white/5 p-2 backdrop-blur-sm transition-all duration-200 hover:border-white/10 hover:bg-white/8 lg:h-44 lg:flex-row lg:gap-3"
    >
      {/* 缩略图 - 移动端按宽高比，桌面端固定高度 */}
      <div
        className="relative w-full shrink-0 cursor-pointer overflow-hidden lg:h-full lg:w-56"
        role="button"
        tabIndex={0}
        data-photo-id={photo.id}
        style={
          // 移动端：根据宽高比计算高度
          {
            aspectRatio: photo.aspectRatio ? `${photo.aspectRatio}` : undefined,
          }
        }
      >
        <img
          ref={imageRef}
          src={photo.thumbnailUrl || photo.originalUrl}
          alt={photo.title || 'Photo'}
          className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105 lg:object-cover"
        />
        {/* Tags 覆盖在图片上 */}
        {photo.tags && photo.tags.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap gap-1 p-2">
            {photo.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 元数据 - 移动端自适应，桌面端固定高度 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden py-1 lg:h-full">
        {/* 标题和基本信息 */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <h3 className="mb-1.5 text-sm font-semibold text-white lg:text-base">{photo.title}</h3>

          {/* 元数据行 */}
          <div className="space-y-1.5 text-[11px] leading-tight text-white/60 lg:text-xs">
            {/* 位置 */}
            {photo.location && (
              <div className="flex items-center gap-1">
                <i className="i-lucide-map-pin text-[10px]" />
                <span className="truncate">{photo.location.locationName}</span>
              </div>
            )}

            {/* 日期 */}
            <div className="flex items-center gap-1">
              <i className="i-lucide-calendar text-[10px]" />
              <span>{formatDate(new Date(photo.lastModified).getTime())}</span>
            </div>

            {/* 相机 */}
            {exifData.camera && (
              <div className="flex items-center gap-1">
                <i className="i-lucide-camera text-[10px]" />
                <span className="truncate">{exifData.camera}</span>
              </div>
            )}

            {/* 镜头 */}
            {exifData.lens && (
              <div className="flex items-center gap-1">
                <i className="i-lucide-aperture text-[10px]" />
                <span className="truncate">{exifData.lens}</span>
              </div>
            )}

            {/* 尺寸 */}
            <div className="flex items-center gap-1">
              <i className="i-lucide-image text-[10px]" />
              <span>
                {photo.width} x {photo.height}
              </span>
            </div>
          </div>

          {/* 摄影三要素 + 焦距 - 简洁样式 */}
          {(exifData.iso || exifData.aperture || exifData.shutterSpeed || exifData.focalLength) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-2">
              {/* ISO */}
              {exifData.iso && (
                <div className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 backdrop-blur-md">
                  <i className="i-lucide-gauge text-[10px] text-white/70" />
                  <span className="text-[11px] text-white/90">ISO {exifData.iso}</span>
                </div>
              )}

              {/* 光圈 */}
              {exifData.aperture && (
                <div className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 backdrop-blur-md">
                  <i className="i-lucide-circle-dot text-[10px] text-white/70" />
                  <span className="text-[11px] text-white/90">{exifData.aperture}</span>
                </div>
              )}

              {/* 快门速度 */}
              {exifData.shutterSpeed && (
                <div className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 backdrop-blur-md">
                  <i className="i-lucide-timer text-[10px] text-white/70" />
                  <span className="text-[11px] text-white/90">{exifData.shutterSpeed}</span>
                </div>
              )}

              {/* 焦距 */}
              {exifData.focalLength && (
                <div className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 backdrop-blur-md">
                  <i className="i-lucide-maximize-2 text-[10px] text-white/70" />
                  <span className="text-[11px] text-white/90">{exifData.focalLength}</span>
                </div>
              )}

              {/* 曝光补偿 - 次要显示 */}
              {exifData.exposureCompensation && (
                <div className="flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5">
                  <i className="i-lucide-sliders-horizontal text-[10px] text-white/60" />
                  <span className="text-[11px] text-white/70">{exifData.exposureCompensation}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
