import { clsxm, Spring } from '@afilmory/utils'
import { m } from 'motion/react'
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'
import { MainPageLayout } from '~/components/layouts/MainPageLayout'

import { useDashboardAnalyticsQuery } from '../hooks'
import type { StorageProviderUsage, UploadTrendPoint } from '../types'

const plainNumberFormatter = new Intl.NumberFormat('zh-CN')
const compactNumberFormatter = new Intl.NumberFormat('zh-CN', {
  notation: 'compact',
  maximumFractionDigits: 1,
})
const percentFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  maximumFractionDigits: 1,
})
const monthLabelFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'short' })
const fullMonthFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' })

const analyticsKeys = {
  pageTitle: 'analytics.page.title',
  pageDescription: 'analytics.page.description',
  sections: {
    upload: {
      title: 'analytics.sections.upload.title',
      description: 'analytics.sections.upload.description',
      error: 'analytics.sections.upload.error',
      empty: 'analytics.sections.upload.empty',
      total: 'analytics.sections.upload.total',
      best: 'analytics.sections.upload.best',
      current: 'analytics.sections.upload.current',
      growthEqual: 'analytics.sections.upload.growth-equal',
      firstRecord: 'analytics.sections.upload.first-record',
      compareEqual: 'analytics.sections.upload.compare-equal',
      tooltip: 'analytics.sections.upload.tooltip',
    },
    storage: {
      title: 'analytics.sections.storage.title',
      description: 'analytics.sections.storage.description',
      error: 'analytics.sections.storage.error',
      empty: 'analytics.sections.storage.empty',
      total: 'analytics.sections.storage.total',
      photos: 'analytics.sections.storage.photos',
      current: 'analytics.sections.storage.current',
      deltaEqual: 'analytics.sections.storage.delta.equal',
      deltaCompare: 'analytics.sections.storage.delta.compare',
      deltaFirst: 'analytics.sections.storage.delta.first',
      providerMeta: 'analytics.sections.storage.provider-meta',
    },
    tags: {
      title: 'analytics.sections.tags.title',
      description: 'analytics.sections.tags.description',
      error: 'analytics.sections.tags.error',
      empty: 'analytics.sections.tags.empty',
    },
    devices: {
      title: 'analytics.sections.devices.title',
      description: 'analytics.sections.devices.description',
      error: 'analytics.sections.devices.error',
      empty: 'analytics.sections.devices.empty',
    },
  },
  units: {
    photos: 'analytics.units.photos',
  },
} as const

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const fixed = value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)
  return `${fixed} ${units[unitIndex]}`
}

function buildMonthDate(month: string) {
  const [yearStr, monthStr] = month.split('-')
  const year = Number.parseInt(yearStr, 10)
  const monthIndex = Number.parseInt(monthStr, 10) - 1
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return null
  }
  return new Date(Date.UTC(year, monthIndex, 1))
}

function formatMonthLabel(month: string) {
  const date = buildMonthDate(month)
  return date ? monthLabelFormatter.format(date) : month
}

function formatFullMonth(month: string) {
  const date = buildMonthDate(month)
  return date ? fullMonthFormatter.format(date) : month
}

function TrendSkeleton() {
  return (
    <div className="mt-6">
      <div className="flex h-44 items-end gap-2">
        {Array.from({ length: 12 }, (_, index) => (
          <div key={index} className="flex flex-1 flex-col items-center gap-1">
            <div className="bg-fill/15 relative flex h-40 w-full items-end overflow-hidden rounded-md">
              <div className="bg-fill/25 mb-0 w-full rounded-md" style={{ height: `${20 + (index % 3) * 10}%` }} />
            </div>
            <div className="bg-fill/20 h-3 w-6 rounded-full" />
            <div className="bg-fill/15 h-3 w-8 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

function ProvidersSkeleton() {
  return (
    <div className="mt-5 space-y-3">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="space-y-2">
          <div className="bg-fill/20 h-3 w-36 rounded-full" />
          <div className="bg-fill/15 h-2.5 w-full rounded-full" />
        </div>
      ))}
    </div>
  )
}

function RankedListSkeleton() {
  return (
    <div className="mt-4 space-y-2">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center justify-between">
          <div className="bg-fill/20 h-3 w-32 rounded-full" />
          <div className="bg-fill/15 h-3 w-12 rounded-full" />
        </div>
      ))}
    </div>
  )
}

