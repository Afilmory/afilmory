import { isPhotoCanvasSupported } from '@afilmory/photo-canvas'
import { clsxm, Spring } from '@afilmory/utils'
import { useSetAtom } from 'jotai'
import { m as motion } from 'motion/react'
import { useTranslation } from 'react-i18next'

import type { GalleryViewMode } from '~/atoms/app'
import { gallerySettingAtom } from '~/atoms/app'

import { useEffectiveViewMode } from '../canvas/useEffectiveViewMode'

const MODES: {
  mode: GalleryViewMode
  icon: string
  label: 'gallery.view.masonry' | 'gallery.view.list' | 'gallery.view.canvas'
}[] = [
  { mode: 'masonry', icon: 'i-mingcute-grid-line', label: 'gallery.view.masonry' },
  { mode: 'list', icon: 'i-mingcute-list-ordered-line', label: 'gallery.view.list' },
  { mode: 'canvas', icon: 'i-mingcute-artboard-line', label: 'gallery.view.canvas' },
]

export const ViewModeSegment = () => {
  const { t } = useTranslation()
  const setSettings = useSetAtom(gallerySettingAtom)
  const viewMode = useEffectiveViewMode()
  const modes = isPhotoCanvasSupported() ? MODES : MODES.filter(({ mode }) => mode !== 'canvas')

  return (
    <div className="bg-material-medium/40 relative hidden h-7 items-center gap-0.5 rounded-lg p-0.5 lg:flex lg:h-8 lg:gap-1 lg:p-1">
      {modes.map(({ mode, icon, label }) => (
        <button
          key={mode}
          type="button"
          onClick={() => setSettings(prev => ({ ...prev, viewMode: mode }))}
          className={clsxm(
            'relative z-10 flex h-full items-center justify-center rounded-lg px-2 text-xs font-medium transition-colors duration-200 lg:px-4',
            viewMode === mode ? 'text-white' : 'text-white/60 hover:text-white/80',
          )}
          title={t(label)}
          aria-label={t(label)}
          aria-pressed={viewMode === mode}
        >
          {viewMode === mode && (
            <motion.span
              layoutId="segment-indicator"
              className="absolute inset-0 rounded-md bg-white/15 shadow-sm"
              transition={Spring.presets.snappy}
            />
          )}
          <i className={clsxm(icon, 'relative z-10 text-sm lg:text-base')} />
        </button>
      ))}
    </div>
  )
}
