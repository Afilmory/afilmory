import * as React from 'react'
import { lazy } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'

import type { BaseMapProps, PhotoMarker } from '~/types/map'

import type { MapAdapter } from './MapProvider'

const Maplibre = lazy(() =>
  import('~/components/ui/map/MapLibre').then((m) => ({ default: m.Maplibre })),
)
/**
 * MapLibre map adapter implementation
 * This adapts MapLibre to work with our generic map provider system
 */
export class MapLibreMapAdapter implements MapAdapter {
  name = 'maplibre'

  readonly isAvailable: boolean = true

  MapComponent = MapLibreMapComponent

  async initialize(): Promise<void> {
    // MapLibre doesn't require additional async initialization
  }

  cleanup(): void {
    // No cleanup needed for MapLibre
  }
}

/**
 * MapLibre map component that integrates with the Map Provider context
 * This component reads configuration from the MapProvider context
 */
export const MapLibreMapComponent: React.FC<BaseMapProps> = ({
  id,
  initialViewState,
  markers,
  selectedMarkerId,
  geoJsonData,
  className,
  style,
  handlers,
  autoFitBounds,
}) => {
  const mapRef = React.useRef<MapRef>(null)

  // Default map config constants
  const DEFAULT_ANIMATION_DURATION = 1000
  const DEFAULT_ZOOM = 14

  // Handle GeoJSON click
  const handleGeoJsonClick = React.useCallback(
    (
      event: maplibregl.MapMouseEvent & {
        features?: maplibregl.GeoJSONFeature[]
      },
    ) => {
      if (!handlers?.onGeoJsonClick) return

      const feature = event.features?.[0]
      if (feature) {
        handlers.onGeoJsonClick(feature as GeoJSON.Feature)
      }
    },
    [handlers],
  )

  // Fly to location with animation duration from config
  const flyToLocation = React.useCallback(
    (longitude: number, latitude: number, zoom?: number) => {
      mapRef.current?.flyTo({
        center: [longitude, latitude],
        duration: DEFAULT_ANIMATION_DURATION,
        zoom: zoom || DEFAULT_ZOOM,
      })
    },
    [], // No dependencies needed as constants don't change
  )

  // Handle marker click
  const handleMarkerClick = React.useCallback(
    (marker: PhotoMarker) => {
      handlers?.onMarkerClick?.(marker)
    },
    [handlers],
  )

  // Handle geolocate
  const handleGeolocate = React.useCallback(
    (longitude: number, latitude: number) => {
      flyToLocation(longitude, latitude)
      handlers?.onGeolocate?.(longitude, latitude)
    },
    [flyToLocation, handlers],
  )

  return (
    <Maplibre
      id={id}
      initialViewState={initialViewState}
      markers={markers}
      selectedMarkerId={selectedMarkerId}
      geoJsonData={geoJsonData}
      onMarkerClick={handleMarkerClick}
      onGeoJsonClick={handleGeoJsonClick}
      onGeolocate={handleGeolocate}
      className={className}
      style={style}
      mapRef={mapRef}
      autoFitBounds={autoFitBounds}
    />
  )
}

/**
 * Create a MapLibre adapter instance
 */
export const createMapLibreAdapter = (): MapAdapter => {
  return new MapLibreMapAdapter()
}
