import { MapLibreMapComponent } from './MapLibreMap'
import type { MapAdapter } from './MapProvider'

class MapLibreMapAdapter implements MapAdapter {
  name = 'maplibre'

  readonly isAvailable: boolean = true

  MapComponent = MapLibreMapComponent

  async initialize(): Promise<void> {}

  cleanup(): void {}
}

export const createMapLibreAdapter = (): MapAdapter => {
  return new MapLibreMapAdapter()
}
