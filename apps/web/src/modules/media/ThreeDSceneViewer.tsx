import { clsxm } from '@afilmory/utils'
import { SparkRenderer, SplatFileType, SplatMesh } from '@sparkjsdev/spark'
import type {MutableRefObject} from 'react';
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import type { LoadingIndicatorRef } from '~/modules/inspector'
import type { PhotoManifest } from '~/types/photo'

type ThreeDSceneSource = NonNullable<PhotoManifest['threeDScene']>

type CameraIntrinsics = {
  fx: number
  fy: number
  cx: number
  cy: number
  imageWidth: number
  imageHeight: number
}

type CameraMetadata = {
  intrinsics: CameraIntrinsics
  extrinsicCv: number[]
  colorSpaceIndex?: number
  headerComments?: string[]
}

type ActiveCameraState = CameraMetadata & {
  near: number
  far: number
}

type DefaultCameraState = {
  fov: number
  near: number
  far: number
}

type DefaultControlsState = {
  dampingFactor: number
  rotateSpeed: number
  zoomSpeed: number
  panSpeed: number
}

// --- Metadata helpers (ported from ../browser-sharp) ---

const toExtrinsic4x4RowMajor = (raw?: number[] | Float32Array | null): number[] => {
  if (!raw) {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  }

  const values = Array.from(raw)

  if (values.length === 16) return values

  if (values.length === 12) {
    const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

    m[0] = values[0]
    m[1] = values[1]
    m[2] = values[2]
    m[3] = values[3]

    m[4] = values[4]
    m[5] = values[5]
    m[6] = values[6]
    m[7] = values[7]

    m[8] = values[8]
    m[9] = values[9]
    m[10] = values[10]
    m[11] = values[11]

    const r00 = m[0]
    const r01 = m[1]
    const r02 = m[2]
    const r10 = m[4]
    const r11 = m[5]
    const r12 = m[6]
    const r20 = m[8]
    const r21 = m[9]
    const r22 = m[10]

    m[0] = r00
    m[1] = r10
    m[2] = r20
    m[4] = r01
    m[5] = r11
    m[6] = r21
    m[8] = r02
    m[9] = r12
    m[10] = r22

    return m
  }

  throw new Error(`Unrecognized extrinsic element length: ${values.length}`)
}

const parseIntrinsics = (raw: number[] | Float32Array | undefined, imageWidth?: number, imageHeight?: number) => {
  if (!raw) return null
  const values = Array.from(raw)

  if (values.length === 9) {
    if (!(typeof imageWidth === 'number' && Number.isFinite(imageWidth))) return null
    if (!(typeof imageHeight === 'number' && Number.isFinite(imageHeight))) return null
    const width = imageWidth
    const height = imageHeight
    return {
      fx: values[0],
      fy: values[4],
      cx: values[2],
      cy: values[5],
      imageWidth: width,
      imageHeight: height,
    }
  }

  if (values.length === 16) {
    if (!(typeof imageWidth === 'number' && Number.isFinite(imageWidth))) return null
    if (!(typeof imageHeight === 'number' && Number.isFinite(imageHeight))) return null
    const width = imageWidth
    const height = imageHeight
    return {
      fx: values[0],
      fy: values[5],
      cx: values[2],
      cy: values[6],
      imageWidth: width,
      imageHeight: height,
    }
  }

  if (values.length === 4) {
    const legacyWidth = Number.parseInt(`${values[2]}`)
    const legacyHeight = Number.parseInt(`${values[3]}`)
    const width = typeof imageWidth === 'number' && Number.isFinite(imageWidth) ? imageWidth : legacyWidth
    const height = typeof imageHeight === 'number' && Number.isFinite(imageHeight) ? imageHeight : legacyHeight
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null
    return {
      fx: values[0],
      fy: values[1],
      cx: (width - 1) * 0.5,
      cy: (height - 1) * 0.5,
      imageWidth: width,
      imageHeight: height,
    }
  }

  return null
}

