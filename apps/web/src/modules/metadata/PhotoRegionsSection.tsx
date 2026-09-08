import type { PhotoRegion } from '@afilmory/builder'
import { clsxm, focusRing } from '@afilmory/utils'
import { useTranslation } from 'react-i18next'

import { getPhotoRegionIcon, getPhotoRegionId } from '~/modules/viewer/photo-region-display'

import { ExifSection } from './ExifSection'

interface PhotoRegionsSectionProps {
  activeRegionId?: string | null
  regions: PhotoRegion[]
  onActiveRegionChange?: (regionId: string | null) => void
}

export const PhotoRegionsSection = ({ activeRegionId, regions, onActiveRegionChange }: PhotoRegionsSectionProps) => {
  const { t } = useTranslation()

  if (regions.length === 0) {
    return null
  }

  return (
    <ExifSection title={t('photo.regions.title')} ariaLabel={t('photo.regions.title')}>
      <ul className="flex flex-col gap-1">
        {regions.map((region, index) => {
          const regionId = getPhotoRegionId(region, index)
          const isActive = activeRegionId === regionId
          const primaryLabel = region.name || region.type || t('photo.regions.unnamed')
          const secondaryLabel = region.name ? (region.type ?? t('photo.regions.region')) : t('photo.regions.region')

          return (
            <li key={regionId}>
              <button
                type="button"
                className={clsxm(
                  focusRing,
                  'group/region -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors duration-200',
                  'hover:border-accent/20 hover:bg-accent/5',
                  isActive && 'border-accent/30 bg-accent/10',
                )}
                aria-label={t('photo.regions.preview', { name: primaryLabel })}
                data-photo-region-list-item={regionId}
                data-photo-region-active={isActive ? '' : undefined}
                onPointerEnter={() => onActiveRegionChange?.(regionId)}
                onPointerLeave={() => onActiveRegionChange?.(null)}
                onFocus={() => onActiveRegionChange?.(regionId)}
                onBlur={() => onActiveRegionChange?.(null)}
                onClick={() => onActiveRegionChange?.(regionId)}
              >
                <span className="bg-material-medium flex size-7 shrink-0 items-center justify-center rounded text-white/70 transition-colors duration-200 group-hover/region:text-white">
                  <i className={clsxm(getPhotoRegionIcon(region.type), 'size-4')} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-white/90">{primaryLabel}</span>
                  <span className="block truncate text-[11px] text-white/50">{secondaryLabel}</span>
                </span>
                <i
                  className={clsxm(
                    'i-mingcute-frame-line size-4 shrink-0 text-white/35 transition-colors duration-200',
                    'group-hover/region:text-accent',
                    isActive && 'text-accent',
                  )}
                  aria-hidden="true"
                />
              </button>
            </li>
          )
        })}
      </ul>
    </ExifSection>
  )
}
