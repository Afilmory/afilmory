import { Spring } from '@afilmory/utils'
import { m } from 'motion/react'

import { LinearBorderPanel } from '~/components/common/GlassPanel'
import { MainPageLayout } from '~/components/layouts/MainPageLayout'

import { useDashboardOverviewQuery } from '../hooks'
import type { DashboardRecentActivityItem } from '../types'

const compactNumberFormatter = new Intl.NumberFormat('zh-CN', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const plainNumberFormatter = new Intl.NumberFormat('zh-CN')

const percentFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  maximumFractionDigits: 1,
})

const relativeTimeFormatter = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' })

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatCompactNumber(value: number) {
  if (!Number.isFinite(value)) return '--'
  if (value === 0) return '0'
  return compactNumberFormatter.format(value)
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

function formatRelativeTime(iso: string | null | undefined) {
  if (!iso) return '时间未知'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return '时间未知'
  }

  let diffInSeconds = (date.getTime() - Date.now()) / 1000
  for (const division of timeDivisions) {
    if (Math.abs(diffInSeconds) < division.amount) {
      return relativeTimeFormatter.format(Math.round(diffInSeconds), division.unit)
    }
    diffInSeconds /= division.amount
  }

  return dateTimeFormatter.format(date)
}

function formatTakenAt(iso: string | null) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return dateTimeFormatter.format(date)
}

const STATUS_META = {
  synced: {
    label: '已同步',
    barClass: 'bg-emerald-400/80',
    dotClass: 'bg-emerald-400/90',
    badgeClass: 'bg-emerald-500/10 text-emerald-300',
  },
  pending: {
    label: '处理中',
    barClass: 'bg-orange-400/80',
    dotClass: 'bg-orange-400/90',
    badgeClass: 'bg-orange-500/10 text-orange-300',
  },
  conflict: {
    label: '需关注',
    barClass: 'bg-red-500/80',
    dotClass: 'bg-red-500/90',
    badgeClass: 'bg-red-500/10 text-red-300',
  },
} satisfies Record<
  DashboardRecentActivityItem['syncStatus'],
  { label: string; barClass: string; dotClass: string; badgeClass: string }
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

