import { useScrollViewElement } from '@afilmory/ui'
import clsx from 'clsx'
import { lazy, Suspense, useEffect, useState } from 'react'

import { useHasActiveFilters } from '~/hooks/useHasActiveFilters'
import { useContextPhotos } from '~/hooks/usePhotoViewer'
import { useVisiblePhotosDateRange } from '~/hooks/useVisiblePhotosDateRange'

import type { PanelType } from './ActionPanel'
import { ActionPanel } from './ActionPanel'
import { ActiveFiltersHero } from './ActiveFiltersHero'
import { useCanvasUrlSync } from './canvas/useCanvasUrlSync'
import { useEffectiveViewMode } from './canvas/useEffectiveViewMode'
import { ListView } from './ListView'
import { MasonryView } from './MasonryView'
import { PageFooter } from './PageFooter'
import { PageHeader } from './PageHeader'

const CanvasView = lazy(() => import('./canvas/CanvasView').then(module => ({ default: module.CanvasView })))

export const PhotosRoot = () => {
  useCanvasUrlSync()
  const viewMode = useEffectiveViewMode()
  const [showFloatingActions, setShowFloatingActions] = useState(false)

  const photos = useContextPhotos()
  const { dateRange, handleRender } = useVisiblePhotosDateRange(photos)
  const scrollElement = useScrollViewElement()

  const [activePanel, setActivePanel] = useState<PanelType | null>(null)

  // 监听滚动，控制浮动组件的显示
  useEffect(() => {
    if (!scrollElement) {
      return
    }

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

  if (viewMode === 'canvas') {
    return (
      <>
        <PageHeader />
        {photos.length === 0 && hasActiveFilters ? (
          <ActiveFiltersHero />
        ) : (
          <Suspense fallback={null}>
            <CanvasView />
          </Suspense>
        )}
      </>
    )
  }

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