const normalizeColorSpaceIndex = (value: unknown) => {
  if (Array.isArray(value)) {
    return Number.isFinite(value[0]) ? Number(value[0]) : undefined
  }
  return Number.isFinite(value as number) ? Number(value) : undefined
}

const buildCameraMetadata = (raw: Record<string, any> = {}): CameraMetadata | null => {
  const imageSize = raw.image_size
  const imageWidth = Array.isArray(imageSize) ? imageSize[0] : undefined
  const imageHeight = Array.isArray(imageSize) ? imageSize[1] : undefined
  const intrinsics = parseIntrinsics(raw.intrinsic, imageWidth, imageHeight)
  if (!intrinsics) return null

  return {
    intrinsics,
    extrinsicCv: toExtrinsic4x4RowMajor(raw.extrinsic),
    colorSpaceIndex: normalizeColorSpaceIndex(raw.color_space),
    headerComments: raw.headerComments ?? [],
  }
}

// --- SOG metadata reader (ported from ../browser-sharp) ---

const ZIP_LOCAL_FILE_HEADER = 0x04034b50
const ZIP_CENTRAL_DIR_HEADER = 0x02014b50
const ZIP_END_OF_CENTRAL_DIR = 0x06054b50
const ZIP_END_OF_CENTRAL_DIR_MIN_SIZE = 22
const ZIP_MAX_COMMENT_SIZE = 0xffff

const textDecoder = new TextDecoder('utf-8')

const findZipEndOfCentralDir = (view: DataView, length: number) => {
  const start = Math.max(0, length - (ZIP_END_OF_CENTRAL_DIR_MIN_SIZE + ZIP_MAX_COMMENT_SIZE))
  for (let offset = length - ZIP_END_OF_CENTRAL_DIR_MIN_SIZE; offset >= start; offset -= 1) {
    if (view.getUint32(offset, true) === ZIP_END_OF_CENTRAL_DIR) return offset
  }
  return -1
}

const findZipEntry = (bytes: Uint8Array, targetName: string) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const length = bytes.byteLength
  const eocdOffset = findZipEndOfCentralDir(view, length)
  if (eocdOffset < 0) return null

  const centralDirSize = view.getUint32(eocdOffset + 12, true)
  const centralDirOffset = view.getUint32(eocdOffset + 16, true)
  const centralDirEnd = centralDirOffset + centralDirSize
  if (centralDirEnd > length) return null

  let offset = centralDirOffset
  while (offset + 46 <= centralDirEnd) {
    if (view.getUint32(offset, true) !== ZIP_CENTRAL_DIR_HEADER) break

    const compression = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localHeaderOffset = view.getUint32(offset + 42, true)

    const nameStart = offset + 46
    const nameEnd = nameStart + nameLength
    const name = textDecoder.decode(bytes.subarray(nameStart, nameEnd))
    const entryName = name.split(/[\\/]/).pop()?.toLowerCase()

    if (entryName === targetName) {
      return {
        compression,
        compressedSize,
        localHeaderOffset,
      }
    }

    offset = nameEnd + extraLength + commentLength
  }

  return null
}

const inflateRaw = async (data: Uint8Array) => {
  if (typeof DecompressionStream === 'undefined') {
    throw new TypeError('DecompressionStream is not available in this browser')
  }
  const slice = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  const stream = new Blob([slice]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const buffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(buffer)
}

const readZipEntryData = async (
  bytes: Uint8Array,
  entry: { compression: number; compressedSize: number; localHeaderOffset: number },
) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const headerOffset = entry.localHeaderOffset
  if (headerOffset + 30 > bytes.byteLength) return null
  if (view.getUint32(headerOffset, true) !== ZIP_LOCAL_FILE_HEADER) return null

  const nameLength = view.getUint16(headerOffset + 26, true)
  const extraLength = view.getUint16(headerOffset + 28, true)
  const dataStart = headerOffset + 30 + nameLength + extraLength
  const dataEnd = dataStart + entry.compressedSize
  if (dataEnd > bytes.byteLength) return null

  const compressed = bytes.subarray(dataStart, dataEnd)
  if (entry.compression === 0) return compressed
  if (entry.compression === 8) return inflateRaw(compressed)

  throw new Error(`Unsupported zip compression method: ${entry.compression}`)
}

