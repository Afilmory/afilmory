import { LinearDivider } from '@afilmory/ui'
import { Spring } from '@afilmory/utils'
import type { TFunction } from 'i18next'
import { m } from 'motion/react'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'
import { MainPageLayout } from '~/components/layouts/MainPageLayout'

import { useDashboardOverviewQuery } from '../hooks'
import type { DashboardRecentActivityItem } from '../types'

const overviewI18nKeys = {
  pageTitle: 'dashboard.overview.page.title',
  pageDescription: 'dashboard.overview.page.description',
  timeUnknown: 'dashboard.overview.time.unknown',
  activityEmpty: 'dashboard.overview.activity.empty',
  activityNoPreview: 'dashboard.overview.activity.no-preview',
  activityUploadedAt: 'dashboard.overview.activity.uploaded-at',
  activityTakenAt: 'dashboard.overview.activity.taken-at',
  activitySizeUnknown: 'dashboard.overview.activity.size-unknown',
  activityIdLabel: 'dashboard.overview.activity.id-label',
  activitySubtitleWithCount: 'dashboard.overview.activity.subtitle',
  activitySubtitleEmpty: 'dashboard.overview.activity.subtitle-empty',
  activityError: 'dashboard.overview.activity.error',
  stats: {
    totalLabel: 'dashboard.overview.stats.total.label',
    totalHelper: 'dashboard.overview.stats.total.helper',
    storageLabel: 'dashboard.overview.stats.storage.label',
    storageHelperWithPhotos: 'dashboard.overview.stats.storage.helper.with-photos',
    storageHelperEmpty: 'dashboard.overview.stats.storage.helper.empty',
    monthLabel: 'dashboard.overview.stats.month.label',
    monthEqual: 'dashboard.overview.stats.month.helper.equal',
    monthFirst: 'dashboard.overview.stats.month.helper.first',
    monthMore: 'dashboard.overview.stats.month.helper.more',
    monthLess: 'dashboard.overview.stats.month.helper.less',
    syncLabel: 'dashboard.overview.stats.sync.label',
    syncHelper: 'dashboard.overview.stats.sync.helper',
    syncHelperEmpty: 'dashboard.overview.stats.sync.helper-empty',
  },
  sectionActivityTitle: 'dashboard.overview.section.activity.title',
} as const satisfies {
  pageTitle: I18nKeys
  pageDescription: I18nKeys
  timeUnknown: I18nKeys
  activityEmpty: I18nKeys
  activityNoPreview: I18nKeys
  activityUploadedAt: I18nKeys
  activityTakenAt: I18nKeys
  activitySizeUnknown: I18nKeys
  activityIdLabel: I18nKeys
  activitySubtitleWithCount: I18nKeys
  activitySubtitleEmpty: I18nKeys
  activityError: I18nKeys
  stats: {
    totalLabel: I18nKeys
    totalHelper: I18nKeys
    storageLabel: I18nKeys
    storageHelperWithPhotos: I18nKeys
    storageHelperEmpty: I18nKeys
    monthLabel: I18nKeys
    monthEqual: I18nKeys
    monthFirst: I18nKeys
    monthMore: I18nKeys
    monthLess: I18nKeys
    syncLabel: I18nKeys
    syncHelper: I18nKeys
    syncHelperEmpty: I18nKeys
  }
  sectionActivityTitle: I18nKeys
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

type TimeDivision = {
  amount: number
  unit: Intl.RelativeTimeFormatUnit
}

const timeDivisions: TimeDivision[] = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
]

type NumberFormatters = {
  compact: Intl.NumberFormat
  plain: Intl.NumberFormat
  percent: Intl.NumberFormat
  relative: Intl.RelativeTimeFormat
  dateTime: Intl.DateTimeFormat
}

function createFormatters(locale: string): NumberFormatters {
  return {
    compact: new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }),
    plain: new Intl.NumberFormat(locale),
    percent: new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }),
    relative: new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }),
    dateTime: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
  }
}