function UploadTrendsChart({ data }: { data: UploadTrendPoint[] }) {
  const { t } = useTranslation()
  const maxUploads = data.reduce((max, point) => Math.max(max, point.uploads), 0)

  return (
    <div className="mt-4 sm:mt-6 overflow-x-auto pb-2">
      <div className="flex h-36 sm:h-44 min-w-[360px] sm:min-w-[480px] items-end gap-2 sm:gap-3">
        {data.map((point, index) => {
          const basePercent = maxUploads === 0 ? 0 : (point.uploads / maxUploads) * 100
          const heightPercent = Math.max(basePercent, point.uploads > 0 ? 8 : 0)
          const monthLabel = formatMonthLabel(point.month)
          const fullLabel = formatFullMonth(point.month)

          return (
            <m.div
              key={point.month}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...Spring.presets.snappy, delay: index * 0.04 }}
              className="group flex min-w-[24px] sm:min-w-[32px] flex-1 flex-col items-center gap-0.5 sm:gap-1"
              title={t(analyticsKeys.sections.upload.tooltip, {
                month: fullLabel,
                value: plainNumberFormatter.format(point.uploads),
              })}
            >
              <div className="relative flex h-32 sm:h-40 w-full items-end">
                <div
                  className="bg-accent/70 group-hover:bg-accent absolute right-0 bottom-0 shape-squircle left-0 mb-2 transition-colors duration-200"
                  style={{ height: `${heightPercent}%` }}
                />
              </div>
              <span className="text-text-tertiary text-[11px] leading-none">{monthLabel}</span>
              <span className="text-text-secondary text-[11px] leading-none">
                {plainNumberFormatter.format(point.uploads)}
              </span>
            </m.div>
          )
        })}
      </div>
    </div>
  )
}

function ProvidersList({ providers, totalBytes }: { providers: StorageProviderUsage[]; totalBytes: number }) {
  const { t } = useTranslation()
  if (providers.length === 0) {
    return (
      <div className="text-text-tertiary mt-4 sm:mt-5 text-xs sm:text-sm">
        {t(analyticsKeys.sections.storage.empty)}
      </div>
    )
  }

  return (
    <div className="mt-4 sm:mt-5 space-y-2.5 sm:space-y-3">
      {providers.map((provider, index) => {
        const ratio = totalBytes > 0 ? provider.bytes / totalBytes : 0
        const percent = Math.round(ratio * 100)
        return (
          <m.div
            key={provider.provider || index}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...Spring.presets.smooth, delay: index * 0.03 }}
            className="space-y-1 sm:space-y-1.5"
          >
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-text capitalize">{provider.provider}</span>
              <span className="text-text-secondary text-right">
                {formatBytes(provider.bytes)}
                <span className="text-text-tertiary ml-1 sm:ml-2 text-[11px] sm:text-xs">
                  {t(analyticsKeys.sections.storage.providerMeta, {
                    percent,
                    photoCount: plainNumberFormatter.format(provider.photoCount),
                  })}
                </span>
              </span>
            </div>
            <div className="bg-fill/15 h-2.5 w-full rounded-full">
              <div
                className="bg-accent/70 h-full rounded-full"
                style={{ width: `${Math.min(Math.max(percent, 2), 100)}%` }}
              />
            </div>
          </m.div>
        )
      })}
    </div>
  )
}

function RankedList({
  items,
  emptyTextKey,
}: {
  items: Array<{ label: string; value: number }>
  emptyTextKey: I18nKeys
}) {
  const { t } = useTranslation()
  if (items.length === 0) {
    return <div className="text-text-tertiary mt-3 sm:mt-4 text-xs sm:text-sm">{t(emptyTextKey)}</div>
  }

  const maxValue = items.reduce((max, item) => Math.max(max, item.value), 0)

  return (
    <div className="mt-3 sm:mt-4 space-y-2 sm:space-y-2.5">
      {items.map((item, index) => {
        const ratio = maxValue > 0 ? item.value / maxValue : 0
        return (
          <m.div
            key={item.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...Spring.presets.smooth, delay: index * 0.03 }}
            className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm"
          >
            <div className="text-text-tertiary w-5 sm:w-6 text-right text-[10px] sm:text-[11px]">#{index + 1}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-text truncate">{item.label}</span>
                <span className="text-text-secondary text-[11px] sm:text-[13px] shrink-0">
                  {plainNumberFormatter.format(item.value)}
                </span>
              </div>
              <div className="bg-fill/15 mt-1.5 h-2 rounded-full">
                <div
                  className="bg-accent/60 h-full rounded-full"
                  style={{ width: `${Math.min(Math.max(ratio * 100, 4), 100)}%` }}
                />
              </div>
            </div>
          </m.div>
        )
      })}
    </div>
  )
}