const readSogMetaJson = async (bytes: Uint8Array) => {
  const entry = findZipEntry(bytes, 'meta.json')
  if (!entry) return null
  const data = await readZipEntryData(bytes, entry)
  if (!data) return null
  return JSON.parse(textDecoder.decode(data))
}

const readSogMetadata = async (bytes: Uint8Array) => {
  const meta = await readSogMetaJson(bytes)
  if (!meta || typeof meta !== 'object') return null
  const sharpMetadata = meta.sharp_metadata
  if (!sharpMetadata || typeof sharpMetadata !== 'object') return null
  return buildCameraMetadata(sharpMetadata)
}

// --- Camera + view helpers (ported from ../browser-sharp) ---

const makeAxisFlipCvToGl = () => new THREE.Matrix4().set(1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1)

const quantileSorted = (sorted: number[], q: number) => {
  if (sorted.length === 0) return null
  const clampedQ = Math.max(0, Math.min(1, q))
  const pos = (sorted.length - 1) * clampedQ
  const lower = Math.floor(pos)
  const upper = Math.ceil(pos)
  if (lower === upper) return sorted[lower]
  const weight = pos - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

const computeMlSharpDepthFocus = (mesh: SplatMesh, { qFocus = 0.1, minDepthFocus = 2, maxSamples = 50_000 } = {}) => {
  const numSplats = mesh?.packedSplats?.numSplats ?? 0
  if (!numSplats) return minDepthFocus

  const step = Math.max(1, Math.floor(numSplats / maxSamples))
  const depths: number[] = []
  for (let i = 0; i < numSplats; i += step) {
    const { center } = mesh.packedSplats.getSplat(i)
    const {z} = center
    if (Number.isFinite(z) && z > 0) depths.push(z)
  }

  if (depths.length === 0) return minDepthFocus
  depths.sort((a, b) => a - b)
  const q = quantileSorted(depths, qFocus)
  if (!Number.isFinite(q)) return minDepthFocus
  return Math.max(minDepthFocus, q!)
}

const makeProjectionFromIntrinsics = ({
  fx,
  fy,
  cx,
  cy,
  width,
  height,
  near,
  far,
}: {
  fx: number
  fy: number
  cx: number
  cy: number
  width: number
  height: number
  near: number
  far: number
}) => {
  const left = (-cx * near) / fx
  const right = ((width - cx) * near) / fx
  const top = (cy * near) / fy
  const bottom = (-(height - cy) * near) / fy

  return new THREE.Matrix4().set(
    (2 * near) / (right - left),
    0,
    (right + left) / (right - left),
    0,
    0,
    (2 * near) / (top - bottom),
    (top + bottom) / (top - bottom),
    0,
    0,
    0,
    -(far + near) / (far - near),
    (-2 * far * near) / (far - near),
    0,
    0,
    -1,
    0,
  )
}

const applyCameraProjection = ({
  cameraMetadata,
  camera,
  controls,
  viewportWidth,
  viewportHeight,
  defaultCamera,
  defaultControls,
}: {
  cameraMetadata: ActiveCameraState
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  viewportWidth: number
  viewportHeight: number
  defaultCamera: DefaultCameraState
  defaultControls: DefaultControlsState
}) => {
  const { intrinsics, near, far } = cameraMetadata
  const sx = viewportWidth / intrinsics.imageWidth
  const sy = viewportHeight / intrinsics.imageHeight
  const s = Math.min(sx, sy)
  const scaledWidth = intrinsics.imageWidth * s
  const scaledHeight = intrinsics.imageHeight * s
  const offsetX = (viewportWidth - scaledWidth) * 0.5
  const offsetY = (viewportHeight - scaledHeight) * 0.5

  const fx = intrinsics.fx * s
  const fy = intrinsics.fy * s
  const cx = intrinsics.cx * s + offsetX
  const cy = intrinsics.cy * s + offsetY

  camera.aspect = viewportWidth / Math.max(1, viewportHeight)
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(viewportHeight / (2 * Math.max(1e-6, fy))))
  camera.near = near
  camera.far = far

  const fovScale = THREE.MathUtils.clamp(camera.fov / defaultCamera.fov, 0.05, 2)
  controls.rotateSpeed = Math.max(0.02, defaultControls.rotateSpeed * fovScale * 0.45)
  controls.zoomSpeed = Math.max(0.05, defaultControls.zoomSpeed * fovScale * 0.8)
  controls.panSpeed = Math.max(0.05, defaultControls.panSpeed * fovScale * 0.8)

  const projection = makeProjectionFromIntrinsics({
    fx,
    fy,
    cx,
    cy,
    width: viewportWidth,
    height: viewportHeight,
    near,
    far,
  })
  camera.projectionMatrix.copy(projection)
  camera.projectionMatrixInverse.copy(projection).invert()
}