function formatCompactNumber(value: number, formatter: Intl.NumberFormat) {
  if (!Number.isFinite(value)) return '--'
  if (value === 0) return '0'
  return formatter.format(value)
}

function formatRelativeTimeValue(
  iso: string | null | undefined,
  formatter: Intl.RelativeTimeFormat,
  dateFormatter: Intl.DateTimeFormat,
  fallback: string,
) {
  if (!iso) return fallback
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return fallback
  }

  let diffInSeconds = (date.getTime() - Date.now()) / 1000
  for (const division of timeDivisions) {
    if (Math.abs(diffInSeconds) < division.amount) {
      return formatter.format(Math.round(diffInSeconds), division.unit)
    }
    diffInSeconds /= division.amount
  }

  return dateFormatter.format(date)
}

function formatTakenAtValue(iso: string | null, dateFormatter: Intl.DateTimeFormat) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return dateFormatter.format(date)
}

const STATUS_META = {
  synced: {
    labelKey: 'dashboard.overview.status.synced',
    barClass: 'bg-emerald-400/80',
    dotClass: 'bg-emerald-400/90',
    badgeClass: 'bg-emerald-500/10 text-emerald-300',
  },
  pending: {
    labelKey: 'dashboard.overview.status.pending',
    barClass: 'bg-orange-400/80',
    dotClass: 'bg-orange-400/90',
    badgeClass: 'bg-orange-500/10 text-orange-300',
  },
  conflict: {
    labelKey: 'dashboard.overview.status.conflict',
    barClass: 'bg-red-500/80',
    dotClass: 'bg-red-500/90',
    badgeClass: 'bg-red-500/10 text-red-300',
  },
} satisfies Record<
  DashboardRecentActivityItem['syncStatus'],
  { labelKey: I18nKeys; barClass: string; dotClass: string; badgeClass: string }
>

const EMPTY_STATS = {
  totalPhotos: 0,
  totalStorageBytes: 0,
  thisMonthUploads: 0,
  previousMonthUploads: 0,
  sync: {
    synced: 0,
    pending: 0,
    conflicts: 0,
  },
} as const

function ActivitySkeleton() {
  return (
    <div className="bg-fill/10 border-fill-tertiary animate-pulse rounded-lg border px-3.5 py-3">
      <div className="flex items-start gap-3">
        <div className="bg-fill/20 h-11 w-11 shrink-0 rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="bg-fill/20 h-3.5 w-32 rounded-full" />
          <div className="bg-fill/15 h-3 w-48 rounded-full" />
          <div className="bg-fill/15 h-3 w-40 rounded-full" />
        </div>
      </div>
    </div>
  )
}

function StatSkeleton() {
  return (
    <LinearBorderPanel className="bg-background-tertiary/60 relative overflow-hidden p-5">
      <div className="space-y-2.5">
        <div className="bg-fill/20 h-3 w-20 rounded-full" />
        <div className="bg-fill/30 h-7 w-24 rounded-md" />
        <div className="bg-fill/20 h-3 w-32 rounded-full" />
      </div>
    </LinearBorderPanel>
  )
}

type ActivityListProps = {
  items: DashboardRecentActivityItem[]
  formatRelativeTime: (iso: string | null | undefined) => string
  formatTakenAt: (iso: string | null) => string | null
  formatBytesLabel: (bytes: number) => string
  t: TFunction
}

