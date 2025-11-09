'use client'

import type { PhotoManifestItem } from '@afilmory/builder'
import {
  CarbonIsoOutline,
  MaterialSymbolsShutterSpeed,
  StreamlineImageAccessoriesLensesPhotosCameraShutterPicturePhotographyPicturesPhotoLens,
  TablerAperture,
} from '@afilmory/ui'
import { clsxm as cn } from '@afilmory/utils'
import { thumbHashToDataURL } from 'thumbhash'

import { url } from '../../../../../../../config.json'

const decompressUint8Array = (compressed: string) => {
  return Uint8Array.from(compressed.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)))
}

interface PhotoItemProps {
  photo: PhotoManifestItem
  className?: string
}

export function PhotoItem({ photo, className }: PhotoItemProps) {
  // 生成 thumbhash 预览
  const thumbHashDataURL = photo.thumbHash ? thumbHashToDataURL(decompressUint8Array(photo.thumbHash)) : null

  const ratio = photo.aspectRatio

  // 格式化 EXIF 数据
  const formatExifData = () => {
    const { exif } = photo

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

  return (
    <button
      type="button"
      role="link"
      onClick={() => {
        window.open(`${url}/photos/${photo.id}`, '_blank')
      }}
      className={cn('group relative block w-full cursor-pointer overflow-hidden text-left', className)}
      style={{
        paddingTop: `${100 / ratio}%`,
      }}
    >
      <div className={cn('pointer-events-none absolute inset-0 z-1 flex items-start justify-center')}>
        <div className="bg-material-medium mt-4 flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 opacity-0 backdrop-blur-[70px] transition-opacity duration-300 group-hover:opacity-100">
          <i className="i-mingcute-external-link-line size-4 text-white" />
          <span className="text-sm text-white/80">Open in AFilmory</span>
        </div>
      </div>

      <div className="absolute inset-0">
        <img src={thumbHashDataURL} alt={photo.title} className="absolute inset-0 size-full" loading="lazy" />
        <img
          src={photo.thumbnailUrl}
          alt={photo.title}
          className="absolute inset-0 size-full object-cover object-center"
          loading="lazy"
        />
      </div>

      {/* 图片信息和 EXIF 覆盖层 */}

      <div className="@container pointer-events-none">
        {/* 渐变背景 - 独立的层 */}
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {/* 内容层 - 独立的层以支持 backdrop-filter */}
        <div className="absolute inset-x-0 bottom-0 p-4 pb-0 text-white">
          {/* 基本信息和标签 section */}
          <div className="mb-3 **:duration-300">
            <div className="items-center justify-between @[600px]:flex">
              <div>
                <h3 className="mb-2 truncate text-sm font-medium opacity-0 group-hover:opacity-100">{photo.title}</h3>
                {photo.description && (
                  <p className="mb-2 line-clamp-2 text-sm text-white/80 opacity-0 group-hover:opacity-100">
                    {photo.description}
                  </p>
                )}
              </div>

              {/* 基本信息 */}
              <div>
                <div className="mb-2 flex flex-wrap gap-2 text-xs text-white/80 opacity-0 group-hover:opacity-100">
                  <span>
                    {photo.width} × {photo.height}
                  </span>
                  <span>•</span>
                  <span>{(photo.size / 1024 / 1024).toFixed(1)}MB</span>
                </div>
              </div>
            </div>

            {/* Tags */}
            {photo.tags && photo.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {photo.tags.map((tag) => (
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

          <div className="grid grid-cols-2 gap-2 pb-4 text-xs @[600px]:grid-cols-4">
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
        </div>
      </div>
    </button>
  )
}