const clearMetadataCamera = ({
  camera,
  controls,
  defaultCamera,
  defaultControls,
  activeCameraRef,
}: {
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  defaultCamera: DefaultCameraState
  defaultControls: DefaultControlsState
  activeCameraRef: MutableRefObject<ActiveCameraState | null>
}) => {
  activeCameraRef.current = null
  controls.enabled = true
  controls.dampingFactor = defaultControls.dampingFactor
  controls.rotateSpeed = defaultControls.rotateSpeed
  controls.zoomSpeed = defaultControls.zoomSpeed
  controls.panSpeed = defaultControls.panSpeed
  camera.fov = defaultCamera.fov
  camera.near = defaultCamera.near
  camera.far = defaultCamera.far
  camera.updateProjectionMatrix()
}

const applyMetadataCamera = ({
  mesh,
  cameraMetadata,
  camera,
  controls,
  container,
  defaultCamera,
  defaultControls,
  activeCameraRef,
}: {
  mesh: SplatMesh
  cameraMetadata: CameraMetadata
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  container: HTMLElement
  defaultCamera: DefaultCameraState
  defaultControls: DefaultControlsState
  activeCameraRef: MutableRefObject<ActiveCameraState | null>
}) => {
  const meshObject = mesh as unknown as THREE.Object3D & { userData: Record<string, unknown> }
  const cvToThree = makeAxisFlipCvToGl()
  if (!meshObject.userData.__cvToThreeApplied) {
    meshObject.applyMatrix4(cvToThree)
    meshObject.userData.__cvToThreeApplied = true
  }
  meshObject.updateMatrixWorld(true)

  const e = cameraMetadata.extrinsicCv
  const extrinsicCv = new THREE.Matrix4().set(
    e[0],
    e[1],
    e[2],
    e[3],
    e[4],
    e[5],
    e[6],
    e[7],
    e[8],
    e[9],
    e[10],
    e[11],
    e[12],
    e[13],
    e[14],
    e[15],
  )

  const view = new THREE.Matrix4().multiplyMatrices(cvToThree, extrinsicCv).multiply(cvToThree)
  const cameraWorld = new THREE.Matrix4().copy(view).invert()

  camera.matrixAutoUpdate = true
  camera.matrixWorld.copy(cameraWorld)
  camera.matrixWorld.decompose(camera.position, camera.quaternion, camera.scale)
  camera.updateMatrix()
  camera.updateMatrixWorld(true)

  let {near} = defaultCamera
  let {far} = defaultCamera

  if (mesh?.getBoundingBox) {
    const box = mesh.getBoundingBox()
    const worldBox = box.clone().applyMatrix4(meshObject.matrixWorld)
    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    worldBox.getSize(size)
    worldBox.getCenter(center)
    const radius = Math.max(size.length() * 0.5, 0.25)

    const camPos = camera.position.clone()
    const dist = camPos.distanceTo(center)

    near = Math.max(0.01, dist - radius * 2)
    far = Math.max(near + 1, dist + radius * 6)

    const depthFocusCv = computeMlSharpDepthFocus(mesh)
    const lookAtCv = new THREE.Vector3(0, 0, depthFocusCv)
    const lookAtThree = lookAtCv.applyMatrix4(meshObject.matrixWorld)
    controls.target.copy(lookAtThree)
  }

  activeCameraRef.current = { ...cameraMetadata, near, far }

  applyCameraProjection({
    cameraMetadata: activeCameraRef.current,
    camera,
    controls,
    viewportWidth: container.clientWidth || 1,
    viewportHeight: container.clientHeight || 1,
    defaultCamera,
    defaultControls,
  })

  controls.enabled = true
  controls.update()
}