function ActivityList({ items, formatRelativeTime, formatTakenAt, formatBytesLabel, t }: ActivityListProps) {
  if (items.length === 0) {
    return <div className="text-text-tertiary mt-5 text-sm">{t(overviewI18nKeys.activityEmpty)}</div>
  }

  return (
    <div className="mt-5 space-y-2.5">
      {items.map((item, index) => {
        const statusMeta = STATUS_META[item.syncStatus]
        const takenAtText = formatTakenAt(item.takenAt)

        return (
          <m.div
            key={item.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...Spring.presets.snappy, delay: index * 0.04 }}
            className="group px-3.5 py-3 transition-colors duration-200"
          >
            <div className="flex flex-col gap-2 sm:gap-2.5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-2 sm:gap-3">
                <div className="bg-fill/10 relative h-10 w-10 sm:h-11 sm:w-11 shrink-0 overflow-hidden rounded-lg">
                  {item.previewUrl ? (
                    <img src={item.previewUrl} alt={item.title} className="size-full object-cover" loading="lazy" />
                  ) : (
                    <div className="text-text-tertiary flex size-full items-center justify-center text-[10px]">
                      {t(overviewI18nKeys.activityNoPreview)}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1 sm:space-y-1.5">
                  <div className="text-text truncate text-xs sm:text-sm font-semibold">{item.title}</div>
                  <div className="text-text-tertiary text-[11px] sm:text-xs leading-relaxed">
                    <span>{t(overviewI18nKeys.activityUploadedAt, { time: formatRelativeTime(item.createdAt) })}</span>
                    {takenAtText ? (
                      <>
                        <span className="mx-1.5">•</span>
                        <span>{t(overviewI18nKeys.activityTakenAt, { time: takenAtText })}</span>
                      </>
                    ) : null}
                  </div>
                  <div className="text-text-secondary flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span>
                      {item.size != null && item.size > 0
                        ? formatBytesLabel(item.size)
                        : t(overviewI18nKeys.activitySizeUnknown)}
                    </span>
                    <span className="text-text-tertiary">•</span>
                    <span>{item.storageProvider}</span>
                    <span className="text-text-tertiary">•</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusMeta.badgeClass}`}>
                      {t(statusMeta.labelKey)}
                    </span>
                  </div>
                  {item.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {item.tags.map((tag) => (
                        <span key={tag} className="bg-accent/10 text-accent rounded-full px-2 py-0.5 text-[10px]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="text-text-tertiary min-w-0 truncate text-right text-[11px] sm:text-right">
                {t(overviewI18nKeys.activityIdLabel)}
                <span className="ml-1 truncate">{item.photoId}</span>
              </div>
            </div>

            <LinearDivider className="mt-5 group-last:hidden" />
          </m.div>
        )
      })}
    </div>
  )
}

export function DashboardOverview() {
  const { t, i18n } = useTranslation()
  const { data, isLoading, isError } = useDashboardOverviewQuery()
  const locale = i18n.language ?? 'en'
  const formatters = useMemo(() => createFormatters(locale), [locale])
  const formatCompact = useCallback((value: number) => formatCompactNumber(value, formatters.compact), [formatters])
  const formatPlain = useCallback((value: number) => formatters.plain.format(value), [formatters])
  const formatPercentValue = useCallback(
    (value: number | null) => (value === null ? '--' : formatters.percent.format(value)),
    [formatters],
  )
  const formatRelativeTime = useCallback(
    (iso: string | null | undefined) =>
      formatRelativeTimeValue(iso, formatters.relative, formatters.dateTime, t(overviewI18nKeys.timeUnknown)),
    [formatters, t],
  )
  const formatTakenAt = useCallback((iso: string | null) => formatTakenAtValue(iso, formatters.dateTime), [formatters])

  const stats = data?.stats ?? EMPTY_STATS
  const statusTotal = stats.sync.synced + stats.sync.pending + stats.sync.conflicts
  const syncCompletion = statusTotal === 0 ? null : stats.sync.synced / statusTotal

  const monthlyDelta = stats.thisMonthUploads - stats.previousMonthUploads
  const monthlyTrendDescription = useMemo(() => {
    if (stats.previousMonthUploads === 0) {
      return stats.thisMonthUploads === 0 ? t(overviewI18nKeys.stats.monthEqual) : t(overviewI18nKeys.stats.monthFirst)
    }
    if (monthlyDelta > 0) {
      return t(overviewI18nKeys.stats.monthMore, { difference: formatPlain(monthlyDelta) })
    }
    if (monthlyDelta < 0) {
      return t(overviewI18nKeys.stats.monthLess, { difference: formatPlain(Math.abs(monthlyDelta)) })
    }
    return t(overviewI18nKeys.stats.monthEqual)
  }, [formatPlain, monthlyDelta, stats.previousMonthUploads, stats.thisMonthUploads, t])

  const averageSize = stats.totalPhotos > 0 ? stats.totalStorageBytes / stats.totalPhotos : 0

  const statCards = [
    {
      key: 'total-photos',
      label: t(overviewI18nKeys.stats.totalLabel),
      value: formatCompact(stats.totalPhotos),
      helper: t(overviewI18nKeys.stats.totalHelper, { value: formatPlain(stats.totalPhotos) }),
    },
    {
      key: 'storage',
      label: t(overviewI18nKeys.stats.storageLabel),
      value: formatBytes(stats.totalStorageBytes),
      helper:
        stats.totalPhotos > 0
          ? t(overviewI18nKeys.stats.storageHelperWithPhotos, { average: formatBytes(averageSize || 0) })
          : t(overviewI18nKeys.stats.storageHelperEmpty),
    },
    {
      key: 'this-month',
      label: t(overviewI18nKeys.stats.monthLabel),
      value: formatCompact(stats.thisMonthUploads),
      helper: monthlyTrendDescription,
    },
    {
      key: 'sync',
      label: t(overviewI18nKeys.stats.syncLabel),
      value: formatPercentValue(syncCompletion),
      helper: statusTotal
        ? t(overviewI18nKeys.stats.syncHelper, {
            pending: formatPlain(stats.sync.pending),
            conflicts: formatPlain(stats.sync.conflicts),
          })
        : t(overviewI18nKeys.stats.syncHelperEmpty),
    },
  ]

  return (
    <MainPageLayout title={t(overviewI18nKeys.pageTitle)} description={t(overviewI18nKeys.pageDescription)}>
      <div className="space-y-4 sm:space-y-5">
        <div className="grid gap-3 sm:gap-5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {isLoading
            ? Array.from({ length: 4 }, (_, i) => `skeleton-${i}`).map((key) => <StatSkeleton key={key} />)
            : statCards.map((card, index) => (
                <LinearBorderPanel
                  key={card.key}
                  className="bg-background-tertiary/60 relative overflow-hidden p-4 sm:p-5"
                >
                  <m.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...Spring.presets.smooth, delay: index * 0.05 }}
                    className="space-y-2 sm:space-y-2.5"
                  >
                    <span className="text-text-secondary text-[10px] sm:text-xs font-medium tracking-wide uppercase">
                      {card.label}
                    </span>
                    <div className="text-text text-xl sm:text-2xl font-semibold">{card.value}</div>
                    <div className="text-text-tertiary text-[11px] sm:text-xs leading-relaxed">{card.helper}</div>
                  </m.div>
                </LinearBorderPanel>
              ))}
        </div>

        <LinearBorderPanel className="bg-background-tertiary/60 relative overflow-hidden px-4 sm:px-5 py-4 sm:py-5">
          <div className="space-y-1 sm:space-y-1.5">
            <h2 className="text-text text-sm sm:text-base font-semibold">{t(overviewI18nKeys.sectionActivityTitle)}</h2>
            <p className="text-text-tertiary text-xs sm:text-sm leading-relaxed">
              {data?.recentActivity?.length
                ? t(overviewI18nKeys.activitySubtitleWithCount, { count: data.recentActivity.length })
                : t(overviewI18nKeys.activitySubtitleEmpty)}
            </p>
          </div>

          {isLoading ? (
            <div className="mt-5 space-y-2.5">
              {Array.from({ length: 3 }, (_, i) => `activity-skeleton-${i}`).map((key) => (
                <ActivitySkeleton key={key} />
              ))}
            </div>
          ) : isError ? (
            <div className="mt-5 text-sm text-red-400">{t(overviewI18nKeys.activityError)}</div>
          ) : (
            <ActivityList
              items={data?.recentActivity ?? []}
              formatRelativeTime={formatRelativeTime}
              formatTakenAt={formatTakenAt}
              formatBytesLabel={formatBytes}
              t={t}
            />
          )}
        </LinearBorderPanel>
      </div>
    </MainPageLayout>
  )
}
