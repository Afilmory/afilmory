import { worldRectToScreen } from '@afilmory/photo-canvas'
import { clsxm } from '@afilmory/utils'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ImageLoaderManager } from '~/lib/image-loader-manager'
import type { PhotoManifest } from '~/types/photo'

import type { FrameBus } from './frame-bus'
import { liveVideoSource } from './live-video-source'

const HOVER_DELAY_MS = 200
const MIN_TILE_WIDTH_PX = 96
const TILE_RADIUS_PX = 6

type Phase = 'idle' | 'loading' | 'playing' | 'failed'

export const CanvasLivePhoto = ({
  photo,
  instanceKey,
  bus,
}: {
  photo: PhotoManifest | null
  instanceKey: string | null
  bus: FrameBus
}) => {
  const { t } = useTranslation()
  const frameRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [largeEnough, setLargeEnough] = useState(false)
  const source = useMemo(() => (photo ? liveVideoSource(photo) : null), [photo])

  useEffect(() => {
    const element = frameRef.current
    if (!element || !instanceKey) {
      setLargeEnough(false)
      return
    }
    let instances: unknown = null
    let target: { x: number, y: number, w: number, h: number } | null = null
    return bus.subscribe((frame) => {
      if (frame.instances !== instances) {
        instances = frame.instances
        target = frame.instances.find(instance => instance.key === instanceKey) ?? null
      }
      if (!target) {
        setLargeEnough(false)
        return
      }
      const rect = worldRectToScreen(frame.camera, frame.viewport, target)
      Object.assign(element.style, {
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.w}px`,
        height: `${rect.h}px`,
        borderRadius: `${TILE_RADIUS_PX * Math.min(1, frame.camera.scale * 1.4)}px`,
      })
      setLargeEnough(rect.w >= MIN_TILE_WIDTH_PX)
    })
  }, [bus, instanceKey])

  const active = source !== null && instanceKey !== null && largeEnough

  useEffect(() => {
    const video = videoRef.current
    if (!active || !source || !video) {
      return
    }
    let cancelled = false
    let manager: ImageLoaderManager | null = null
    const timer = setTimeout(async () => {
      setPhase('loading')
      manager = new ImageLoaderManager()
      try {
        await manager.processVideo(source, video)
        if (cancelled) {
          return
        }
        video.currentTime = 0
        await video.play()
        if (!cancelled) {
          setPhase('playing')
        }
      }
      catch {
        if (!cancelled) {
          setPhase('failed')
        }
      }
    }, HOVER_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
      manager?.cleanup()
      video.pause()
      setPhase('idle')
    }
  }, [active, source, instanceKey])

  return (
    <div
      ref={frameRef}
      aria-hidden="true"
      className={clsxm('pointer-events-none absolute z-1 overflow-hidden', active ? 'opacity-100' : 'opacity-0')}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        onEnded={() => setPhase('idle')}
        className={clsxm(
          'absolute inset-0 size-full object-cover transition-opacity duration-200',
          phase === 'playing' ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div className="absolute top-2 left-2 flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-2 py-1 text-xs text-white backdrop-blur-md">
        <i
          className={clsxm(
            'size-3.5 shrink-0',
            phase === 'loading' ? 'i-mingcute-loading-line animate-spin' : 'i-mingcute-live-photo-line',
          )}
        />
        <span>{phase === 'loading' ? t('loading.converting') : t('photo.live.badge')}</span>
      </div>
    </div>
  )
}
