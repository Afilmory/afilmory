import type { Arrangement, FrameState, Island } from '@afilmory/photo-canvas'
import { clsxm } from '@afilmory/utils'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { FrameBus } from './frame-bus'
import { canvasFocusRing } from './styles'

const LABEL_BAND = 56
const LABEL_GAP_PX = 6
const COLLISION_PADDING_PX = 8

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

const overlaps = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

export const CanvasIslandLabels = ({
  bus,
  arrangement,
  onSelect,
}: {
  bus: FrameBus
  arrangement: Exclude<Arrangement, 'wall' | 'color'>
  onSelect: (key: string) => void
}) => {
  const { t } = useTranslation()
  const [islands, setIslands] = useState<Island[]>([])
  const islandsRef = useRef<Island[]>(islands)
  const elementsRef = useRef<(HTMLButtonElement | null)[]>([])
  const sizesRef = useRef<{ width: number, height: number }[]>([])
  const orderRef = useRef<number[]>([])
  const frameRef = useRef<FrameState | null>(null)

  const place = (frame: FrameState) => {
    const { camera, viewport } = frame
    const kept: Box[] = []
    for (const index of orderRef.current) {
      const island = islandsRef.current[index]
      const element = elementsRef.current[index]
      const size = sizesRef.current[index]
      if (!island || !element || !size) {
        continue
      }
      const left = (island.rect.x - camera.x) * camera.scale + viewport.width / 2
      const bottom = (island.rect.y + LABEL_BAND - camera.y) * camera.scale + viewport.height / 2 - LABEL_GAP_PX
      const box = {
        left: left - COLLISION_PADDING_PX,
        top: bottom - size.height - COLLISION_PADDING_PX,
        right: left + size.width + COLLISION_PADDING_PX,
        bottom: bottom + COLLISION_PADDING_PX,
      }
      const onScreen = box.right > 0 && box.left < viewport.width && box.bottom > 0 && box.top < viewport.height
      const visible = onScreen && !frame.transitioning && !kept.some(other => overlaps(box, other))
      if (visible) {
        kept.push(box)
        element.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(bottom - size.height)}px, 0)`
      }
      element.style.opacity = visible ? '1' : '0'
      element.style.pointerEvents = visible ? 'auto' : 'none'
      element.tabIndex = visible ? 0 : -1
    }
  }

  useEffect(
    () =>
      bus.subscribe((frame) => {
        frameRef.current = frame
        const next = frame.islands
        const current = islandsRef.current
        if (next !== current && (next.length > 0 || current.length > 0)) {
          islandsRef.current = next
          setIslands(next)
          return
        }
        place(frame)
      }),
    [bus],
  )

  useLayoutEffect(() => {
    sizesRef.current = islands.map((_, index) => {
      const element = elementsRef.current[index]
      return { width: element?.offsetWidth ?? 0, height: element?.offsetHeight ?? 0 }
    })
    orderRef.current = islands.map((_, index) => index).sort((a, b) => islands[b].count - islands[a].count)
    if (frameRef.current) {
      place(frameRef.current)
    }
  }, [islands])

  const nameOf = (island: Island) => {
    if (island.kind === 'other') {
      return t('gallery.canvas.group.other')
    }
    if (island.kind === 'missing') {
      return t(`gallery.canvas.group.missing.${arrangement}`)
    }
    return island.label
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {islands.map((island, index) => (
        <button
          key={island.key}
          ref={(element) => {
            elementsRef.current[index] = element
          }}
          type="button"
          onClick={() => onSelect(island.key)}
          className={clsxm(
            canvasFocusRing,
            'absolute top-0 left-0 flex flex-col items-start rounded-md text-left whitespace-nowrap opacity-0 transition-opacity duration-200',
          )}
        >
          <span className="text-text text-sm font-semibold">{nameOf(island)}</span>
          <span className="text-text-secondary text-xs tabular-nums">
            {t('gallery.photos', { count: island.count })}
          </span>
        </button>
      ))}
    </div>
  )
}
