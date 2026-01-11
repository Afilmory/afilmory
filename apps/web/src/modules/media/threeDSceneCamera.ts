import type { SplatMesh } from '@sparkjsdev/spark'
import type { MutableRefObject } from 'react'
import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import type { CameraMetadata } from './threeDSceneMetadata'

export type ActiveCameraState = CameraMetadata & {
  near: number
  far: number
}

export type DefaultCameraState = {
  fov: number
  near: number
  far: number
}

export type DefaultControlsState = {
  dampingFactor: number
  rotateSpeed: number
  zoomSpeed: number
  panSpeed: number
}

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
    const { z } = center
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

export const applyCameraProjection = ({
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

export const clearMetadataCamera = ({
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

export const applyMetadataCamera = ({
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

  let { near } = defaultCamera
  let { far } = defaultCamera

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

export const fitViewToMesh = ({
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
