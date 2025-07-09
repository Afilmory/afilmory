import { m } from 'motion/react'
import { Marker } from 'react-map-gl/maplibre'

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '~/components/ui/hover-card'
import { LazyImage } from '~/components/ui/lazy-image'

import { ClusterPhotoGrid } from '../ClusterPhotoGrid'
import type { ClusterMarkerProps } from './types'

export const ClusterMarker = ({
  longitude,
  latitude,
  pointCount,
  representativeMarker: _representativeMarker,
  clusteredPhotos = [],
  onClusterClick,
}: ClusterMarkerProps) => {
  const size = Math.min(64, Math.max(40, 32 + Math.log(pointCount) * 8))

  return (
    <Marker longitude={longitude} latitude={latitude}>
      <HoverCard openDelay={300} closeDelay={150}>
        <HoverCardTrigger asChild>
          <m.div
            className="group relative cursor-pointer"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 25,
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onClusterClick?.(longitude, latitude)}
          >
            {/* Subtle pulse ring for attention */}
            <div
              className="bg-blue/20 absolute inset-0 animate-pulse rounded-full opacity-60"
              style={{
                width: size + 12,
                height: size + 12,
                left: -6,
                top: -6,
              }}
            />

            {/* Main cluster container */}
            <div
              className="relative flex items-center justify-center rounded-full border border-white/40 bg-white/95 shadow-lg backdrop-blur-md transition-all duration-300 hover:bg-white hover:shadow-xl dark:border-white/10 dark:bg-black/80 dark:hover:bg-black/90"
              style={{
                width: size,
                height: size,
              }}
            >
              {/* Background mosaic of photos */}
              {clusteredPhotos.length > 0 && (
                <div className="absolute inset-1 overflow-hidden rounded-full">
                  {/* Show up to 4 photos in a mosaic pattern */}
                  {clusteredPhotos.slice(0, 4).map((photoMarker, index) => {
                    const positions = [
                      { left: '0%', top: '0%', width: '50%', height: '50%' },
                      { left: '50%', top: '0%', width: '50%', height: '50%' },
                      { left: '0%', top: '50%', width: '50%', height: '50%' },
                      { left: '50%', top: '50%', width: '50%', height: '50%' },
                    ]
                    const position = positions[index]

                    return (
                      <div
                        key={photoMarker.photo.id}
                        className="absolute opacity-30"
                        style={position}
                      >
                        <LazyImage
                          src={
                            photoMarker.photo.thumbnailUrl ||
                            photoMarker.photo.originalUrl
                          }
                          alt={photoMarker.photo.title || photoMarker.photo.id}
                          thumbHash={photoMarker.photo.thumbHash}
                          className="h-full w-full object-cover"
                          rootMargin="100px"
                          threshold={0.1}
                        />
                      </div>
                    )
                  })}

                  {/* Overlay for mosaic effect */}
                  <div className="from-blue/40 to-indigo/60 absolute inset-0 bg-gradient-to-br" />
                </div>
              )}

              {/* Glass morphism overlay */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/30 to-white/10 dark:from-white/20 dark:to-white/5" />

              {/* Count display */}
              <div className="relative z-10 flex flex-col items-center text-xs">
                <span className="text-text font-bold">{pointCount}</span>
              </div>

              {/* Subtle inner shadow for depth */}
              <div className="absolute inset-0 rounded-full shadow-inner shadow-black/5" />
            </div>
          </m.div>
        </HoverCardTrigger>

        <HoverCardContent
          className="w-80 overflow-hidden border-white/20 bg-white/95 p-0 backdrop-blur-[120px] dark:bg-black/95"
          side="top"
          align="center"
          sideOffset={8}
        >
          <div className="p-4">
            <ClusterPhotoGrid
              photos={clusteredPhotos}
              onPhotoClick={(_photo) => {
                // Optional: handle individual photo clicks
                // Photo click handling can be implemented here if needed
              }}
            />
          </div>
        </HoverCardContent>
      </HoverCard>
    </Marker>
  )
}
