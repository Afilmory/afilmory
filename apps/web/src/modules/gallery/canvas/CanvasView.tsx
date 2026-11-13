import type { Rect } from '@afilmory/photo-canvas'
import { availableArrangements, PhotoCanvasEngine } from '@afilmory/photo-canvas'
import { getViewerTransitionTriggerProps } from '@afilmory/viewer-motion'
import { useAtom, useAtomValue } from 'jotai'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { viewerAtom } from '~/atoms/viewer'
import { useContextPhotos, usePhotoViewer } from '~/hooks/usePhotoViewer'

import { canvasArrangeAtom } from './atoms'
import { CanvasCaption } from './CanvasCaption'
import { CanvasDock } from './CanvasDock'
import { CanvasIslandLabels } from './CanvasIslandLabels'
import { CanvasMinimap } from './CanvasMinimap'
import { CanvasZoomControl } from './CanvasZoomControl'
import { createFrameBus } from './frame-bus'
import { toCanvasPhoto } from './to-canvas-photo'

const placeTriggerProxy = (element: HTMLDivElement | null, id: string, rect: Rect | null) => {
  if (!element) {
    return
  }
  for (const [name, value] of Object.entries(getViewerTransitionTriggerProps(id))) {
    if (rect) {
      element.setAttribute(name, value)
    }
    else {
      element.removeAttribute(name)
    }
  }
  if (rect) {
    Object.assign(element.style, {
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.w}px`,
      height: `${rect.h}px`,
    })
  }
}

export const CanvasView = () => {
  const { t } = useTranslation()
  const photos = useContextPhotos()
  const photoViewer = usePhotoViewer()
  const viewer = useAtomValue(viewerAtom)
  const [arrange, setArrange] = useAtom(canvasArrangeAtom)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const proxyRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<PhotoCanvasEngine | null>(null)
  const bus = useMemo(createFrameBus, [])

  const canvasPhotos = useMemo(() => photos.map(toCanvasPhoto), [photos])
  const arrangements = useMemo(() => availableArrangements(canvasPhotos), [canvasPhotos])
  const activeArrange = arrangements.includes(arrange) ? arrange : 'wall'

  const openRef = useRef((_id: string, _rect: Rect) => {})
  openRef.current = (id, rect) => {
    const index = photos.findIndex(photo => photo.id === id)
    if (index === -1) {
      return
    }
    placeTriggerProxy(proxyRef.current, id, rect)
    photoViewer.openViewer(index, proxyRef.current ?? undefined)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const engine = new PhotoCanvasEngine(canvas, {
      onPhotoClick: (id, rect) => openRef.current(id, rect),
      onHover: setHoveredId,
      onFrame: bus.emit,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    })
    engineRef.current = engine
    return () => {
      engineRef.current = null
      engine.destroy()
    }
  }, [bus])

  useEffect(() => {
    engineRef.current?.setArrangement(activeArrange)
  }, [activeArrange])

  useEffect(() => {
    engineRef.current?.setPhotos(canvasPhotos)
  }, [canvasPhotos])

  useEffect(() => {
    if (activeArrange !== arrange) {
      setArrange(activeArrange)
    }
  }, [activeArrange, arrange, setArrange])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) {
      return
    }
    if (!viewer.isOpen) {
      engine.resume()
      return
    }
    engine.pause()
    if (viewer.photoId) {
      placeTriggerProxy(proxyRef.current, viewer.photoId, engine.screenRectOf(viewer.photoId))
    }
  }, [viewer.isOpen, viewer.photoId])

  const hovered = useMemo(
    () => (hoveredId ? (photos.find(photo => photo.id === hoveredId) ?? null) : null),
    [hoveredId, photos],
  )

  return (
    <div className="fixed inset-0 z-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="application"
        aria-label={t('gallery.canvas.label')}
        className="absolute inset-0 size-full cursor-grab touch-none outline-none"
      />
      <div ref={proxyRef} aria-hidden="true" className="pointer-events-none absolute z-1 rounded-md" />
      {activeArrange !== 'wall' && (
        <CanvasIslandLabels
          bus={bus}
          arrangement={activeArrange}
          onSelect={key => engineRef.current?.flyToIsland(key)}
        />
      )}
      <CanvasCaption photo={hovered} />
      <CanvasDock arrangements={arrangements} value={activeArrange} onChange={setArrange} bus={bus} />
      {activeArrange !== 'wall' && (
        <CanvasMinimap bus={bus} onNavigate={point => engineRef.current?.flyToWorld(point)} />
      )}
      <CanvasZoomControl
        bus={bus}
        onStep={direction => engineRef.current?.zoomStep(direction)}
        onReset={() => engineRef.current?.reset()}
      />
    </div>
  )
}