const fitViewToMesh = ({
  mesh,
  camera,
  controls,
}: {
  mesh: SplatMesh
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
}) => {
  if (!mesh.getBoundingBox) return
  const box = mesh.getBoundingBox()
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)

  const radius = Math.max(size.length() * 0.5, 0.5)
  const dist = radius / Math.tan((camera.fov * Math.PI) / 360)

  camera.position.copy(center).add(new THREE.Vector3(dist, dist, dist))
  camera.near = Math.max(0.01, radius * 0.01)
  camera.far = Math.max(dist * 4, radius * 8)
  camera.updateProjectionMatrix()

  controls.target.copy(center)
  controls.update()
}

// --- Viewer component ---

interface ThreeDSceneViewerProps {
  scene: ThreeDSceneSource
  className?: string
  loadingIndicatorRef?: React.RefObject<LoadingIndicatorRef | null>
  onLoadingChange?: (isLoading: boolean) => void
  onError?: (error: Error) => void
  onReady?: () => void
}

export const ThreeDSceneViewer = ({
  scene,
  className,
  loadingIndicatorRef,
  onLoadingChange,
  onError,
  onReady,
}: ThreeDSceneViewerProps) => {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const sparkRef = useRef<SparkRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const meshRef = useRef<SplatMesh | null>(null)
  const frameRef = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const defaultCameraRef = useRef<DefaultCameraState | null>(null)
  const defaultControlsRef = useRef<DefaultControlsState | null>(null)
  const activeCameraRef = useRef<ActiveCameraState | null>(null)
  const resizeRef = useRef<(() => void) | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  const [isReady, setIsReady] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize Three + Spark renderer once
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'
    container.append(renderer.domElement)

    const sceneObj = new THREE.Scene()
    sceneObj.background = new THREE.Color('#0c1018')

    const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 500)
    camera.position.set(0.5, 0.5, 2.5)
    const defaultCamera: DefaultCameraState = {
      fov: camera.fov,
      near: camera.near,
      far: camera.far,
    }

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.rotateSpeed = 0.75
    controls.zoomSpeed = 0.6
    controls.panSpeed = 0.6
    controls.target.set(0, 0, 0)
    const defaultControls: DefaultControlsState = {
      dampingFactor: controls.dampingFactor,
      rotateSpeed: controls.rotateSpeed,
      zoomSpeed: controls.zoomSpeed,
      panSpeed: controls.panSpeed,
    }

    const spark = new SparkRenderer({ renderer })
    sceneObj.add(spark)

    const grid = new THREE.GridHelper(2.5, 10, 0x2a2f3a, 0x151822)
    grid.position.y = -0.5
    sceneObj.add(grid)

    rendererRef.current = renderer
    sceneRef.current = sceneObj
    cameraRef.current = camera
    sparkRef.current = spark
    controlsRef.current = controls
    defaultCameraRef.current = defaultCamera
    defaultControlsRef.current = defaultControls

    const resize = () => {
      if (!container || !renderer || !camera) return
      const { clientWidth, clientHeight } = container
      renderer.setSize(clientWidth, clientHeight, false)
      if (activeCameraRef.current && defaultCameraRef.current && defaultControlsRef.current) {
        applyCameraProjection({
          cameraMetadata: activeCameraRef.current,
          camera,
          controls,
          viewportWidth: clientWidth || 1,
          viewportHeight: clientHeight || 1,
          defaultCamera: defaultCameraRef.current,
          defaultControls: defaultControlsRef.current,
        })
      } else {
        camera.aspect = clientWidth / Math.max(1, clientHeight)
        camera.updateProjectionMatrix()
      }
    }

    window.addEventListener('resize', resize)
    resize()
    resizeRef.current = resize
    let resizeObserver: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => resize())
      resizeObserver.observe(container)
      resizeObserverRef.current = resizeObserver
    }

    const animate = () => {
      controls.update()
      renderer.render(sceneObj, camera)
      frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)

    setIsReady(true)

    return () => {
      abortRef.current?.abort()
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      window.removeEventListener('resize', resize)
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
      if (renderer.domElement.parentElement === container) {
        renderer.domElement.remove()
      }
    }
  }, [])

  // Load SOG scene whenever mode toggles on the same url
  useEffect(() => {
    if (!isReady) return
    if (!scene || scene.mode !== 'sog') return
    const container = containerRef.current
    const renderer = rendererRef.current
    const sceneObj = sceneRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    const spark = sparkRef.current
    const defaultCamera = defaultCameraRef.current
    const defaultControls = defaultControlsRef.current

    if (!container || !renderer || !sceneObj || !camera || !controls || !spark || !defaultCamera || !defaultControls) {
      return
    }

    let disposed = false
    setError(null)
    setIsLoading(true)
    onLoadingChange?.(true)
    loadingIndicatorRef?.current?.updateLoadingState({
      isVisible: true,
      isWebGLLoading: true,
      webglMessage: t('photo.3d.loading'),
      webglQuality: 'unknown',
    })

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const removeCurrentMesh = () => {
      if (meshRef.current) {
        sceneObj.remove(meshRef.current)
        meshRef.current.dispose()
        meshRef.current = null
      }
    }

    const load = async () => {
      let finished = false
      try {
        const response = await fetch(scene.url, { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const buffer = await response.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        const cameraMetadata = await readSogMetadata(bytes)

        const mesh = new SplatMesh({
          fileBytes: bytes,
          fileType: SplatFileType.PCSOGSZIP,
          fileName: scene.s3Key ?? scene.url,
        })
        await mesh.initialized
        if (controller.signal.aborted || disposed) {
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
            container,
            defaultCamera,
            defaultControls,
            activeCameraRef,
          })
        } else {
          fitViewToMesh({ mesh, camera, controls })
        }

        spark.update({ scene: sceneObj })
        resizeRef.current?.()

        loadingIndicatorRef?.current?.updateLoadingState({ isVisible: false })
        onReady?.()
        finished = true
      } catch (err) {
        if (controller.signal.aborted || disposed) return
        console.error('[3D][sog] failed to load scene', err)
        loadingIndicatorRef?.current?.updateLoadingState({
          isVisible: true,
          isError: true,
          errorMessage: t('photo.3d.error'),
        })
        const errorMsg = err instanceof Error ? err.message : 'Failed to load 3D scene'
        setError(errorMsg)
        onError?.(err instanceof Error ? err : new Error(errorMsg))
      } finally {
        if (!controller.signal.aborted && !disposed && !finished) {
          setIsLoading(false)
          onLoadingChange?.(false)
        }
      }
    }

    load()

    return () => {
      disposed = true
      controller.abort()
    }
  }, [isReady, scene, t, loadingIndicatorRef, onLoadingChange, onError, onReady])

  return (
    <div ref={containerRef} className={clsxm('relative h-full w-full overflow-hidden bg-[#0c1018]', className)}>
      {isLoading && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-lg bg-black/60 px-3 py-2 text-sm text-white">
            <i className="i-mingcute-loading-3-line animate-spin" />
            <span>{t('photo.3d.loading')}</span>
          </div>
        </div>
      )}
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
