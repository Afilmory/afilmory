import type { Point } from './types'

export type InputAction
  = | { type: 'pan', dx: number, dy: number }
    | { type: 'zoom', factor: number }
    | { type: 'step', direction: 1 | -1 }
    | { type: 'reset' }

export interface WheelInput {
  deltaX: number
  deltaY: number
  deltaMode: number
  ctrlKey: boolean
  metaKey: boolean
}

const LINE_HEIGHT_PX = 16
const ZOOM_SENSITIVITY = 0.012
const MAX_ZOOM_DELTA = 50
const KEY_PAN_PX = 120

export const wheelAction = (input: WheelInput): InputAction => {
  const unit = input.deltaMode === 1 ? LINE_HEIGHT_PX : 1
  const deltaX = input.deltaX * unit
  const deltaY = input.deltaY * unit
  if (input.ctrlKey || input.metaKey) {
    const bounded = Math.max(-MAX_ZOOM_DELTA, Math.min(MAX_ZOOM_DELTA, deltaY))
    return { type: 'zoom', factor: Math.exp(-bounded * ZOOM_SENSITIVITY) }
  }
  return { type: 'pan', dx: 0 - deltaX, dy: 0 - deltaY }
}

export const keyAction = (key: string): InputAction | null => {
  switch (key) {
    case 'ArrowRight': {
      return { type: 'pan', dx: -KEY_PAN_PX, dy: 0 }
    }
    case 'ArrowLeft': {
      return { type: 'pan', dx: KEY_PAN_PX, dy: 0 }
    }
    case 'ArrowDown': {
      return { type: 'pan', dx: 0, dy: -KEY_PAN_PX }
    }
    case 'ArrowUp': {
      return { type: 'pan', dx: 0, dy: KEY_PAN_PX }
    }
    case '+':
    case '=': {
      return { type: 'step', direction: 1 }
    }
    case '-': {
      return { type: 'step', direction: -1 }
    }
    case '0': {
      return { type: 'reset' }
    }
    default: {
      return null
    }
  }
}

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

export const pinchStep = (previous: [Point, Point], next: [Point, Point]) => {
  const before = midpoint(previous[0], previous[1])
  const center = midpoint(next[0], next[1])
  return {
    factor: distance(next[0], next[1]) / Math.max(1, distance(previous[0], previous[1])),
    center,
    dx: center.x - before.x,
    dy: center.y - before.y,
  }
}
