import type { Feature } from 'geojson'
import type { GeoJSONFeature, MapMouseEvent } from 'maplibre-gl'
import * as React from 'react'
import { lazy } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'

import type { BaseMapProps, PhotoMarker } from '~/types/map'

const Maplibre = lazy(() => import('~/components/ui/map/MapLibre').then(m => ({ default: m.Maplibre })))

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
  const DEFAULT_ANIMATION_DURATION = 1000
  const DEFAULT_ZOOM = 14

  const handleGeoJsonClick = React.useCallback(
    (
      event: MapMouseEvent & {
        features?: GeoJSONFeature[]
      },
    ) => {
      if (!handlers?.onGeoJsonClick) {
        return
      }

      const feature = event.features?.[0]
      if (feature) {
        handlers.onGeoJsonClick(feature as Feature)
      }
    },
    [handlers],
  )

  const flyToLocation = React.useCallback((longitude: number, latitude: number, zoom?: number) => {
    mapRef.current?.flyTo({
      center: [longitude, latitude],
      duration: DEFAULT_ANIMATION_DURATION,
      zoom: zoom || DEFAULT_ZOOM,
    })
  }, [])

  const handleMarkerClick = React.useCallback(
    (marker: PhotoMarker) => {
      handlers?.onMarkerClick?.(marker)
    },
    [handlers],
  )

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
