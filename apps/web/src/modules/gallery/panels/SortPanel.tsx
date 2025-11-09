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
        className="group flex cursor-pointer items-center gap-2 rounded-lg bg-transparent px-2 py-2 transition-all duration-200 lg:py-1"
        style={{
          // @ts-ignore - CSS variable for hover state
          '--highlight-bg':
            'linear-gradient(to right, color-mix(in srgb, var(--color-accent) 8%, transparent), color-mix(in srgb, var(--color-accent) 5%, transparent))',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background =
            'linear-gradient(to right, color-mix(in srgb, var(--color-accent) 8%, transparent), color-mix(in srgb, var(--color-accent) 5%, transparent))'
          e.currentTarget.style.color = 'var(--color-accent)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = ''
        }}
        onClick={() => setSortOrder('desc')}
      >
        <i className="i-mingcute-sort-descending-line" />
        <span>{t('action.sort.newest.first')}</span>
        {gallerySetting.sortOrder === 'desc' && <i className="i-mingcute-check-line ml-auto" />}
      </div>
      <div
        className="group flex cursor-pointer items-center gap-2 rounded-lg bg-transparent px-2 py-2 transition-all duration-200 lg:py-1"
        style={{
          // @ts-ignore - CSS variable for hover state
          '--highlight-bg':
            'linear-gradient(to right, color-mix(in srgb, var(--color-accent) 8%, transparent), color-mix(in srgb, var(--color-accent) 5%, transparent))',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background =
            'linear-gradient(to right, color-mix(in srgb, var(--color-accent) 8%, transparent), color-mix(in srgb, var(--color-accent) 5%, transparent))'
          e.currentTarget.style.color = 'var(--color-accent)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = ''
        }}
        onClick={() => setSortOrder('asc')}
      >
        <i className="i-mingcute-sort-ascending-line" />
        <span>{t('action.sort.oldest.first')}</span>
        {gallerySetting.sortOrder === 'asc' && <i className="i-mingcute-check-line ml-auto" />}
      </div>
    </div>
  )
}
