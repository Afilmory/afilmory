import { Button } from '@afilmory/ui'
import { useAtom, useSetAtom } from 'jotai'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { gallerySettingAtom, isCommandPaletteOpenAtom } from '~/atoms/app'

import { ResponsiveActionButton } from './components/ActionButton'
import { ViewPanel } from './panels/ViewPanel'

export const ActionGroup = () => {
  const { t } = useTranslation()
  const [gallerySetting] = useAtom(gallerySettingAtom)
  const setCommandPaletteOpen = useSetAtom(isCommandPaletteOpenAtom)
  const navigate = useNavigate()

  // 计算视图设置是否有自定义配置
  const hasViewCustomization = gallerySetting.columns !== 'auto' || gallerySetting.sortOrder !== 'desc'

  // 计算过滤器数量
  const filterCount =
    gallerySetting.selectedTags.length +
    gallerySetting.selectedCameras.length +
    gallerySetting.selectedLenses.length +
    (gallerySetting.selectedRatings !== null ? 1 : 0)

  return (
    <div className="flex items-center justify-center gap-3">
      {/* 搜索和过滤按钮 - 打开命令面板 */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setCommandPaletteOpen(true)
        }}
        className="relative h-10 min-w-10 rounded-full border-0 bg-gray-100 px-3 transition-all duration-200 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
        title={t('action.search.unified.title')}
      >
        <i className="i-mingcute-search-line text-base text-gray-600 dark:text-gray-300" />
        {filterCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs font-medium text-white">
            {filterCount}
          </span>
        )}
      </Button>

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
