import type { SplatMesh } from '@sparkjsdev/spark'
import type { RefObject } from 'react'
import { useCallback, useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { isMobileDevice } from '~/lib/device-viewport'

type ParallaxState = {
  basePosition: THREE.Vector3
  baseTarget: THREE.Vector3
  baseRight: THREE.Vector3
  baseUp: THREE.Vector3
  strength: number
  current: THREE.Vector2
  target: THREE.Vector2
}

const PARALLAX_DEADZONE_MOUSE = 0.06
const PARALLAX_DEADZONE_MOTION = 0.12
const PARALLAX_STRENGTH_MOBILE_MULTIPLIER = 1.5
const ORIENTATION_RANGE = {
  gamma: 30,
  beta: 30,
}

type UseThreeDSceneParallaxParams = {
  containerRef: RefObject<HTMLElement | null>
  cameraRef: RefObject<THREE.PerspectiveCamera | null>
  controlsRef: RefObject<OrbitControls | null>
}

export const useThreeDSceneParallax = ({ containerRef, cameraRef, controlsRef }: UseThreeDSceneParallaxParams) => {
  const parallaxRef = useRef<ParallaxState | null>(null)
  const orientationZeroRef = useRef<{ beta: number; gamma: number } | null>(null)
  const orientationPermissionRef = useRef<'unknown' | 'granted' | 'denied'>('unknown')
  const tempPositionRef = useRef(new THREE.Vector3())

  const updateParallaxState = useCallback((mesh?: SplatMesh) => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return

    const basePosition = camera.position.clone()
    const baseTarget = controls.target.clone()
    const baseQuaternion = camera.quaternion.clone()
    const baseRight = new THREE.Vector3(1, 0, 0).applyQuaternion(baseQuaternion)
    const baseUp = new THREE.Vector3(0, 1, 0).applyQuaternion(baseQuaternion)

    let radius = basePosition.distanceTo(baseTarget)
    if (mesh?.getBoundingBox) {
      const meshObject = mesh as unknown as THREE.Object3D
      meshObject.updateMatrixWorld(true)
      const box = mesh.getBoundingBox()
      const worldBox = box.clone().applyMatrix4(meshObject.matrixWorld)
      const size = new THREE.Vector3()
      worldBox.getSize(size)
      radius = Math.max(size.length() * 0.5, 0.25)
    }

    const distance = basePosition.distanceTo(baseTarget)
    const baseStrength = Math.max(0.003, Math.min(distance * 0.04, radius * 0.12))
    const strength = baseStrength * (isMobileDevice ? PARALLAX_STRENGTH_MOBILE_MULTIPLIER : 1)

    parallaxRef.current = {
      basePosition,
      baseTarget,
      baseRight,
      baseUp,
      strength,
      current: new THREE.Vector2(0, 0),
      target: new THREE.Vector2(0, 0),
    }
  }, [])

  const applyParallaxInput = useCallback((rawX: number, rawY: number, deadzone: number) => {
    const parallax = parallaxRef.current
    if (!parallax) return
    const clampValue = (value: number) => THREE.MathUtils.clamp(value, -1, 1)
    const applyDeadzone = (value: number) => {
      const abs = Math.abs(value)
      if (abs <= deadzone) return 0
      const scaled = (abs - deadzone) / Math.max(1 - deadzone, 1e-6)
      return Math.sign(value) * scaled
    }
    const x = applyDeadzone(clampValue(rawX))
    const y = applyDeadzone(clampValue(rawY))
    parallax.target.set(x, y)
  }, [])

  const resetParallaxTarget = useCallback(() => {
    parallaxRef.current?.target.set(0, 0)
  }, [])

  useEffect(() => {
    if (isMobileDevice) return
    const container = containerRef.current
    if (!container) return

    const handleMove = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const x = (event.clientX - rect.left) / rect.width
      const y = (event.clientY - rect.top) / rect.height
      const nx = (x - 0.5) * 2
      const ny = (0.5 - y) * 2
      applyParallaxInput(nx, ny, PARALLAX_DEADZONE_MOUSE)
    }

    const handleLeave = () => {
      resetParallaxTarget()
    }

    container.addEventListener('mousemove', handleMove)
    container.addEventListener('mouseleave', handleLeave)

    return () => {
      container.removeEventListener('mousemove', handleMove)
      container.removeEventListener('mouseleave', handleLeave)
    }
  }, [applyParallaxInput, containerRef, resetParallaxTarget])

  useEffect(() => {
    if (!isMobileDevice) return
    if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return
    const container = containerRef.current
    if (!container) return

    let subscribed = false
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta == null || event.gamma == null) return
      if (!orientationZeroRef.current) {
        orientationZeroRef.current = { beta: event.beta, gamma: event.gamma }
      }
      const base = orientationZeroRef.current
      const gamma = event.gamma - base.gamma
      const beta = event.beta - base.beta
      const nx = THREE.MathUtils.clamp(gamma / ORIENTATION_RANGE.gamma, -1, 1)
      const ny = THREE.MathUtils.clamp(-beta / ORIENTATION_RANGE.beta, -1, 1)
      applyParallaxInput(nx, ny, PARALLAX_DEADZONE_MOTION)
    }

    const subscribe = () => {
      if (subscribed) return
      window.addEventListener('deviceorientation', handleOrientation, true)
      subscribed = true
    }

    const unsubscribe = () => {
      if (!subscribed) return
      window.removeEventListener('deviceorientation', handleOrientation, true)
      subscribed = false
    }

    const { requestPermission } = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>
    }

    const enableOrientation = async () => {
      if (orientationPermissionRef.current === 'granted') return
      if (typeof requestPermission !== 'function') {
        orientationPermissionRef.current = 'granted'
        subscribe()
        return
      }
      try {
        const result = await requestPermission()
        orientationPermissionRef.current = result === 'granted' ? 'granted' : 'denied'
        if (result === 'granted') {
          orientationZeroRef.current = null
          subscribe()
        }
      } catch {
        orientationPermissionRef.current = 'denied'
      }
    }

    if (typeof requestPermission !== 'function') {
      orientationPermissionRef.current = 'granted'
      subscribe()
    }

    const handlePointerDown = () => {
      void enableOrientation()
    }
    container.addEventListener('pointerdown', handlePointerDown)

    return () => {
      container.removeEventListener('pointerdown', handlePointerDown)
      unsubscribe()
      orientationZeroRef.current = null
      resetParallaxTarget()
    }
  }, [applyParallaxInput, containerRef, resetParallaxTarget])

  const applyParallaxFrame = useCallback(() => {
    const parallax = parallaxRef.current
    const camera = cameraRef.current
    if (!parallax || !camera) return
    parallax.current.lerp(parallax.target, 0.08)
    const tempPosition = tempPositionRef.current
    tempPosition.copy(parallax.basePosition)
    tempPosition.addScaledVector(parallax.baseRight, parallax.current.x * parallax.strength)
    tempPosition.addScaledVector(parallax.baseUp, parallax.current.y * parallax.strength)
    camera.position.copy(tempPosition)
    camera.lookAt(parallax.baseTarget)
  }, [])

  return {
    updateParallaxState,
    applyParallaxFrame,
  }
}
