import { useTranslation } from 'react-i18next'

import { ColumnsPanel } from './ColumnsPanel'
import { SortPanel } from './SortPanel'

// 合并的视图面板（排序 + 列数）
export const ViewPanel = () => {
  const { t } = useTranslation()

  return (
    <div className="pb-safe lg:pb-safe-2 w-full lg:py-1">
      <h3 className="mb-3 px-2 text-sm font-medium">{t('action.view.settings')}</h3>

      {/* 排序部分 */}
      <div className="mb-3 px-2">
        <h4 className="text-text-secondary mb-3 text-xs font-medium">{t('action.sort.mode')}</h4>
        <SortPanel />
      </div>

      {/* 分隔线 */}
      <div
        className="mx-2 my-3 h-px"
        style={{
          background:
            'linear-gradient(to right, transparent, color-mix(in srgb, var(--color-accent) 20%, transparent), transparent)',
        }}
      />

      {/* 列数部分 */}
      <div className="px-2">
        <h4 className="text-text-secondary mb-3 text-xs font-medium">{t('action.columns.setting')}</h4>
        <ColumnsPanel />
      </div>
    </div>
  )
}
