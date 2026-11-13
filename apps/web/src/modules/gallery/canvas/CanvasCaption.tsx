import { clsxm } from '@afilmory/utils'
import { useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import type { PhotoManifest } from '~/types/photo'

import { canvasGlass } from './styles'
import { toCanvasPhoto } from './to-canvas-photo'

export const CanvasCaption = ({ photo }: { photo: PhotoManifest | null }) => {
  const { i18n } = useTranslation()
  const lastRef = useRef<PhotoManifest | null>(null)
  if (photo) {
    lastRef.current = photo
  }
  const shown = photo ?? lastRef.current

  const text = useMemo(() => {
    if (!shown) {
      return null
    }
    const date = new Date(shown.dateTaken)
    return {
      date: Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(i18n.language),
      camera: toCanvasPhoto(shown).camera,
    }
  }, [shown, i18n.language])

  return (
    <div
      aria-hidden="true"
      className={clsxm(
        canvasGlass,
        'pointer-events-none absolute bottom-5 left-4 z-30 flex h-9 items-center gap-2 rounded-xl px-3 text-xs tabular-nums transition-opacity duration-200',
        photo && text ? 'opacity-100' : 'opacity-0',
      )}
    >
      {text?.date && <span className="text-text font-medium">{text.date}</span>}
      {text?.camera && <span className="text-text-secondary">{text.camera}</span>}
    </div>
  )
}
