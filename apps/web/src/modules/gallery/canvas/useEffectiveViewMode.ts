import { isPhotoCanvasSupported } from '@afilmory/photo-canvas'
import { useAtomValue } from 'jotai'

import { gallerySettingAtom } from '~/atoms/app'
import { useMobile } from '~/hooks/useMobile'

import { resolveViewMode } from './url-state'

export const useEffectiveViewMode = () => {
  const { viewMode } = useAtomValue(gallerySettingAtom)
  const isMobile = useMobile()
  return resolveViewMode({ requested: viewMode, supported: isPhotoCanvasSupported(), isLargeScreen: !isMobile })
}
