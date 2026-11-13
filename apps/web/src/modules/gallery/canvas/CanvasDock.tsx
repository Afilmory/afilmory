import type { Arrangement, AttractBasis } from '@afilmory/photo-canvas'
import { clsxm, Spring } from '@afilmory/utils'
import { m } from 'motion/react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { FrameBus } from './frame-bus'
import { canvasFocusRing, canvasGlass } from './styles'

let hintDismissed = false

const useHint = (bus: FrameBus) => {
  const [visible, setVisible] = useState(!hintDismissed)

  useEffect(() => {
    if (hintDismissed) {
      return
    }
    let start: { x: number, y: number, scale: number } | null = null
    return bus.subscribe((frame) => {
      if (frame.transitioning) {
        start = null
        return
      }
      if (!start) {
        start = frame.camera
        return
      }
      const { camera } = frame
      if (camera.x !== start.x || camera.y !== start.y || camera.scale !== start.scale) {
        hintDismissed = true
        setVisible(false)
      }
    })
  }, [bus])

  return visible
}

export const CanvasDock = ({
  arrangements,
  value,
  onChange,
  bases,
  basis,
  onBasisChange,
  bus,
}: {
  arrangements: Arrangement[]
  value: Arrangement
  onChange: (arrangement: Arrangement) => void
  bases: AttractBasis[]
  basis: AttractBasis
  onBasisChange: (basis: AttractBasis) => void
  bus: FrameBus
}) => {
  const { t } = useTranslation()
  const hintVisible = useHint(bus)

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex flex-col items-center gap-2">
      <p
        className={clsxm(
          canvasGlass,
          'text-text-secondary flex h-7 items-center rounded-full px-3 text-xs transition-opacity duration-300',
          hintVisible ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden={!hintVisible}
      >
        {t('gallery.canvas.hint')}
      </p>
      <div className="pointer-events-auto flex items-center gap-2">
        {arrangements.length > 1 && (
          <div
            role="radiogroup"
            aria-label={t('gallery.view.canvas')}
            className={clsxm(canvasGlass, 'flex items-center gap-1 rounded-xl p-1')}
          >
            {arrangements.map((arrangement) => {
              const selected = arrangement === value
              return (
                <button
                  key={arrangement}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onChange(arrangement)}
                  className={clsxm(
                    canvasFocusRing,
                    'relative flex h-7 items-center rounded-lg px-3 text-xs font-medium transition-colors duration-200',
                    selected ? 'text-text' : 'text-text-secondary hover:text-text',
                  )}
                >
                  {selected && (
                    <m.span
                      layoutId="canvas-arrange-indicator"
                      className="bg-fill absolute inset-0 rounded-lg"
                      transition={Spring.presets.snappy}
                    />
                  )}
                  <span className="relative z-10">{t(`gallery.canvas.arrange.${arrangement}`)}</span>
                </button>
              )
            })}
          </div>
        )}
        {bases.length > 0 && (
          <button
            type="button"
            aria-label={`${t('gallery.canvas.attract.label')}: ${t(`gallery.canvas.attract.basis.${basis}`)}`}
            title={t('gallery.canvas.attract.label')}
            onClick={() => onBasisChange(bases[(bases.indexOf(basis) + 1) % bases.length])}
            className={clsxm(
              canvasGlass,
              canvasFocusRing,
              'text-text-secondary hover:text-text flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition-colors duration-200',
            )}
          >
            <i className="i-mingcute-magnet-line size-3.5" />
            <span>{t(`gallery.canvas.attract.basis.${basis}`)}</span>
          </button>
        )}
      </div>
    </div>
  )
}
