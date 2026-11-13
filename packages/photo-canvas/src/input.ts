import type { InputAction } from './input-actions'
import { isTap, keyAction, pinchStep, wheelAction } from './input-actions'
import type { Point } from './types'

export interface InputHandlers {
  panBy: (dx: number, dy: number) => void
  release: (vx: number, vy: number) => void
  zoomAt: (point: Point, factor: number) => void
  step: (direction: 1 | -1) => void
  reset: () => void
  click: (point: Point) => void
  doubleClick: (point: Point) => void
  hover: (point: Point | null) => void
  hold: (point: Point) => boolean
  holdEnd: () => void
  dismiss: () => void
}

const FLING_WINDOW_MS = 80
const HOLD_MS = 250

interface SafariGestureEvent extends Event {
  scale: number
  clientX: number
  clientY: number
}

export const attachInput = (canvas: HTMLCanvasElement, handlers: InputHandlers) => {
  const pointers = new Map<number, Point>()
  let moved = 0
  let downAt: Point = { x: 0, y: 0 }
  let wasPinch = false
  let lastMoveAt = 0
  let velocity: Point = { x: 0, y: 0 }
  let gestureScale = 1
  let holdTimer: ReturnType<typeof setTimeout> | undefined
  let holding = false

  const local = (event: { clientX: number, clientY: number }): Point => {
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const apply = (action: InputAction | null, point: Point) => {
    if (!action) {
      return false
    }
    if (action.type === 'pan') {
      handlers.panBy(action.dx, action.dy)
    }
    else if (action.type === 'zoom') {
      handlers.zoomAt(point, action.factor)
    }
    else if (action.type === 'step') {
      handlers.step(action.direction)
    }
    else {
      handlers.reset()
    }
    return true
  }

  const endHold = () => {
    if (holding) {
      holding = false
      handlers.holdEnd()
    }
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }
    canvas.setPointerCapture(event.pointerId)
    pointers.set(event.pointerId, local(event))
    if (pointers.size === 1) {
      moved = 0
      downAt = local(event)
      wasPinch = false
      velocity = { x: 0, y: 0 }
      handlers.release(0, 0)
      handlers.panBy(0, 0)
      const { pointerType } = event
      holdTimer = setTimeout(() => {
        if (pointers.size === 1 && isTap(moved, pointerType)) {
          holding = handlers.hold(downAt)
        }
      }, HOLD_MS)
    }
    else {
      wasPinch = true
      clearTimeout(holdTimer)
      endHold()
    }
    canvas.style.cursor = 'grabbing'
  }

  const onPointerMove = (event: PointerEvent) => {
    const point = local(event)
    const previous = pointers.get(event.pointerId)
    if (!previous) {
      if (event.pointerType === 'mouse') {
        handlers.hover(point)
      }
      return
    }
    if (holding) {
      pointers.set(event.pointerId, point)
      return
    }
    if (pointers.size === 1) {
      const dx = point.x - previous.x
      const dy = point.y - previous.y
      const now = performance.now()
      const dt = Math.max(1, now - lastMoveAt)
      velocity = { x: dx / dt, y: dy / dt }
      lastMoveAt = now
      moved = Math.max(moved, Math.hypot(point.x - downAt.x, point.y - downAt.y))
      handlers.panBy(dx, dy)
      pointers.set(event.pointerId, point)
      return
    }
    if (pointers.size === 2) {
      const [otherId] = [...pointers.keys()].filter(id => id !== event.pointerId)
      const other = pointers.get(otherId)!
      const step = pinchStep([previous, other], [point, other])
      handlers.panBy(step.dx, step.dy)
      handlers.zoomAt(step.center, step.factor)
    }
    pointers.set(event.pointerId, point)
  }

  const onPointerEnd = (event: PointerEvent) => {
    if (!pointers.delete(event.pointerId)) {
      return
    }
    if (pointers.size > 0) {
      return
    }
    canvas.style.cursor = ''
    clearTimeout(holdTimer)
    if (holding) {
      endHold()
      return
    }
    if (event.type === 'pointercancel' || wasPinch) {
      return
    }
    if (isTap(moved, event.pointerType)) {
      handlers.click(local(event))
      return
    }
    const recent = performance.now() - lastMoveAt < FLING_WINDOW_MS
    handlers.release(recent ? velocity.x : 0, recent ? velocity.y : 0)
  }

  const onPointerLeave = () => {
    if (pointers.size === 0) {
      handlers.hover(null)
    }
  }

  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    apply(wheelAction(event), local(event))
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return
    }
    if (event.key === 'Escape') {
      handlers.dismiss()
      return
    }
    const rect = canvas.getBoundingClientRect()
    if (apply(keyAction(event.key), { x: rect.width / 2, y: rect.height / 2 })) {
      event.preventDefault()
    }
  }

  const onDoubleClick = (event: MouseEvent) => handlers.doubleClick(local(event))

  const onGestureStart = (event: Event) => {
    event.preventDefault()
    if (pointers.size > 0) {
      return
    }
    gestureScale = 1
  }

  const onGestureChange = (event: Event) => {
    event.preventDefault()
    if (pointers.size > 0) {
      return
    }
    const gesture = event as SafariGestureEvent
    handlers.zoomAt(local(gesture), gesture.scale / gestureScale)
    gestureScale = gesture.scale
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerEnd)
  canvas.addEventListener('pointercancel', onPointerEnd)
  canvas.addEventListener('pointerleave', onPointerLeave)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('keydown', onKeyDown)
  canvas.addEventListener('dblclick', onDoubleClick)
  canvas.addEventListener('gesturestart', onGestureStart)
  canvas.addEventListener('gesturechange', onGestureChange)

  return () => {
    clearTimeout(holdTimer)
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', onPointerEnd)
    canvas.removeEventListener('pointercancel', onPointerEnd)
    canvas.removeEventListener('pointerleave', onPointerLeave)
    canvas.removeEventListener('wheel', onWheel)
    canvas.removeEventListener('keydown', onKeyDown)
    canvas.removeEventListener('dblclick', onDoubleClick)
    canvas.removeEventListener('gesturestart', onGestureStart)
    canvas.removeEventListener('gesturechange', onGestureChange)
  }
}
