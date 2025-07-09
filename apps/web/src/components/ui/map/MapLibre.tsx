// Styles
import 'maplibre-gl/dist/maplibre-gl.css'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Map from 'react-map-gl/maplibre'

import { calculateMapBounds } from '~/lib/map-utils'
import type { PhotoMarker } from '~/types/map'

import MAP_STYLE from './MapLibreStyle.json'
import {
  ClusterMarker,
  clusterMarkers,
  DEFAULT_MARKERS,
  DEFAULT_STYLE,
  DEFAULT_VIEW_STATE,
  GeoJsonLayer,
  MapControls,
  PhotoMarkerPin,
} from './shared'

export interface PureMaplibreProps {
  id?: string
  initialViewState?: {
    longitude: number
    latitude: number
    zoom: number
  }
  markers?: PhotoMarker[]
  geoJsonData?: GeoJSON.FeatureCollection
  onMarkerClick?: (marker: PhotoMarker) => void
  onGeoJsonClick?: (event: any) => void
  onGeolocate?: (longitude: number, latitude: number) => void
  onClusterClick?: (longitude: number, latitude: number) => void
  className?: string
  style?: React.CSSProperties
  mapRef?: React.RefObject<any>
  autoFitBounds?: boolean
}

export const Maplibre = ({
  id,
  initialViewState = DEFAULT_VIEW_STATE,
  markers = DEFAULT_MARKERS,
  geoJsonData,
  onMarkerClick,
  onGeoJsonClick,
  onGeolocate,
  onClusterClick,
  className = 'w-full h-full',
  style = DEFAULT_STYLE,
  mapRef,
  autoFitBounds = true,
}: PureMaplibreProps) => {
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null)
  const [currentZoom, setCurrentZoom] = useState(initialViewState.zoom)
  const [viewState, setViewState] = useState(initialViewState)
  const [isMapLoaded, setIsMapLoaded] = useState(false)

  // Handle marker click
  const handleMarkerClick = useCallback(
    (marker: PhotoMarker) => {
      // Toggle selection: if already selected, deselect; otherwise select
      setSelectedMarkerId((prev) => (prev === marker.id ? null : marker.id))
      onMarkerClick?.(marker)
    },
    [onMarkerClick],
  )

  // Handle marker close
  const handleMarkerClose = useCallback(() => {
    setSelectedMarkerId(null)
  }, [])

  // Clustered markers
  const clusteredMarkers = useMemo(
    () => clusterMarkers(markers, currentZoom),
    [markers, currentZoom],
  )

  // 计算合适的缩放级别
  const calculateZoomLevel = useCallback((latDiff: number, lngDiff: number) => {
    const maxDiff = Math.max(latDiff, lngDiff)

    if (maxDiff < 0.001) return 16 // 非常接近的点
    if (maxDiff < 0.01) return 14 // 很接近的点
    if (maxDiff < 0.1) return 11 // 附近的点
    if (maxDiff < 1) return 8 // 同一城市
    if (maxDiff < 10) return 5 // 同一国家/地区
    return 2 // 跨洲
  }, [])

  // 自动适配到包含所有照片的区域
  const fitMapToBounds = useCallback(() => {
    if (!autoFitBounds || markers.length === 0 || !isMapLoaded) return

    const bounds = calculateMapBounds(markers)
    if (!bounds) return

    // 如果只有一个点，设置默认缩放级别
    if (markers.length === 1) {
      const newViewState = {
        longitude: markers[0].longitude,
        latitude: markers[0].latitude,
        zoom: 13, // 单点时的合理缩放级别
      }
      setViewState(newViewState)
      setCurrentZoom(newViewState.zoom)
      return
    }

    // 使用 mapRef 的 fitBounds 方法（推荐方式）
    if (mapRef?.current?.getMap) {
      // 计算动态padding，确保照片区域控制在窗口的80%内
      // 这意味着每边留出10%的空间作为缓冲区
      const mapContainer = mapRef.current.getContainer()
      const containerWidth = mapContainer.offsetWidth
      const containerHeight = mapContainer.offsetHeight

      const paddingPercentage = 0.1 // 每边10%的padding
      const horizontalPadding = containerWidth * paddingPercentage
      const verticalPadding = containerHeight * paddingPercentage

      const padding = {
        top: Math.max(verticalPadding, 40), // 最小40px
        bottom: Math.max(verticalPadding, 40),
        left: Math.max(horizontalPadding, 40),
        right: Math.max(horizontalPadding, 40),
      }

      try {
        const map = mapRef.current.getMap()
        map.fitBounds(
          [
            [bounds.minLng, bounds.minLat], // 西南角
            [bounds.maxLng, bounds.maxLat], // 东北角
          ],
          {
            padding,
            duration: 800, // 平滑动画
            maxZoom: 15, // 最大缩放级别限制，避免过度放大
          },
        )
      } catch (error) {
        console.warn('使用 fitBounds 失败，使用备用方案:', error)
        // 备用方案：手动计算视图状态
        fallbackToViewState(bounds)
      }
    } else {
      // mapRef 不可用时的备用方案
      fallbackToViewState(bounds)
    }

    function fallbackToViewState(
      bounds: ReturnType<typeof calculateMapBounds>,
    ) {
      if (!bounds) return

      const latDiff = bounds.maxLat - bounds.minLat
      const lngDiff = bounds.maxLng - bounds.minLng
      // 为备用方案也增加一些缓冲，降低一级缩放
      const zoom = Math.max(calculateZoomLevel(latDiff, lngDiff) - 1, 2)

      const newViewState = {
        longitude: bounds.centerLng,
        latitude: bounds.centerLat,
        zoom,
      }

      setViewState(newViewState)
      setCurrentZoom(zoom)
    }
  }, [markers, autoFitBounds, isMapLoaded, mapRef, calculateZoomLevel])

  // 当地图加载完成时触发适配
  const handleMapLoad = useCallback(() => {
    setIsMapLoaded(true)
  }, [])

  // 当标记点变化时，重新适配边界
  useEffect(() => {
    // 延迟执行，确保地图已渲染
    const timer = setTimeout(() => {
      fitMapToBounds()
    }, 100)

    return () => clearTimeout(timer)
  }, [fitMapToBounds])

  return (
    <div className={className} style={style}>
      <Map
        id={id}
        ref={mapRef}
        {...viewState}
        style={{ width: '100%', height: '100%' }}
        // @ts-expect-error
        mapStyle={MAP_STYLE}
        attributionControl={false}
        interactiveLayerIds={geoJsonData ? ['data'] : undefined}
        onClick={onGeoJsonClick}
        onLoad={handleMapLoad}
        onMove={(evt) => {
          setCurrentZoom(evt.viewState.zoom)
          setViewState(evt.viewState)
        }}
      >
        {/* Map Controls */}
        <MapControls onGeolocate={onGeolocate} />

        {/* Photo Markers */}
        {clusteredMarkers.map((clusterPoint) => {
          if (clusterPoint.properties.cluster) {
            // Render cluster marker
            return (
              <ClusterMarker
                key={`cluster-${clusterPoint.geometry.coordinates[0]}-${clusterPoint.geometry.coordinates[1]}`}
                longitude={clusterPoint.geometry.coordinates[0]}
                latitude={clusterPoint.geometry.coordinates[1]}
                pointCount={clusterPoint.properties.point_count || 0}
                representativeMarker={clusterPoint.properties.marker}
                clusteredPhotos={clusterPoint.properties.clusteredPhotos}
                onClusterClick={onClusterClick}
              />
            )
          } else {
            // Render individual marker
            const { marker } = clusterPoint.properties
            if (!marker) return null

            return (
              <PhotoMarkerPin
                key={marker.id}
                marker={marker}
                isSelected={selectedMarkerId === marker.id}
                onClick={handleMarkerClick}
                onClose={handleMarkerClose}
              />
            )
          }
        })}

        {/* GeoJSON Layer */}
        {geoJsonData && <GeoJsonLayer data={geoJsonData} />}
      </Map>
    </div>
  )
}
