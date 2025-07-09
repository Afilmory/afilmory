import { startTransition } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { GlassButton } from '../button/GlassButton'

export const MapBackButton = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const handleBack = () => {
    startTransition(() => {
      navigate('/')
    })
  }

  return (
    <GlassButton
      className="absolute top-4 left-4 z-50"
      onClick={handleBack}
      title={t('explory.back.to.gallery')}
    >
      <i className="i-mingcute-arrow-left-line text-base text-white" />
    </GlassButton>
  )
}
