import type { Point, Rect } from '@afilmory/photo-canvas'
import { availableArrangements, PhotoCanvasEngine } from '@afilmory/photo-canvas'
import { getViewerTransitionTriggerProps } from '@afilmory/viewer-motion'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { gallerySettingAtom } from '~/atoms/app'
import { viewerAtom } from '~/atoms/viewer'
import { useContextPhotos, usePhotoViewer } from '~/hooks/usePhotoViewer'

import { canvasArrangeAtom } from './atoms'
import { CanvasCaption } from './CanvasCaption'
import { CanvasDock } from './CanvasDock'
import { CanvasIslandLabels } from './CanvasIslandLabels'
import { CanvasLivePhoto } from './CanvasLivePhoto'
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
  const setGallerySetting = useSetAtom(gallerySettingAtom)
  const [hovered, setHovered] = useState<{ id: string, key: string } | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const proxyRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<PhotoCanvasEngine | null>(null)
  const openedAtRef = useRef<Point | null>(null)
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
    openedAtRef.current = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
    placeTriggerProxy(proxyRef.current, id, rect)
    photoViewer.openViewer(index, proxyRef.current ?? undefined)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const leaveCanvas = () => setGallerySetting(prev => ({ ...prev, viewMode: 'masonry' }))
    let engine: PhotoCanvasEngine
    try {
      engine = new PhotoCanvasEngine(canvas, {
        onPhotoClick: (id, rect) => openRef.current(id, rect),
        onHover: (id, key) => setHovered(id && key ? { id, key } : null),
        onFrame: bus.emit,
        onUnavailable: leaveCanvas,
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      })
    }
    catch {
      leaveCanvas()
      return
    }
    engineRef.current = engine
    return () => {
      engineRef.current = null
      engine.destroy()
    }
  }, [bus, setGallerySetting])

  useEffect(() => {
    engineRef.current?.setArrangement(activeArrange)
  }, [activeArrange])

  useEffect(() => {
    engineRef.current?.setPhotos(canvasPhotos)
  }, [canvasPhotos])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) {
      return
    }
    if (!viewer.isOpen) {
      openedAtRef.current = null
      engine.resume()
      return
    }
    engine.pause()
    if (viewer.photoId) {
      placeTriggerProxy(
        proxyRef.current,
        viewer.photoId,
        engine.screenRectOf(viewer.photoId, openedAtRef.current ?? undefined),
      )
    }
  }, [viewer.isOpen, viewer.photoId])

  const hoveredPhoto = useMemo(
    () => (hovered ? (photos.find(photo => photo.id === hovered.id) ?? null) : null),
    [hovered, photos],
  )
  const livePhoto = viewer.isOpen ? null : hoveredPhoto

  return (
    <div className="fixed inset-0 z-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="application"
        aria-label={t('gallery.canvas.label')}
        className="outline-accent absolute inset-0 size-full cursor-grab touch-none outline-0 -outline-offset-2 focus-visible:outline-2"
      />
      <div ref={proxyRef} aria-hidden="true" className="pointer-events-none absolute z-1 rounded-md" />
      {activeArrange !== 'wall' && (
        <CanvasIslandLabels
          bus={bus}
          arrangement={activeArrange}
          onSelect={key => engineRef.current?.flyToIsland(key)}
        />
      )}
      <CanvasLivePhoto photo={livePhoto} instanceKey={livePhoto && hovered ? hovered.key : null} bus={bus} />
      <CanvasCaption photo={hoveredPhoto} />
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
