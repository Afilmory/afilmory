import type { FrameState, Point } from '@afilmory/photo-canvas'
import { clsxm } from '@afilmory/utils'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import type { FrameBus } from './frame-bus'
import { canvasFocusRing, canvasGlass } from './styles'

const WIDTH = 192
const HEIGHT = 112
const INSET = 0.9

const projection = (frame: FrameState) => {
  const { bounds } = frame
  if (!bounds || bounds.w <= 0 || bounds.h <= 0) {
    return null
  }
  const scale = Math.min(WIDTH / bounds.w, HEIGHT / bounds.h) * INSET
  return {
    scale,
    offsetX: WIDTH / 2 - (bounds.x + bounds.w / 2) * scale,
    offsetY: HEIGHT / 2 - (bounds.y + bounds.h / 2) * scale,
  }
}

const KEY_STEP_PX = 240
const KEY_STEPS: Record<string, Point | undefined> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
}

export const CanvasMinimap = ({ bus, onNavigate }: { bus: FrameBus, onNavigate: (point: Point) => void }) => {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<FrameState | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) {
      return
    }
    const dpr = window.devicePixelRatio || 1
    canvas.width = WIDTH * dpr
    canvas.height = HEIGHT * dpr
    const styles = getComputedStyle(canvas)
    const islandColor = styles.color
    const viewportColor = styles.getPropertyValue('--color-accent') || styles.color

    return bus.subscribe((frame) => {
      frameRef.current = frame
      const map = projection(frame)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, WIDTH, HEIGHT)
      if (!map) {
        return
      }
      context.fillStyle = islandColor
      for (const { rect } of frame.islands) {
        context.beginPath()
        context.roundRect(
          rect.x * map.scale + map.offsetX,
          rect.y * map.scale + map.offsetY,
          Math.max(2, rect.w * map.scale),
          Math.max(2, rect.h * map.scale),
          1.5,
        )
        context.fill()
      }
      const { camera, viewport } = frame
      const width = (viewport.width / camera.scale) * map.scale
      const height = (viewport.height / camera.scale) * map.scale
      context.strokeStyle = viewportColor
      context.lineWidth = 1.5
      context.beginPath()
      context.roundRect(
        camera.x * map.scale + map.offsetX - width / 2,
        camera.y * map.scale + map.offsetY - height / 2,
        width,
        height,
        3,
      )
      context.stroke()
    })
  }, [bus])

  const navigate = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const frame = frameRef.current
    const map = frame && projection(frame)
    if (!map) {
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    onNavigate({
      x: (event.clientX - rect.left - map.offsetX) / map.scale,
      y: (event.clientY - rect.top - map.offsetY) / map.scale,
    })
  }

  return (
    <div className={clsxm(canvasGlass, 'absolute right-4 bottom-16 z-30 rounded-xl')}>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="application"
        aria-label={t('gallery.canvas.minimap')}
        className={clsxm(canvasFocusRing, 'text-text-tertiary block cursor-pointer touch-none rounded-xl')}
        onKeyDown={(event) => {
          const step = KEY_STEPS[event.key]
          const frame = frameRef.current
          if (!step || !frame) {
            return
          }
          event.preventDefault()
          const distance = KEY_STEP_PX / frame.camera.scale
          onNavigate({ x: frame.camera.x + step.x * distance, y: frame.camera.y + step.y * distance })
        }}
        style={{ width: WIDTH, height: HEIGHT }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          navigate(event)
        }}
        onPointerMove={(event) => {
          if (event.buttons > 0) {
            navigate(event)
          }
        }}
      />
    </div>
  )
}
