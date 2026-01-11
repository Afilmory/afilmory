import { clsxm } from '@afilmory/utils'
import { SparkRenderer, SplatFileType, SplatMesh } from '@sparkjsdev/spark'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import type { LoadingIndicatorRef } from '~/modules/inspector'
import type { PhotoManifest } from '~/types/photo'

import {
  type ActiveCameraState,
  applyCameraProjection,
  applyMetadataCamera,
  clearMetadataCamera,
  type DefaultCameraState,
  type DefaultControlsState,
  fitViewToMesh,
} from './threeDSceneCamera'
import { readSogMetadata } from './threeDSceneMetadata'
import { useThreeDSceneParallax } from './useThreeDSceneParallax'

type ThreeDSceneSource = NonNullable<PhotoManifest['threeDScene']>

// --- Viewer component ---

interface ThreeDSceneViewerProps {
  scene: ThreeDSceneSource
  className?: string
  imageWidth?: number
  imageHeight?: number
  sceneBytes?: Uint8Array | null
  loadingIndicatorRef?: React.RefObject<LoadingIndicatorRef | null>
  onLoadingChange?: (isLoading: boolean) => void
  onError?: (error: Error) => void
  onReady?: () => void
}

export const ThreeDSceneViewer = ({
  scene,
  className,
  imageWidth,
  imageHeight,
  sceneBytes,
  loadingIndicatorRef,
  onLoadingChange,
  onError,
  onReady,
}: ThreeDSceneViewerProps) => {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasContainerRef = useRef<HTMLDivElement | null>(null)
  const canvasBoundsRef = useRef<{ width: number; height: number } | null>(null)
  const updateBoundsRef = useRef<(() => void) | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const sparkRef = useRef<SparkRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const meshRef = useRef<SplatMesh | null>(null)
  const frameRef = useRef<number | null>(null)
  const defaultCameraRef = useRef<DefaultCameraState | null>(null)
  const defaultControlsRef = useRef<DefaultControlsState | null>(null)
  const activeCameraRef = useRef<ActiveCameraState | null>(null)
  const resizeRef = useRef<(() => void) | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  const { applyParallaxFrame, updateParallaxState } = useThreeDSceneParallax({
    containerRef,
    cameraRef,
    controlsRef,
  })

  const [canvasBounds, setCanvasBounds] = useState<{ width: number; height: number } | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updateBounds = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const containerWidth = container.clientWidth || 1
    const containerHeight = container.clientHeight || 1

    let targetWidth = containerWidth
    let targetHeight = containerHeight

    if (typeof imageWidth === 'number' && typeof imageHeight === 'number' && imageWidth > 0 && imageHeight > 0) {
      const scale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight)
      targetWidth = imageWidth * scale
      targetHeight = imageHeight * scale
    }

    const next = {
      width: Math.max(1, Math.round(targetWidth)),
      height: Math.max(1, Math.round(targetHeight)),
    }

    const prev = canvasBoundsRef.current
    if (prev && prev.width === next.width && prev.height === next.height) return
    canvasBoundsRef.current = next
    setCanvasBounds(next)
    resizeRef.current?.()
  }, [imageHeight, imageWidth])

  useEffect(() => {
    updateBoundsRef.current = updateBounds
    updateBounds()
  }, [updateBounds])

  // Initialize Three + Spark renderer once
  useEffect(() => {
    const container = containerRef.current
    const canvasContainer = canvasContainerRef.current
    if (!container || !canvasContainer) return

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setClearColor(0x000000, 0)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'
    canvasContainer.append(renderer.domElement)

    const sceneObj = new THREE.Scene()
    sceneObj.background = null

    const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 500)
    camera.position.set(0.5, 0.5, 2.5)
    const defaultCamera: DefaultCameraState = {
      fov: camera.fov,
      near: camera.near,
      far: camera.far,
    }

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = false
    controls.dampingFactor = 0.08
    controls.rotateSpeed = 0.75
    controls.zoomSpeed = 0.6
    controls.panSpeed = 0.6
    controls.enableRotate = false
    controls.enablePan = false
    controls.enableZoom = false
    controls.target.set(0, 0, 0)
    const defaultControls: DefaultControlsState = {
      dampingFactor: controls.dampingFactor,
      rotateSpeed: controls.rotateSpeed,
      zoomSpeed: controls.zoomSpeed,
      panSpeed: controls.panSpeed,
    }

    const spark = new SparkRenderer({ renderer })
    sceneObj.add(spark)

    rendererRef.current = renderer
    sceneRef.current = sceneObj
    cameraRef.current = camera
    sparkRef.current = spark
    controlsRef.current = controls
    defaultCameraRef.current = defaultCamera
    defaultControlsRef.current = defaultControls

    const resize = () => {
      if (!renderer || !camera) return
      const bounds = canvasBoundsRef.current
      const width = (bounds?.width ?? canvasContainer.clientWidth) || 1
      const height = (bounds?.height ?? canvasContainer.clientHeight) || 1
      renderer.setSize(width, height, false)
      if (activeCameraRef.current && defaultCameraRef.current && defaultControlsRef.current) {
        applyCameraProjection({
          cameraMetadata: activeCameraRef.current,
          camera,
          controls,
          viewportWidth: width,
          viewportHeight: height,
          defaultCamera: defaultCameraRef.current,
          defaultControls: defaultControlsRef.current,
        })
      } else {
        camera.aspect = width / Math.max(1, height)
        camera.updateProjectionMatrix()
      }
    }

    const handleResize = () => {
      if (updateBoundsRef.current) {
        updateBoundsRef.current()
        return
      }
      resize()
    }

    window.addEventListener('resize', handleResize)
    handleResize()
    resizeRef.current = resize
    let resizeObserver: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => handleResize())
      resizeObserver.observe(container)
      resizeObserverRef.current = resizeObserver
    }

    const animate = () => {
      applyParallaxFrame()
      controls.update()
      renderer.render(sceneObj, camera)
      frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)

    setIsReady(true)

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      window.removeEventListener('resize', handleResize)
      resizeObserver?.disconnect()
      controls.dispose()
      renderer.dispose()
      meshRef.current?.dispose()
      const sparkMesh = spark as unknown as THREE.Mesh
      ;(sparkMesh.geometry as THREE.BufferGeometry | undefined)?.dispose?.()
      const sparkMaterial = sparkMesh.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(sparkMaterial)) {
        sparkMaterial.forEach((material) => material.dispose?.())
      } else {
        sparkMaterial?.dispose?.()
      }
      sceneObj.clear()
      if (renderer.domElement.parentElement === canvasContainer) {
        renderer.domElement.remove()
      }
    }
  }, [])

  // Load SOG scene from preloaded bytes
  useEffect(() => {
    if (!isReady) return
    if (!scene || scene.mode !== 'sog') return
    if (!sceneBytes) return
    const container = containerRef.current
    const canvasContainer = canvasContainerRef.current
    const renderer = rendererRef.current
    const sceneObj = sceneRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    const spark = sparkRef.current
    const defaultCamera = defaultCameraRef.current
    const defaultControls = defaultControlsRef.current

    if (
      !container ||
      !canvasContainer ||
      !renderer ||
      !sceneObj ||
      !camera ||
      !controls ||
      !spark ||
      !defaultCamera ||
      !defaultControls
    ) {
      return
    }

    let disposed = false
    setError(null)
    setIsLoading(true)
    onLoadingChange?.(true)
    loadingIndicatorRef?.current?.updateLoadingState({
      isVisible: true,
      isConverting: false,
      isQueueWaiting: false,
      isHeicFormat: false,
      isError: false,
      isWebGLLoading: true,
      webglMessage: t('photo.3d.loading'),
      webglDetail: t('photo.3d.loadingDetail'),
      webglQuality: 'unknown',
      loadingProgress: 0,
      loadedBytes: 0,
      totalBytes: 0,
    })

    const removeCurrentMesh = () => {
      if (meshRef.current) {
        sceneObj.remove(meshRef.current)
        meshRef.current.dispose()
        meshRef.current = null
      }
    }

    const load = async () => {
      try {
        if (sceneBytes.byteLength === 0) {
          throw new Error('Empty 3D scene buffer')
        }

        const metadataBytes = sceneBytes
        const meshBytes = sceneBytes.slice()
        const cameraMetadata = await readSogMetadata(metadataBytes)

        const mesh = new SplatMesh({
          fileBytes: meshBytes,
          fileType: SplatFileType.PCSOGSZIP,
          fileName: scene.s3Key ?? scene.url,
        })
        await mesh.initialized
        if (disposed) {
          mesh.dispose()
          return
        }

        removeCurrentMesh()
        meshRef.current = mesh
        sceneObj.add(mesh)

        clearMetadataCamera({
          camera,
          controls,
          defaultCamera,
          defaultControls,
          activeCameraRef,
        })

        if (cameraMetadata) {
          applyMetadataCamera({
            mesh,
            cameraMetadata,
            camera,
            controls,
            container: canvasContainer,
            defaultCamera,
            defaultControls,
            activeCameraRef,
          })
        } else {
          fitViewToMesh({ mesh, camera, controls })
        }

        updateParallaxState(mesh)
        spark.update({ scene: sceneObj })
        resizeRef.current?.()

        loadingIndicatorRef?.current?.updateLoadingState({ isVisible: false })
        setIsLoading(false)
        onLoadingChange?.(false)
        onReady?.()
      } catch (err) {
        if (disposed) return
        console.error('[3D][sog] failed to load scene', err)
        loadingIndicatorRef?.current?.updateLoadingState({
          isVisible: true,
          isError: true,
          errorMessage: t('photo.3d.error'),
        })
        const errorMsg = err instanceof Error ? err.message : 'Failed to load 3D scene'
        setError(errorMsg)
        setIsLoading(false)
        onLoadingChange?.(false)
        onError?.(err instanceof Error ? err : new Error(errorMsg))
      }
    }

    load()

    return () => {
      disposed = true
      setIsLoading(false)
      onLoadingChange?.(false)
      loadingIndicatorRef?.current?.updateLoadingState({ isVisible: false })
    }
  }, [isReady, scene, sceneBytes, t, loadingIndicatorRef, onLoadingChange, onError, onReady, updateParallaxState])

  return (
    <div ref={containerRef} className={clsxm('relative h-full w-full overflow-hidden bg-transparent', className)}>
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          ref={canvasContainerRef}
          className="relative"
          style={{
            width: canvasBounds ? `${canvasBounds.width}px` : '100%',
            height: canvasBounds ? `${canvasBounds.height}px` : '100%',
          }}
        />
      </div>
      {error && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-lg bg-black/70 px-3 py-2 text-sm text-white">
            <i className="i-mingcute-warning-line text-red-300" />
            <span>{t('photo.3d.error')}</span>
          </div>
        </div>
      )}
      {!error && !isLoading && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded bg-black/50 px-2 py-1 text-xs text-white opacity-0 duration-200 group-hover:opacity-50">
          {t('photo.3d.hint')}
        </div>
      )}
    </div>
  )
}
