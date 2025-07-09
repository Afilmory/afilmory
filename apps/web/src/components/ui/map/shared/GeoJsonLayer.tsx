import { Layer, Source } from 'react-map-gl/maplibre'

import type { GeoJsonLayerProps, LayerProps } from './types'

const DEFAULT_LAYER_STYLE: LayerProps = {
  id: 'data',
  type: 'fill',
  paint: {
    'fill-color': '#0080ff',
    'fill-opacity': 0.5,
  },
}

export const GeoJsonLayer = ({
  data,
  layerStyle = DEFAULT_LAYER_STYLE,
}: GeoJsonLayerProps) => {
  return (
    <Source type="geojson" data={data}>
      <Layer {...layerStyle} />
    </Source>
  )
}