function SectionPanel({
  title,
  description,
  className,
  children,
}: {
  title: string
  description: string
  className?: string
  children: ReactNode
}) {
  return (
    <LinearBorderPanel className={clsxm('bg-background-tertiary p-4 sm:p-5', className)}>
      <div className="space-y-1.5 sm:space-y-2">
        <h2 className="text-text text-xs sm:text-sm font-semibold">{title}</h2>
        <p className="text-text-tertiary text-[12px] sm:text-[13px] leading-relaxed">{description}</p>
      </div>
      {children}
    </LinearBorderPanel>
  )
}

export function DashboardAnalytics() {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useDashboardAnalyticsQuery()

  const uploadTrendStats = useMemo(() => {
    if (!data?.uploadTrends?.length) {
      return null
    }

    const totalUploads = data.uploadTrends.reduce((sum, point) => sum + point.uploads, 0)
    const bestMonth = data.uploadTrends.reduce(
      (best, current) => (current.uploads > best.uploads ? current : best),
      data.uploadTrends[0],
    )
    const currentMonth = data.uploadTrends.at(-1)!
    const previousMonth = data.uploadTrends.length > 1 ? (data.uploadTrends.at(-2) ?? null) : null

    const delta = previousMonth ? currentMonth.uploads - previousMonth.uploads : currentMonth.uploads
    const growth = previousMonth && previousMonth.uploads > 0 ? delta / previousMonth.uploads : null

    return {
      totalUploads,
      bestMonth,
      currentMonth,
      previousMonth,
      delta,
      growth,
    }
  }, [data?.uploadTrends])

  const storageUsage = data?.storageUsage

  const popularTagItems = data?.popularTags?.map((entry) => ({
    label: entry.tag,
    value: entry.count,
  }))

  const deviceItems = data?.topDevices?.map((entry) => ({
    label: entry.device,
    value: entry.count,
  }))

  return (
    <MainPageLayout title={t(analyticsKeys.pageTitle)} description={t(analyticsKeys.pageDescription)}>
      <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
        <SectionPanel
          title={t(analyticsKeys.sections.upload.title)}
          description={t(analyticsKeys.sections.upload.description)}
        >
          {isLoading ? (
            <TrendSkeleton />
          ) : isError ? (
            <div className="text-red mt-6 text-sm">{t(analyticsKeys.sections.upload.error)}</div>
          ) : data?.uploadTrends?.length ? (
            <>
              {uploadTrendStats ? (
                <div className="mt-4 sm:mt-5 grid gap-2 sm:gap-3 text-xs sm:text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">{t(analyticsKeys.sections.upload.total)}</span>
                    <span className="text-text font-semibold">
                      {compactNumberFormatter.format(uploadTrendStats.totalUploads)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">{t(analyticsKeys.sections.upload.best)}</span>
                    <span className="text-text font-semibold text-right">
                      <span className="block sm:inline">{formatFullMonth(uploadTrendStats.bestMonth.month)}</span>
                      <span className="text-text-tertiary ml-0 sm:ml-2 text-[11px] sm:text-[13px]">
                        {t(analyticsKeys.units.photos, {
                          value: plainNumberFormatter.format(uploadTrendStats.bestMonth.uploads),
                        })}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">{t(analyticsKeys.sections.upload.current)}</span>
                    <span className="text-text font-semibold">
                      {t(analyticsKeys.units.photos, {
                        value: plainNumberFormatter.format(uploadTrendStats.currentMonth.uploads),
                      })}
                      {uploadTrendStats.growth !== null ? (
                        <span
                          className={clsxm(
                            'ml-1 sm:ml-2 text-[11px] sm:text-[13px]',
                            uploadTrendStats.growth >= 0 ? 'text-emerald-300' : 'text-red-300',
                          )}
                        >
                          {uploadTrendStats.growth === 0
                            ? t(analyticsKeys.sections.upload.growthEqual)
                            : `${uploadTrendStats.growth >= 0 ? '+' : ''}${percentFormatter.format(uploadTrendStats.growth)}`}
                        </span>
                      ) : uploadTrendStats.previousMonth ? (
                        <span className="text-text-tertiary ml-1 sm:ml-2 text-[11px] sm:text-[13px]">
                          {uploadTrendStats.delta > 0
                            ? t(analyticsKeys.sections.upload.firstRecord)
                            : t(analyticsKeys.sections.upload.compareEqual)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                </div>
              ) : null}

              <UploadTrendsChart data={data.uploadTrends} />
            </>
          ) : (
            <div className="text-text-tertiary mt-4 sm:mt-6 text-xs sm:text-sm">
              {t(analyticsKeys.sections.upload.empty)}
            </div>
          )}
        </SectionPanel>

        <SectionPanel
          title={t(analyticsKeys.sections.storage.title)}
          description={t(analyticsKeys.sections.storage.description)}
        >
          {isLoading ? (
            <ProvidersSkeleton />
          ) : isError ? (
            <div className="text-red mt-5 text-sm">{t(analyticsKeys.sections.storage.error)}</div>
          ) : storageUsage ? (
            (() => {
              const monthDeltaBytes = storageUsage.currentMonthBytes - storageUsage.previousMonthBytes
              let monthDeltaDescription = t(analyticsKeys.sections.storage.deltaEqual)

              if (storageUsage.previousMonthBytes > 0) {
                if (monthDeltaBytes !== 0) {
                  const prefix = monthDeltaBytes > 0 ? '+' : '-'
                  const deltaValue = `${prefix}${formatBytes(Math.abs(monthDeltaBytes))}`
                  monthDeltaDescription = t(analyticsKeys.sections.storage.deltaCompare, { delta: deltaValue })
                }
              } else if (storageUsage.currentMonthBytes > 0) {
                monthDeltaDescription = t(analyticsKeys.sections.storage.deltaFirst)
              }

              return (
                <>
                  <div className="mt-4 sm:mt-5 grid gap-2 sm:gap-3 text-xs sm:text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">{t(analyticsKeys.sections.storage.total)}</span>
                      <span className="text-text font-semibold text-right">{formatBytes(storageUsage.totalBytes)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">{t(analyticsKeys.sections.storage.photos)}</span>
                      <span className="text-text font-semibold">
                        {t(analyticsKeys.units.photos, {
                          value: plainNumberFormatter.format(storageUsage.totalPhotos),
                        })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">{t(analyticsKeys.sections.storage.current)}</span>
                      <span className="text-text font-semibold text-right">
                        <span className="block sm:inline">{formatBytes(storageUsage.currentMonthBytes)}</span>
                        <span className="text-text-tertiary ml-0 sm:ml-2 text-[11px] sm:text-[13px]">
                          {monthDeltaDescription}
                        </span>
                      </span>
                    </div>
                  </div>

                  <ProvidersList providers={storageUsage.providers} totalBytes={storageUsage.totalBytes} />
                </>
              )
            })()
          ) : (
            <div className="text-text-tertiary mt-5 text-sm">{t(analyticsKeys.sections.storage.empty)}</div>
          )}
        </SectionPanel>

        <SectionPanel
          title={t(analyticsKeys.sections.tags.title)}
          description={t(analyticsKeys.sections.tags.description)}
        >
          {isLoading ? (
            <RankedListSkeleton />
          ) : isError ? (
            <div className="text-red mt-4 text-sm">{t(analyticsKeys.sections.tags.error)}</div>
          ) : (
            <RankedList items={popularTagItems ?? []} emptyTextKey={analyticsKeys.sections.tags.empty} />
          )}
        </SectionPanel>

        <SectionPanel
          title={t(analyticsKeys.sections.devices.title)}
          description={t(analyticsKeys.sections.devices.description)}
        >
          {isLoading ? (
            <RankedListSkeleton />
          ) : isError ? (
            <div className="text-red mt-4 text-sm">{t(analyticsKeys.sections.devices.error)}</div>
          ) : (
            <RankedList items={deviceItems ?? []} emptyTextKey={analyticsKeys.sections.devices.empty} />
          )}
        </SectionPanel>
      </div>
    </MainPageLayout>
  )
}