function ActivityList({ items }: { items: DashboardRecentActivityItem[] }) {
  if (items.length === 0) {
    return <div className="text-text-tertiary mt-5 text-sm">暂无最近活动，上传照片后即可看到这里的动态。</div>
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
            className="bg-fill/5 hover:bg-fill/10 group border-fill-tertiary rounded-lg border px-3.5 py-3 transition-colors duration-200"
          >
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="bg-fill/10 relative h-11 w-11 shrink-0 overflow-hidden rounded-lg">
                  {item.previewUrl ? (
                    <img src={item.previewUrl} alt={item.title} className="size-full object-cover" loading="lazy" />
                  ) : (
                    <div className="text-text-tertiary flex size-full items-center justify-center text-[10px]">
                      No Preview
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="text-text truncate text-sm font-semibold">{item.title}</div>
                  <div className="text-text-tertiary text-xs leading-relaxed">
                    <span>上传于 {formatRelativeTime(item.createdAt)}</span>
                    {takenAtText ? (
                      <>
                        <span className="mx-1.5">•</span>
                        <span>拍摄时间 {takenAtText}</span>
                      </>
                    ) : null}
                  </div>
                  <div className="text-text-secondary flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span>{item.size != null && item.size > 0 ? formatBytes(item.size) : '大小未知'}</span>
                    <span className="text-text-tertiary">•</span>
                    <span>{item.storageProvider}</span>
                    <span className="text-text-tertiary">•</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusMeta.badgeClass}`}>
                      {statusMeta.label}
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
                ID:
                <span className="ml-1 truncate">{item.photoId}</span>
              </div>
            </div>
          </m.div>
        )
      })}
    </div>
  )
}

export function DashboardOverview() {
  const { data, isLoading, isError } = useDashboardOverviewQuery()

  const stats = data?.stats ?? EMPTY_STATS
  const statusTotal = stats.sync.synced + stats.sync.pending + stats.sync.conflicts
  const syncCompletion = statusTotal === 0 ? null : stats.sync.synced / statusTotal

  const monthlyDelta = stats.thisMonthUploads - stats.previousMonthUploads
  let monthlyTrendDescription = '与上月持平'
  if (stats.previousMonthUploads === 0) {
    monthlyTrendDescription = stats.thisMonthUploads === 0 ? '与上月持平' : '首次出现上传记录'
  } else if (monthlyDelta > 0) {
    monthlyTrendDescription = `比上月多 ${plainNumberFormatter.format(monthlyDelta)} 张`
  } else if (monthlyDelta < 0) {
    monthlyTrendDescription = `比上月少 ${plainNumberFormatter.format(Math.abs(monthlyDelta))} 张`
  }

  const averageSize = stats.totalPhotos > 0 ? stats.totalStorageBytes / stats.totalPhotos : 0

  const statCards = [
    {
      key: 'total-photos',
      label: '照片总数',
      value: formatCompactNumber(stats.totalPhotos),
      helper: `${plainNumberFormatter.format(stats.totalPhotos)} 张照片`,
    },
    {
      key: 'storage',
      label: '占用存储',
      value: formatBytes(stats.totalStorageBytes),
      helper: stats.totalPhotos > 0 ? `平均每张 ${formatBytes(averageSize || 0)}` : '暂无照片，存储占用为 0',
    },
    {
      key: 'this-month',
      label: '本月新增',
      value: formatCompactNumber(stats.thisMonthUploads),
      helper: monthlyTrendDescription,
    },
    {
      key: 'sync',
      label: '同步完成率',
      value: syncCompletion === null ? '--' : percentFormatter.format(syncCompletion),
      helper: statusTotal
        ? `待处理 ${plainNumberFormatter.format(stats.sync.pending)} | 冲突 ${plainNumberFormatter.format(stats.sync.conflicts)}`
        : '暂无同步任务',
    },
  ]

  const syncSummary = [
    { key: 'synced', value: stats.sync.synced },
    { key: 'pending', value: stats.sync.pending },
    { key: 'conflict', value: stats.sync.conflicts },
  ] as const

  return (
    <MainPageLayout title="Dashboard" description="掌握图库运行状态与最近同步活动">
      <div className="space-y-5">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {isLoading
            ? Array.from({ length: 4 }, (_, i) => `skeleton-${i}`).map((key) => <StatSkeleton key={key} />)
            : statCards.map((card, index) => (
                <LinearBorderPanel key={card.key} className="bg-background-tertiary/60 relative overflow-hidden p-5">
                  <m.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...Spring.presets.smooth, delay: index * 0.05 }}
                    className="space-y-2.5"
                  >
                    <span className="text-text-secondary text-xs font-medium tracking-wide uppercase">
                      {card.label}
                    </span>
                    <div className="text-text text-2xl font-semibold">{card.value}</div>
                    <div className="text-text-tertiary text-xs leading-relaxed">{card.helper}</div>
                  </m.div>
                </LinearBorderPanel>
              ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <LinearBorderPanel className="bg-background-tertiary/60 relative overflow-hidden px-5 py-5">
            <div className="space-y-1.5">
              <h2 className="text-text text-base font-semibold">最近活动</h2>
              <p className="text-text-tertiary text-sm leading-relaxed">
                {data?.recentActivity?.length
                  ? `展示最近 ${data.recentActivity.length} 次上传和同步记录`
                  : '还没有任何上传，快来添加第一张照片吧～'}
              </p>
            </div>

            {isLoading ? (
              <div className="mt-5 space-y-2.5">
                {Array.from({ length: 3 }, (_, i) => `activity-skeleton-${i}`).map((key) => (
                  <ActivitySkeleton key={key} />
                ))}
              </div>
            ) : isError ? (
              <div className="mt-5 text-sm text-red-400">无法获取活动数据，请稍后再试。</div>
            ) : (
              <ActivityList items={data?.recentActivity ?? []} />
            )}
          </LinearBorderPanel>

          <LinearBorderPanel className="bg-background-tertiary/60 relative overflow-hidden px-5 py-5">
            <div className="space-y-1.5">
              <h2 className="text-text text-base font-semibold">同步概览</h2>
              <p className="text-text-tertiary text-sm leading-relaxed">了解当前同步状态，及时处理异常项。</p>
            </div>

            <div className="mt-5 space-y-4">
              {syncSummary.map((entry) => {
                const meta = STATUS_META[entry.key]
                const percent = statusTotal ? Math.round((entry.value / statusTotal) * 100) : 0

                return (
                  <div key={entry.key} className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-text-secondary inline-flex items-center gap-1.5">
                        <span className={`size-2 rounded-full ${meta.dotClass}`} />
                        {meta.label}
                      </span>
                      <span className="text-text font-medium">
                        {plainNumberFormatter.format(entry.value)}
                        <span className="text-text-tertiary ml-1.5">{percent}%</span>
                      </span>
                    </div>
                    <div className="bg-fill/20 h-1.5 w-full overflow-hidden rounded-full">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${meta.barClass}`}
                        style={{ width: `${statusTotal ? Math.max(percent, entry.value > 0 ? 4 : 0) : 0}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="text-text-secondary border-fill-tertiary bg-fill/5 mt-5 rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed">
              {statusTotal === 0
                ? '暂无同步任务，添加照片后即可查看同步健康度。'
                : syncCompletion !== null && syncCompletion >= 0.85
                  ? '同步状态良好，保持当前处理效率即可。'
                  : '存在待处理或冲突的项目，建议尽快检查同步日志。'}
            </div>
          </LinearBorderPanel>
        </div>
      </div>
    </MainPageLayout>
  )
}
