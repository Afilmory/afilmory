import { siteConfig } from '@config'
import type { StyleSpecification } from 'maplibre-gl'

import BUILTIN_MAP_STYLE from '../../components/ui/map/MapLibreStyle.json'

export const getMapStyle = (): string | StyleSpecification => {
  const builtinStyle = BUILTIN_MAP_STYLE as StyleSpecification
  if (!siteConfig.mapStyle) {
    return builtinStyle
  }
  return siteConfig.mapStyle === 'builtin' ? builtinStyle : siteConfig.mapStyle
}
