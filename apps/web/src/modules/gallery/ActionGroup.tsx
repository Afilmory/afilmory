import { useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { gallerySettingAtom } from '~/atoms/app'
import { UnifiedSearchPanel } from '~/components/gallery/UnifiedSearchPanel'
import { Button } from '~/components/ui/button'

import { ResponsiveActionButton } from './components/ActionButton'
import { ViewPanel } from './panels/ViewPanel'

export const ActionGroup = () => {
  const { t } = useTranslation()
  const [gallerySetting, setGallerySetting] = useAtom(gallerySettingAtom)
  const navigate = useNavigate()

  const onTagsPanelOpenChange = (open: boolean) => {
    setGallerySetting((prev: any) => ({
      ...prev,
      isTagsPanelOpen: open,
    }))
  }

  // 计算视图设置是否有自定义配置
  const hasViewCustomization =
    gallerySetting.columns !== 'auto' || gallerySetting.sortOrder !== 'desc'

  // 计算搜索和过滤的激活状态
  const hasSearchOrFilter =
    gallerySetting.searchQuery ||
    gallerySetting.selectedTags.length > 0 ||
    gallerySetting.selectedCameras.length > 0 ||
    gallerySetting.selectedLenses.length > 0 ||
    gallerySetting.selectedRatings !== null

  // 计算过滤器数量（不包括搜索查询）
  const filterCount =
    gallerySetting.selectedTags.length +
    gallerySetting.selectedCameras.length +
    gallerySetting.selectedLenses.length +
    (gallerySetting.selectedRatings !== null ? 1 : 0)

  return (
    <div className="flex items-center justify-center gap-3">
      {/* 统一搜索和过滤按钮 */}
      <ResponsiveActionButton
        icon="i-mingcute-search-line"
        title={t('action.search.unified.title')}
        badge={
          filterCount > 0 ? filterCount : hasSearchOrFilter ? '●' : undefined
        }
        globalOpen={gallerySetting.isTagsPanelOpen}
        onGlobalOpenChange={onTagsPanelOpenChange}
      >
        <UnifiedSearchPanel />
      </ResponsiveActionButton>

      {/* 地图探索按钮 */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/explory')}
        className="h-10 w-10 rounded-full border-0 bg-gray-100 transition-all duration-200 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
        title={t('action.map.explore')}
      >
        <i className="i-mingcute-map-pin-line text-base text-gray-600 dark:text-gray-300" />
      </Button>

      {/* 视图设置按钮（合并排序和列数） */}
      <ResponsiveActionButton
        icon="i-mingcute-layout-grid-line"
        title={t('action.view.title')}
        badge={hasViewCustomization ? '●' : undefined}
      >
        <ViewPanel />
      </ResponsiveActionButton>
    </div>
  )
}
