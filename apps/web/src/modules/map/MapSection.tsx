import { photoLoader } from '@afilmory/data'
import { m } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  GenericMap,
  MapBackButton,
  MapInfoPanel,
  MapLoadingState,
} from '~/components/ui/map'
import {
  calculateMapBounds,
  convertPhotosToMarkersFromEXIF,
  getInitialViewStateForMarkers,
} from '~/lib/map-utils'
import { MapProvider } from '~/modules/map/MapProvider'
import type { MapBounds, PhotoMarker } from '~/types/map'

export const MapSection = () => {
  return (
    <MapProvider>
      <MapSectionContent />
    </MapProvider>
  )
}

const MapSectionContent = () => {
  const { t } = useTranslation()

  // Photo markers state and loading logic
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [markers, setMarkers] = useState<PhotoMarker[]>([])

  // Calculate bounds from markers
  const bounds = useMemo<MapBounds | null>(() => {
    if (markers.length === 0) return null
    return calculateMapBounds(markers)
  }, [markers])

  // Load photo markers effect
  useEffect(() => {
    const loadPhotoMarkersData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const photos = photoLoader.getPhotos()
        const photoMarkers = convertPhotosToMarkersFromEXIF(photos)

        setMarkers(photoMarkers)
        console.info(`Found ${photoMarkers.length} photos with GPS coordinates`)
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to load photo markers')
        setError(error)
        console.error('Failed to load photo markers:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadPhotoMarkersData()
  }, [setMarkers])

  // Initial view state calculation
  const initialViewState = useMemo(
    () => getInitialViewStateForMarkers(markers),
    [markers],
  )

  // Show loading state
  if (isLoading) {
    return <MapLoadingState />
  }

  // Show error state
  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-4xl">❌</div>
          <div className="text-lg font-medium text-red-900 dark:text-red-100">
            {t('explory.map.error.title')}
          </div>
          <p className="text-sm text-red-600 dark:text-red-400">
            {t('explory.map.error.description')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      {/* Back button */}
      <MapBackButton />

      {/* Map info panel */}
      <MapInfoPanel markersCount={markers.length} bounds={bounds} />

      {/* Generic Map component */}
      <m.div
        initial={{ opacity: 0, scale: 1.02 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="h-full w-full"
      >
        <GenericMap
          markers={markers}
          initialViewState={initialViewState}
          className="h-full w-full"
        />
      </m.div>
    </div>
  )
}
