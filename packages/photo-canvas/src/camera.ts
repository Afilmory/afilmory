import type { Point, Rect, Size } from './types'

export interface CameraState {
  x: number
  y: number
  scale: number
}

export interface ScaleLimits {
  min: number
  max: number
}

const SETTLE_FACTOR = 6.64
const FRAME_MS = 16.7
const FRICTION_PER_FRAME = 0.95

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const screenToWorld = (camera: CameraState, viewport: Size, point: Point): Point => ({
  x: camera.x + (point.x - viewport.width / 2) / camera.scale,
  y: camera.y + (point.y - viewport.height / 2) / camera.scale,
})

export const worldToScreen = (camera: CameraState, viewport: Size, point: Point): Point => ({
  x: (point.x - camera.x) * camera.scale + viewport.width / 2,
  y: (point.y - camera.y) * camera.scale + viewport.height / 2,
})

export const worldRectToScreen = (camera: CameraState, viewport: Size, rect: Rect): Rect => {
  const origin = worldToScreen(camera, viewport, rect)
  return { x: origin.x, y: origin.y, w: rect.w * camera.scale, h: rect.h * camera.scale }
}

export const visibleWorldRect = (camera: CameraState, viewport: Size, marginPx = 0): Rect => {
  const w = (viewport.width + marginPx * 2) / camera.scale
  const h = (viewport.height + marginPx * 2) / camera.scale
  return { x: camera.x - w / 2, y: camera.y - h / 2, w, h }
}

export const zoomAt = (
  camera: CameraState,
  viewport: Size,
  screenPoint: Point,
  factor: number,
  limits: ScaleLimits,
): CameraState => {
  const anchor = screenToWorld(camera, viewport, screenPoint)
  const scale = clamp(camera.scale * factor, limits.min, limits.max)
  return {
    x: anchor.x - (screenPoint.x - viewport.width / 2) / scale,
    y: anchor.y - (screenPoint.y - viewport.height / 2) / scale,
    scale,
  }
}

export const clampToBounds = (camera: CameraState, bounds: Rect): CameraState => ({
  x: clamp(camera.x, bounds.x, bounds.x + bounds.w),
  y: clamp(camera.y, bounds.y, bounds.y + bounds.h),
  scale: camera.scale,
})

export const fitRect = (rect: Rect, viewport: Size, paddingPx: number): CameraState => {
  const availableWidth = Math.max(1, viewport.width - paddingPx * 2)
  const availableHeight = Math.max(1, viewport.height - paddingPx * 2)
  return {
    x: rect.x + rect.w / 2,
    y: rect.y + rect.h / 2,
    scale: Math.min(availableWidth / Math.max(1, rect.w), availableHeight / Math.max(1, rect.h)),
  }
}

export const decayVelocity = (velocity: number, dtMs: number) => velocity * FRICTION_PER_FRAME ** (dtMs / FRAME_MS)

export const springToward = (value: number, target: number, velocity: number, dtMs: number, durationMs: number) => {
  const omega = SETTLE_FACTOR / (durationMs / 1000)
  const dt = dtMs / 1000
  const offset = value - target
  const decay = Math.exp(-omega * dt)
  const drift = velocity + omega * offset
  return {
    value: target + (offset + drift * dt) * decay,
    velocity: (velocity - drift * omega * dt) * decay,
  }
}

export const containsPoint = (rect: Rect, point: Point) =>
  point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h

export interface Flight {
  target: CameraState
  velocity: CameraState
}

export const stepFlight = (camera: CameraState, flight: Flight, dtMs: number, durationMs: number) => {
  const x = springToward(camera.x, flight.target.x, flight.velocity.x, dtMs, durationMs)
  const y = springToward(camera.y, flight.target.y, flight.velocity.y, dtMs, durationMs)
  const scale = springToward(
    Math.log(camera.scale),
    Math.log(flight.target.scale),
    flight.velocity.scale,
    dtMs,
    durationMs,
  )
  flight.velocity = { x: x.velocity, y: y.velocity, scale: scale.velocity }
  const next = { x: x.value, y: y.value, scale: Math.exp(scale.value) }
  const remaining = Math.hypot(flight.target.x - next.x, flight.target.y - next.y) * next.scale
  const done = remaining < 0.5 && Math.abs(flight.target.scale / next.scale - 1) < 0.001
  return { camera: done ? flight.target : next, done }
}

export const nearestOnScreen = (rects: Rect[], viewport: Size, anchor: Point): Rect | null => {
  let best: Rect | null = null
  let bestDistance = Infinity
  for (const rect of rects) {
    const onScreen = rect.x < viewport.width && rect.x + rect.w > 0 && rect.y < viewport.height && rect.y + rect.h > 0
    const distance = Math.hypot(rect.x + rect.w / 2 - anchor.x, rect.y + rect.h / 2 - anchor.y)
    if (onScreen && distance < bestDistance) {
      best = rect
      bestDistance = distance
    }
  }
  return best
}
