import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { LazyImage } from '~/components/ui/lazy-image'
import { Spring } from '~/lib/spring'
import type { PhotoMarker } from '~/types/map'

interface ClusterPhotoGridProps {
  photos: PhotoMarker[]
  onPhotoClick?: (photo: PhotoMarker) => void
}

export const ClusterPhotoGrid = ({
  photos,
  onPhotoClick,
}: ClusterPhotoGridProps) => {
  // 最多显示 6 张照片
  const displayPhotos = photos.slice(0, 6)
  const remainingCount = Math.max(0, photos.length - 6)
  const { i18n } = useTranslation()

  return (
    <div className="space-y-3">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h3 className="text-text text-sm font-semibold">
          {photos.length} 张照片
        </h3>
        <div className="text-text-secondary text-xs">点击查看详情</div>
      </div>

      {/* 照片网格 */}
      <div className="grid grid-cols-3 gap-2">
        {displayPhotos.map((photoMarker, index) => (
          <m.div
            key={photoMarker.photo.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              ...Spring.presets.smooth,
              delay: index * 0.05,
            }}
            className="group relative aspect-square overflow-hidden rounded-lg"
          >
            <Link
              to={`/${photoMarker.photo.id}`}
              target="_blank"
              onClick={(e) => {
                e.stopPropagation()
                onPhotoClick?.(photoMarker)
              }}
              className="block h-full w-full"
            >
              <LazyImage
                src={
                  photoMarker.photo.thumbnailUrl ||
                  photoMarker.photo.originalUrl
                }
                alt={photoMarker.photo.title || photoMarker.photo.id}
                thumbHash={photoMarker.photo.thumbHash}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                rootMargin="200px"
                threshold={0.1}
              />

              {/* 悬停遮罩 */}
              <div className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/20" />

              {/* 悬停图标 */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <div className="rounded-full bg-black/50 p-2 backdrop-blur-sm">
                  <svg
                    className="h-4 w-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </div>
              </div>
            </Link>
          </m.div>
        ))}

        {/* 更多照片指示器 */}
        {remainingCount > 0 && (
          <m.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              ...Spring.presets.smooth,
              delay: displayPhotos.length * 0.05,
            }}
            className="bg-fill-secondary flex aspect-square items-center justify-center rounded-lg"
          >
            <div className="text-center">
              <div className="text-text text-lg font-bold">
                +{remainingCount}
              </div>
              <div className="text-text-secondary text-xs">更多</div>
            </div>
          </m.div>
        )}
      </div>

      {/* 位置信息 */}
      {photos[0] && (
        <div className="border-border space-y-2 border-t pt-3">
          <div className="text-text-secondary flex items-center gap-2 text-xs">
            <i className="i-mingcute-location-line text-sm" />
            <span className="font-mono">
              {Math.abs(photos[0].latitude).toFixed(4)}°
              {photos[0].latitudeRef || 'N'},{' '}
              {Math.abs(photos[0].longitude).toFixed(4)}°
              {photos[0].longitudeRef || 'E'}
            </span>
          </div>

          {/* 拍摄时间范围 */}
          {(() => {
            const dates = photos
              .map((p) => p.photo.exif?.DateTimeOriginal)
              .filter(Boolean)
              .map((d) => new Date(d!))
              .sort((a, b) => a.getTime() - b.getTime())

            if (dates.length === 0) return null

            const earliest = dates[0]
            const latest = dates.at(-1)
            const isSameDay = earliest.toDateString() === latest?.toDateString()

            return (
              <div className="text-text-secondary flex items-center gap-2 text-xs">
                <i className="i-mingcute-calendar-line text-sm" />
                <span>
                  {isSameDay
                    ? earliest.toLocaleDateString(i18n.language, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })
                    : `${earliest.toLocaleDateString(i18n.language, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })} - ${latest?.toLocaleDateString(i18n.language, {
                        month: 'short',
                        day: 'numeric',
                      })}`}
                </span>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
