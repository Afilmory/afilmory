import { clsxm } from '@afilmory/utils'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import type { FrameBus } from './frame-bus'
import { canvasFocusRing, canvasGlass } from './styles'

const buttonClass = clsxm(
  canvasFocusRing,
  'text-text-secondary hover:bg-accent/10 hover:text-text flex size-7 items-center justify-center rounded-lg transition-colors duration-200',
)

export const CanvasZoomControl = ({
  bus,
  onStep,
  onReset,
}: {
  bus: FrameBus
  onStep: (direction: 1 | -1) => void
  onReset: () => void
}) => {
  const { t } = useTranslation()
  const readoutRef = useRef<HTMLButtonElement>(null)

  useEffect(
    () =>
      bus.subscribe((frame) => {
        if (readoutRef.current) {
          readoutRef.current.textContent = `${Math.round(frame.camera.scale * 100)}%`
        }
      }),
    [bus],
  )

  return (
    <div className={clsxm(canvasGlass, 'absolute right-4 bottom-5 z-30 flex items-center gap-0.5 rounded-xl p-1')}>
      <button
        type="button"
        className={buttonClass}
        aria-label={t('gallery.canvas.zoom.out')}
        onClick={() => onStep(-1)}
      >
        <i className="i-mingcute-minimize-line text-base" aria-hidden="true" />
      </button>
      <button
        ref={readoutRef}
        type="button"
        className={clsxm(
          canvasFocusRing,
          'text-text-secondary hover:text-text h-7 w-12 rounded-lg text-center text-xs tabular-nums transition-colors duration-200',
        )}
        aria-label={t('gallery.canvas.zoom.reset')}
        onClick={onReset}
      >
        100%
      </button>
      <button type="button" className={buttonClass} aria-label={t('gallery.canvas.zoom.in')} onClick={() => onStep(1)}>
        <i className="i-mingcute-add-line text-base" aria-hidden="true" />
      </button>
    </div>
  )
}
