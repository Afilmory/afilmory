import { useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'

import { gallerySettingAtom } from '~/atoms/app'
import { Slider } from '~/components/ui/slider'
import { useMobile } from '~/hooks/useMobile'

export const ColumnsPanel = () => {
  const { t } = useTranslation()
  const [gallerySetting, setGallerySetting] = useAtom(gallerySettingAtom)
  const isMobile = useMobile()

  const setColumns = (columns: number | 'auto') => {
    setGallerySetting({
      ...gallerySetting,
      columns,
    })
  }
  // 根据设备类型提供不同的列数范围
  const columnRange = isMobile
    ? { min: 2, max: 4 } // 移动端适合的列数范围
    : { min: 2, max: 8 } // 桌面端适合的列数范围

  return (
    <div className="w-full lg:w-80">
      <Slider
        value={gallerySetting.columns}
        onChange={setColumns}
        min={columnRange.min}
        max={columnRange.max}
        autoLabel={t('action.auto')}
      />
    </div>
  )
}
