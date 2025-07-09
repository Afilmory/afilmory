import { m } from 'motion/react'
import { lazy, Suspense } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { useTranslation } from 'react-i18next'

const MapSection = lazy(() =>
  import('~/modules/map/MapSection').then((m) => ({ default: m.MapSection })),
)

export const Component = () => {
  return (
    <Suspense fallback={<ExploryPageSkeleton />}>
      <ErrorBoundary fallback={<ExploryPageError />}>
        <MapSection />
      </ErrorBoundary>
    </Suspense>
  )
}

const ExploryPageSkeleton = () => {
  const { t } = useTranslation()

  return (
    <m.div
      className="flex h-full w-full items-center justify-center"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
    >
      <div className="text-center">
        <m.div
          className="mb-4 text-4xl"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          📍
        </m.div>
        <m.div
          className="text-lg font-medium text-gray-900 dark:text-gray-100"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          {t('explory.loading.map')}
        </m.div>
        <m.p
          className="text-sm text-gray-600 dark:text-gray-400"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          {t('explory.parsing.location')}
        </m.p>
      </div>
    </m.div>
  )
}

const ExploryPageError = () => {
  return (
    <m.div
      className="flex h-full w-full items-center justify-center"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="text-center">
        <m.div
          className="mb-4 text-4xl"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          ❌
        </m.div>
        <m.div
          className="text-lg font-medium text-red-900 dark:text-red-100"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          地图加载失败
        </m.div>
        <m.p
          className="text-sm text-red-600 dark:text-red-400"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          请检查网络连接或刷新页面重试
        </m.p>
      </div>
    </m.div>
  )
}
