import { siteConfig } from '@config'
import { createContext, use, useMemo } from 'react'

import type { BaseMapProps } from '~/types/map'

import { createMapLibreAdapter } from './MapLibreAdapter'

/**
 * Defines the interface for a map adapter.
 * This allows for different map providers to be used interchangeably.
 */
export interface MapAdapter {
  name: string
  isAvailable: boolean
  initialize: () => Promise<void>
  cleanup?: () => void

  MapComponent: React.FC<BaseMapProps>
}

/**
 * Context for providing the current map adapter.
 */
interface MapContextType {
  adapter: MapAdapter | null
}

export const MapContext = createContext<MapContextType | null>(null)

/**
 * Hook to get the current map adapter from the context.
 */
export const useMapAdapter = () => {
  const context = use(MapContext)
  if (!context) {
    throw new Error('useMapAdapter must be used within a MapProvider')
  }
  return context.adapter
}

const maplibreAdapter = createMapLibreAdapter()

const ADAPTERS = [
  {
    name: 'maplibre',
    adapter: maplibreAdapter,
    component: maplibreAdapter.MapComponent,
  },
]

/**
 * Get the preferred map adapter based on configuration
 */
const getPreferredAdapter = () => {
  const mapConfig = siteConfig.map

  // If no map configuration is provided, use the first available adapter
  if (!mapConfig) {
    const adapter = ADAPTERS.find((a) => a.adapter.isAvailable) || null
    if (adapter) {
      console.info(`Map: Selected default adapter: ${adapter.name}`)
    }
    return adapter
  }

  // If mapConfig is a string (single provider)
  if (typeof mapConfig === 'string') {
    const adapter = ADAPTERS.find(
      (a) => a.name === mapConfig && a.adapter.isAvailable,
    )
    if (adapter) {
      console.info(`Map: Selected specified adapter: ${adapter.name}`)
      return adapter
    }
    // If specified provider is not available, fall back to first available
    const fallbackAdapter = ADAPTERS.find((a) => a.adapter.isAvailable) || null
    if (fallbackAdapter) {
      console.info(
        `Map: Specified adapter '${mapConfig}' not available, using fallback: ${fallbackAdapter.name}`,
      )
    }
    return fallbackAdapter
  }

  // If mapConfig is an array (priority list)
  if (Array.isArray(mapConfig)) {
    for (const providerName of mapConfig) {
      const adapter = ADAPTERS.find(
        (a) => a.name === providerName && a.adapter.isAvailable,
      )
      if (adapter) {
        console.info(
          `Map: Selected adapter from priority list: ${adapter.name}`,
        )
        return adapter
      }
    }
    // If none of the priority providers are available, use first available
    const fallbackAdapter = ADAPTERS.find((a) => a.adapter.isAvailable) || null
    if (fallbackAdapter) {
      console.info(
        `Map: None of the priority providers available, using fallback: ${fallbackAdapter.name}`,
      )
    }
    return fallbackAdapter
  }

  // Default to first available adapter
  const adapter = ADAPTERS.find((a) => a.adapter.isAvailable) || null
  if (adapter) {
    console.info(`Map: Selected default adapter: ${adapter.name}`)
  } else {
    console.warn('Map: No adapters are available')
  }
  return adapter
}

export const MapProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const adapter = useMemo(() => {
    const preferredAdapter = getPreferredAdapter()
    if (preferredAdapter) {
      return {
        ...preferredAdapter.adapter,
        MapComponent: preferredAdapter.component,
      }
    }
    return null
  }, [])

  const value = useMemo(() => ({ adapter }), [adapter])

  return <MapContext value={value}>{children}</MapContext>
}

/**
 * Utility function to get information about all available map adapters
 * Useful for debugging and diagnostics
 */
export const getMapAdapterInfo = () => {
  return ADAPTERS.map((adapter) => ({
    name: adapter.name,
    isAvailable: adapter.adapter.isAvailable,
    adapterName: adapter.adapter.name,
  }))
}

/**
 * Get the current map configuration from site config
 */
export const getMapConfig = () => siteConfig.map
