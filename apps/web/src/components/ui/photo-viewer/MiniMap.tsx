import 'maplibre-gl/dist/maplibre-gl.css'

import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import Map from 'react-map-gl/maplibre'

import { getMapStyle } from '~/lib/map/style'


interface MiniMapProps {
  latitude: number
  longitude: number
  photoId: string
}

export const MiniMap = ({ latitude, longitude, photoId }: MiniMapProps) => {
  const [isLoaded, setIsLoaded] = useState(false)

  const handleMapLoad = useCallback(() => {
    setIsLoaded(true)
  }, [])

  // 检查是否有有效的GPS坐标
  const hasValidCoordinates = latitude !== 0 && longitude !== 0

  if (!hasValidCoordinates) {
    return null
  }

  return (
    <div className="relative h-40 w-full overflow-hidden rounded-lg border border-white/10">
      <Map
        mapLib={import('maplibre-gl')}
        key={`${latitude}-${longitude}`}
        longitude={longitude}
        latitude={latitude}
        zoom={15}
        style={{ width: '100%', height: '100%' }}
        mapStyle={getMapStyle()}
        attributionControl={false}
        onLoad={handleMapLoad}
        interactive={false}
      />

      {/* 中心标记 */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 animate-ping rounded-full bg-blue-400 opacity-75" />
          <div className="relative h-2 w-2 rounded-full bg-blue-500 ring-2 ring-white/80" />
        </div>
      </div>

      {/* 加载状态 */}
      {!isLoaded && (
        <div className="bg-material-ultra-thin absolute inset-0 flex items-center justify-center backdrop-blur-sm">
          <div className="text-xs text-white/60">加载地图中...</div>
        </div>
      )}

      {/* 点击跳转到explore页面的遮罩 */}
      <Link
        to={`/explory?photoId=${photoId}`}
        target='_blank'
        className="absolute inset-0 cursor-pointer transition-opacity duration-200 hover:bg-black/10"
        aria-label="在地图中查看位置"
      />
    </div>
  )
}
