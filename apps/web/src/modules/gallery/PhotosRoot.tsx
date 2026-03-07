import { useScrollViewElement } from '@afilmory/ui'
import clsx from 'clsx'
import { useAtomValue } from 'jotai'
import { useEffect, useState } from 'react'

import { gallerySettingAtom } from '~/atoms/app'
import { useHasActiveFilters } from '~/hooks/useHasActiveFilters'
import { useContextPhotos } from '~/hooks/usePhotoViewer'
import { useVisiblePhotosDateRange } from '~/hooks/useVisiblePhotosDateRange'

import type { PanelType } from './ActionPanel'
import { ActionPanel } from './ActionPanel'
import { ActiveFiltersHero } from './ActiveFiltersHero'
import { ListView } from './ListView'
import { MasonryView } from './MasonryView'
import { PageFooter } from './PageFooter'
import { PageHeader } from './PageHeader'

export const PhotosRoot = () => {
  const { viewMode } = useAtomValue(gallerySettingAtom)
  const [showFloatingActions, setShowFloatingActions] = useState(false)

  const photos = useContextPhotos()
  const { dateRange, handleRender } = useVisiblePhotosDateRange(photos)
  const scrollElement = useScrollViewElement()

  const [activePanel, setActivePanel] = useState<PanelType | null>(null)

  // 监听滚动，控制浮动组件的显示
  useEffect(() => {
    if (!scrollElement) return

    const handleScroll = () => {
      const { scrollTop } = scrollElement
      setShowFloatingActions(scrollTop > 500)
    }

    scrollElement.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      scrollElement.removeEventListener('scroll', handleScroll)
    }
  }, [scrollElement])

  const hasActiveFilters = useHasActiveFilters()

  return (
    <>
      <PageHeader
        dateRange={dateRange.formattedRange}
        location={dateRange.location}
        showDateRange={showFloatingActions && !!dateRange.formattedRange}
      />

      {hasActiveFilters && <ActiveFiltersHero />}

      <div className={clsx('p-1 **:select-none! lg:px-0', 'pb-20 lg:pb-24', !hasActiveFilters && 'mt-12')}>
        {viewMode === 'list' ? <ListView photos={photos} /> : <MasonryView photos={photos} onRender={handleRender} />}
      </div>

      <PageFooter />

      <ActionPanel
        open={!!activePanel}
        onOpenChange={(open) => {
          if (!open) {
            setActivePanel(null)
          }
        }}
        type={activePanel}
      />
    </>
  )
}
