import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'

export const MapLoadingState = () => {
  const { t } = useTranslation()

  return (
    <div className="flex h-full w-full items-center justify-center">
      <m.div
        className="text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <m.div
          className="loading-icon mb-4 text-4xl"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          📍
        </m.div>
        <m.div
          className="text-lg font-medium text-gray-900 dark:text-gray-100"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          {t('explory.loading.map')}
        </m.div>
        <m.p
          className="text-sm text-gray-600 dark:text-gray-400"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          {t('explory.parsing.location')}
        </m.p>
      </m.div>
    </div>
  )
}
