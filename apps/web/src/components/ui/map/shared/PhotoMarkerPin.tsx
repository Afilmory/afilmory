import { GlassButton, HoverCard, HoverCardContent, HoverCardTrigger, LazyImage } from '@afilmory/ui'
import { m } from 'motion/react'
import { Marker } from 'react-map-gl/maplibre'
import { Link } from 'react-router'

import { resolvePhotoMarkerCardBehavior } from './photo-marker-card-behavior'
import type { PhotoMarkerPinProps } from './types'

export const PhotoMarkerPin = ({ marker, isSelected = false, onClick, onClose }: PhotoMarkerPinProps) => {
  const cardBehavior = resolvePhotoMarkerCardBehavior({ isSelected })

  const handleClick = () => {
    onClick?.(marker)
  }

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClose?.()
  }

  return (
    <Marker key={marker.id} longitude={marker.longitude} latitude={marker.latitude}>
      <HoverCard
        open={cardBehavior.hoverCardOpen}
        openDelay={cardBehavior.hoverCardOpenDelay}
        closeDelay={cardBehavior.hoverCardCloseDelay}
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
            {isSelected && <div className="bg-blue/30 absolute inset-0 -m-2 animate-pulse rounded-full" />}

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
              <div className="from-green/60 to-emerald/80 dark:from-green/70 dark:to-emerald/90 absolute inset-0 bg-linear-to-br" />
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
              <div className="absolute inset-0 rounded-full bg-linear-to-br from-white/30 to-white/10 dark:from-white/20 dark:to-white/5" />

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

        {!cardBehavior.renderAnchoredCard && (
          <HoverCardContent
            className="w-80 overflow-hidden border-white/20 bg-white/95 p-0 backdrop-blur-[120px] dark:bg-black/95"
            side="top"
            align="center"
            sideOffset={8}
          >
            <PhotoMarkerCardContent marker={marker} />
          </HoverCardContent>
        )}
      </HoverCard>

      {cardBehavior.renderAnchoredCard && <AnchoredPhotoMarkerCard marker={marker} onClose={handleClose} />}
    </Marker>
  )
}

const AnchoredPhotoMarkerCard = ({
  marker,
  onClose,
}: {
  marker: PhotoMarkerPinProps['marker']
  onClose: (event: React.MouseEvent) => void
}) => (
  <div
    className="pointer-events-auto absolute bottom-full left-1/2 z-30 mb-3 w-80 -translate-x-1/2"
    onClick={event => event.stopPropagation()}
    onPointerDown={event => event.stopPropagation()}
  >
    <m.div
      className="origin-bottom overflow-hidden rounded-2xl border border-white/20 bg-white/95 p-0 shadow-2xl backdrop-blur-[120px] dark:bg-black/95"
      initial={{ opacity: 0, scale: 0.96, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{
        type: 'spring',
        stiffness: 380,
        damping: 32,
      }}
    >
      <PhotoMarkerCardContent marker={marker} onClose={onClose} />
    </m.div>
  </div>
)

const PhotoMarkerCardContent = ({
  marker,
  onClose,
}: {
  marker: PhotoMarkerPinProps['marker']
  onClose?: (event: React.MouseEvent) => void
}) => (
  <div className="relative">
    {onClose && (
      <GlassButton className="absolute top-3 right-3 z-10 size-8" onClick={onClose}>
        <i className="i-mingcute-close-line text-lg" />
      </GlassButton>
    )}

    <div className="relative h-32 overflow-hidden">
      <LazyImage
        src={marker.photo.thumbnailUrl || marker.photo.originalUrl}
        alt={marker.photo.title || marker.photo.id}
        thumbHash={marker.photo.thumbHash}
        className="h-full w-full object-cover"
        rootMargin="200px"
        threshold={0.1}
      />
      <div className="absolute inset-0 bg-linear-to-t from-black/30 to-transparent" />
    </div>

    <div className="space-y-3 p-4">
      <Link
        to={`/photos/${marker.photo.id}`}
        target="_blank"
        className="group/link hover:text-blue flex items-center gap-2 transition-colors"
      >
        <h3 className="text-text flex-1 truncate text-sm font-semibold" title={marker.photo.title || marker.photo.id}>
          {marker.photo.title || marker.photo.id}
        </h3>
        <i className="i-mingcute-arrow-right-line text-text-secondary transition-transform group-hover/link:translate-x-0.5" />
      </Link>

      <div className="space-y-2">
        {marker.photo.exif?.DateTimeOriginal && (
          <div className="text-text-secondary flex items-center gap-2 text-xs">
            <i className="i-mingcute-calendar-line text-sm" />
            <span>
              {new Date(marker.photo.exif.DateTimeOriginal).toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>
        )}

        {marker.photo.exif?.Make && marker.photo.exif?.Model && (
          <div className="text-text-secondary flex items-center gap-2 text-xs">
            <i className="i-mingcute-camera-line text-sm" />
            <span className="truncate">
              <span>{marker.photo.exif.Make}</span>
              <span> </span>
              <span>{marker.photo.exif.Model}</span>
            </span>
          </div>
        )}

        <div className="text-text-secondary space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <i className="i-mingcute-location-line text-sm" />
            <span className="font-mono">
              <span>{Math.abs(marker.latitude).toFixed(4)}</span>
              <span>°</span>
              <span>{marker.latitudeRef || 'N'}</span>
              <span>, </span>
              <span>{Math.abs(marker.longitude).toFixed(4)}</span>
              <span>°</span>
              <span>{marker.longitudeRef || 'E'}</span>
            </span>
          </div>
          {marker.altitude !== undefined && (
            <div className="flex items-center gap-2">
              <i className="i-mingcute-mountain-2-line text-sm" />
              <span className="font-mono">
                <span>{marker.altitude.toFixed(1)}</span>
                <span>m</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
)
