import type { ReactNode } from 'react'

import type { MapBounds, MapViewState, PhotoMarker } from './index'

/**
 * Generic map provider interface
 */
export interface MapProvider {
  /** The display name of the map provider */
  name: string
  /** Whether the provider is available (e.g., has valid API keys) */
  isAvailable: boolean
  /** Initialize the provider */
  initialize: () => Promise<void>
  /** Clean up the provider */
  cleanup?: () => void
}

/**
 * Map interaction handlers
 */
export interface MapHandlers {
  onMarkerClick?: (marker: PhotoMarker) => void
  onGeoJsonClick?: (feature: GeoJSON.Feature) => void
  onGeolocate?: (longitude: number, latitude: number) => void
  onPopupClose?: () => void
}

/**
 * Map component props that any provider implementation should support
 */
export interface BaseMapProps {
  id?: string
  initialViewState?: MapViewState
  markers?: PhotoMarker[]
  selectedMarkerId?: string | null
  geoJsonData?: GeoJSON.FeatureCollection
  className?: string
  style?: React.CSSProperties
  theme?: 'light' | 'dark'
  showGeocoder?: boolean
  handlers?: MapHandlers
  autoFitBounds?: boolean
}

/**
 * Context value for map provider
 */
export interface MapContextValue {
  /** Current map provider */
  provider: MapProvider | null
  /** Available providers */
  providers: MapProvider[]
  /** Switch to a different provider */
  switchProvider: (providerName: string) => Promise<void>
  /** Current map bounds */
  bounds: MapBounds | null
  /** Selected marker */
  selectedMarker: PhotoMarker | null
  /** Set selected marker */
  setSelectedMarker: (marker: PhotoMarker | null) => void
  /** Fly to location */
  flyToLocation: (longitude: number, latitude: number) => void
  /** Show popup info */
  popupInfo: {
    marker: PhotoMarker
    longitude: number
    latitude: number
  } | null
  /** Set popup info */
  setPopupInfo: (
    info: { marker: PhotoMarker; longitude: number; latitude: number } | null,
  ) => void
}

/**
 * Map component interface that providers must implement
 */
export type MapComponent = (props: BaseMapProps) => ReactNode
