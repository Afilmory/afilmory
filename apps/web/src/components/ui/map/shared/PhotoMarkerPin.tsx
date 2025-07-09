import { m } from 'motion/react'
import { Marker } from 'react-map-gl/maplibre'
import { Link } from 'react-router'

import { GlassButton } from '~/components/ui/button/GlassButton'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '~/components/ui/hover-card'
import { LazyImage } from '~/components/ui/lazy-image'

import type { PhotoMarkerPinProps } from './types'

export const PhotoMarkerPin = ({
  marker,
  isSelected = false,
  onClick,
  onClose,
}: PhotoMarkerPinProps) => {
  const handleClick = () => {
    onClick?.(marker)
  }

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClose?.()
  }

  return (
    <Marker
      key={marker.id}
      longitude={marker.longitude}
      latitude={marker.latitude}
    >
      <HoverCard
        open={isSelected ? true : undefined} // 当选中时强制打开
        openDelay={isSelected ? 0 : 400} // 选中时立即打开
        closeDelay={isSelected ? 0 : 100} // 选中时不自动关闭
      >
        <HoverCardTrigger asChild>
          <m.div
            className="group relative cursor-pointer"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 30,
            }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleClick}
          >
            {/* Selection ring - 只有选中时显示 */}
            {isSelected && (
              <div className="bg-blue/30 absolute inset-0 -m-2 animate-pulse rounded-full" />
            )}

            {/* Photo background preview */}
            <div className="absolute inset-0 overflow-hidden rounded-full">
              <LazyImage
                src={marker.photo.thumbnailUrl || marker.photo.originalUrl}
                alt={marker.photo.title || marker.photo.id}
                thumbHash={marker.photo.thumbHash}
                className="h-full w-full object-cover opacity-40"
                rootMargin="100px"
                threshold={0.1}
              />
              {/* Overlay */}
              <div className="from-green/60 to-emerald/80 dark:from-green/70 dark:to-emerald/90 absolute inset-0 bg-gradient-to-br" />
            </div>

            {/* Main marker container */}
            <div
              className={`relative flex h-10 w-10 items-center justify-center rounded-full border shadow-lg backdrop-blur-md transition-all duration-300 hover:shadow-xl ${
                isSelected
                  ? 'border-blue/40 bg-blue/90 shadow-blue/50 dark:border-blue/30 dark:bg-blue/80'
                  : 'border-white/40 bg-white/95 hover:bg-white dark:border-white/20 dark:bg-black/80 dark:hover:bg-black/90'
              }`}
            >
              {/* Glass morphism overlay */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/30 to-white/10 dark:from-white/20 dark:to-white/5" />

              {/* Camera icon */}
              <i
                className={`i-mingcute-camera-line relative z-10 text-lg drop-shadow-sm ${
                  isSelected ? 'text-white' : 'text-gray-700 dark:text-white'
                }`}
              />

              {/* Subtle inner shadow for depth */}
              <div className="absolute inset-0 rounded-full shadow-inner shadow-black/5" />
            </div>
          </m.div>
        </HoverCardTrigger>

        <HoverCardContent
          className={`w-80 overflow-hidden border-white/20 bg-white/95 p-0 backdrop-blur-[120px] dark:bg-black/95 ${
            isSelected ? 'shadow-2xl' : ''
          }`}
          side="top"
          align="center"
          sideOffset={8}
          // 当选中时阻止点击外部关闭
          onPointerDownOutside={
            isSelected ? (e) => e.preventDefault() : undefined
          }
          onEscapeKeyDown={isSelected ? (e) => e.preventDefault() : undefined}
        >
          <div className="relative">
            {/* 选中时显示关闭按钮 */}
            {isSelected && (
              <GlassButton
                className="absolute top-3 right-3 z-10 size-8"
                onClick={handleClose}
              >
                <i className="i-mingcute-close-line text-lg" />
              </GlassButton>
            )}

            {/* Photo header */}
            <div
              className={`relative overflow-hidden ${isSelected ? 'h-40' : 'h-32'}`}
            >
              <LazyImage
                src={marker.photo.thumbnailUrl || marker.photo.originalUrl}
                alt={marker.photo.title || marker.photo.id}
                thumbHash={marker.photo.thumbHash}
                className="h-full w-full object-cover"
                rootMargin="200px"
                threshold={0.1}
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
            </div>

            {/* Content */}
            <div className="space-y-3 p-4">
              {/* Title with link */}
              <Link
                to={`/${marker.photo.id}`}
                target="_blank"
                className="group/link hover:text-blue flex items-center gap-2 transition-colors"
              >
                <h3
                  className={`text-text flex-1 truncate font-semibold ${
                    isSelected ? 'text-base' : 'text-sm'
                  }`}
                  title={marker.photo.title || marker.photo.id}
                >
                  {marker.photo.title || marker.photo.id}
                </h3>
                <i className="i-mingcute-arrow-right-line text-text-secondary transition-transform group-hover/link:translate-x-0.5" />
              </Link>

              {/* Metadata */}
              <div className="space-y-2">
                {marker.photo.exif?.DateTimeOriginal && (
                  <div
                    className={`text-text-secondary flex items-center gap-2 ${isSelected ? 'text-sm' : 'text-xs'}`}
                  >
                    <i className="i-mingcute-calendar-line text-sm" />
                    <span className={isSelected ? 'text-xs' : ''}>
                      {new Date(
                        marker.photo.exif.DateTimeOriginal,
                      ).toLocaleDateString('zh-CN', {
                        year: 'numeric',
                        month: isSelected ? 'long' : 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                )}

                {marker.photo.exif?.Make && marker.photo.exif?.Model && (
                  <div
                    className={`text-text-secondary flex items-center gap-2 ${isSelected ? 'text-sm' : 'text-xs'}`}
                  >
                    <i className="i-mingcute-camera-line text-sm" />
                    <span className={`truncate ${isSelected ? 'text-xs' : ''}`}>
                      {marker.photo.exif.Make} {marker.photo.exif.Model}
                    </span>
                  </div>
                )}

                <div
                  className={`text-text-secondary space-y-1 ${isSelected ? 'text-sm' : 'text-xs'}`}
                >
                  <div className="flex items-center gap-2">
                    <i className="i-mingcute-location-line text-sm" />
                    <span
                      className={`font-mono ${isSelected ? 'text-xs' : ''}`}
                    >
                      <span>
                        {Math.abs(marker.latitude).toFixed(isSelected ? 6 : 4)}°
                      </span>
                      <span>{marker.latitudeRef || 'N'}</span>
                      <span>, </span>
                      <span>
                        {Math.abs(marker.longitude).toFixed(isSelected ? 6 : 4)}
                        °
                      </span>
                      <span>{marker.longitudeRef || 'E'}</span>
                    </span>
                  </div>
                  {marker.altitude !== undefined && (
                    <div className="flex items-center gap-2">
                      <i className="i-mingcute-mountain-2-line text-sm" />
                      <span
                        className={`font-mono ${isSelected ? 'text-xs' : ''}`}
                      >
                        <span>
                          {marker.altitudeRef === 'Below Sea Level' ? '-' : ''}
                        </span>
                        <span>{Math.abs(marker.altitude).toFixed(1)}m</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    </Marker>
  )
}
