import { useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'

import { gallerySettingAtom } from '~/atoms/app'

export const SortPanel = () => {
  const { t } = useTranslation()
  const [gallerySetting, setGallerySetting] = useAtom(gallerySettingAtom)

  const setSortOrder = (order: 'asc' | 'desc') => {
    setGallerySetting({
      ...gallerySetting,
      sortOrder: order,
    })
  }
  return (
    <div className="-mx-2 flex flex-col p-0 text-sm lg:p-0">
      <div
        className={
          'hover:bg-accent/50 flex cursor-pointer items-center gap-2 rounded-md bg-transparent px-2 py-2 transition-colors hover:backdrop-blur-3xl lg:py-1'
        }
        onClick={() => setSortOrder('desc')}
      >
        <i className="i-mingcute-sort-descending-line" />
        <span>{t('action.sort.newest.first')}</span>
        {gallerySetting.sortOrder === 'desc' && (
          <i className="i-mingcute-check-line ml-auto" />
        )}
      </div>
      <div
        className={
          'hover:bg-accent/50 flex cursor-pointer items-center gap-2 rounded-md bg-transparent px-2 py-2 transition-colors hover:backdrop-blur-3xl lg:py-1'
        }
        onClick={() => setSortOrder('asc')}
      >
        <i className="i-mingcute-sort-ascending-line" />
        <span>{t('action.sort.oldest.first')}</span>
        {gallerySetting.sortOrder === 'asc' && (
          <i className="i-mingcute-check-line ml-auto" />
        )}
      </div>
    </div>
  )
}
