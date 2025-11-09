import { clsxm, Spring } from '@afilmory/utils'
import { m } from 'motion/react'
import type { ReactNode } from 'react'
import { useMemo } from 'react'

import { LinearBorderPanel } from '~/components/common/GlassPanel'
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
  const maxUploads = data.reduce((max, point) => Math.max(max, point.uploads), 0)

  return (
    <div className="mt-6 overflow-x-auto pb-2">
      <div className="flex h-44 min-w-[480px] items-end gap-3">
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
              className="group flex min-w-[32px] flex-1 flex-col items-center gap-1"
              title={`${fullLabel} · ${plainNumberFormatter.format(point.uploads)} 张`}
            >
              <div className="bg-fill/15 relative flex h-40 w-full items-end overflow-hidden rounded-md">
                <div
                  className="bg-accent/70 group-hover:bg-accent absolute right-0 bottom-0 left-0 rounded-md transition-colors duration-200"
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
  if (providers.length === 0) {
    return <div className="text-text-tertiary mt-5 text-sm">暂无存储使用数据。</div>
  }

  return (
    <div className="mt-5 space-y-3">
      {providers.map((provider, index) => {
        const ratio = totalBytes > 0 ? provider.bytes / totalBytes : 0
        const percent = Math.round(ratio * 100)
        return (
          <m.div
            key={provider.provider || index}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...Spring.presets.smooth, delay: index * 0.03 }}
            className="space-y-1.5"
          >
            <div className="flex items-center justify-between text-sm">
              <span className="text-text capitalize">{provider.provider}</span>
              <span className="text-text-secondary">
                {formatBytes(provider.bytes)}
                <span className="text-text-tertiary ml-2">
                  {percent}% · {provider.photoCount} 张
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

function RankedList({ items, emptyText }: { items: Array<{ label: string; value: number }>; emptyText: string }) {
  if (items.length === 0) {
    return <div className="text-text-tertiary mt-4 text-sm">{emptyText}</div>
  }

  const maxValue = items.reduce((max, item) => Math.max(max, item.value), 0)

  return (
    <div className="mt-4 space-y-2.5">
      {items.map((item, index) => {
        const ratio = maxValue > 0 ? item.value / maxValue : 0
        return (
          <m.div
            key={item.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...Spring.presets.smooth, delay: index * 0.03 }}
            className="flex items-center gap-3 text-sm"
          >
            <div className="text-text-tertiary w-6 text-right text-[11px]">#{index + 1}</div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-text truncate">{item.label}</span>
                <span className="text-text-secondary text-[13px]">{plainNumberFormatter.format(item.value)}</span>
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
    <LinearBorderPanel className={clsxm('bg-background-tertiary p-5', className)}>
      <div className="space-y-2">
        <h2 className="text-text text-sm font-semibold">{title}</h2>
        <p className="text-text-tertiary text-[13px] leading-relaxed">{description}</p>
      </div>
      {children}
    </LinearBorderPanel>
  )
}

export function DashboardAnalytics() {
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
    <MainPageLayout title="Analytics" description="Track your photo collection statistics and trends">
      <div className="grid gap-4 md:grid-cols-2">
        <SectionPanel title="Upload Trends" description="近 12 个月的上传趋势">
          {isLoading ? (
            <TrendSkeleton />
          ) : isError ? (
            <div className="text-red mt-6 text-sm">无法加载上传趋势，请稍后再试。</div>
          ) : data?.uploadTrends?.length ? (
            <>
              {uploadTrendStats ? (
                <div className="border-fill/20 bg-fill/5 mt-5 grid gap-3 rounded-lg border p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">累计上传</span>
                    <span className="text-text font-semibold">
                      {compactNumberFormatter.format(uploadTrendStats.totalUploads)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">表现最佳</span>
                    <span className="text-text font-semibold">
                      {formatFullMonth(uploadTrendStats.bestMonth.month)}
                      <span className="text-text-tertiary ml-2 text-[13px]">
                        {plainNumberFormatter.format(uploadTrendStats.bestMonth.uploads)} 张
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">本月上传</span>
                    <span className="text-text font-semibold">
                      {plainNumberFormatter.format(uploadTrendStats.currentMonth.uploads)} 张
                      {uploadTrendStats.growth !== null ? (
                        <span
                          className={clsxm(
                            'ml-2 text-[13px]',
                            uploadTrendStats.growth >= 0 ? 'text-emerald-300' : 'text-red-300',
                          )}
                        >
                          {uploadTrendStats.growth === 0
                            ? '与上月持平'
                            : `${uploadTrendStats.growth >= 0 ? '+' : ''}${percentFormatter.format(uploadTrendStats.growth)}`}
                        </span>
                      ) : uploadTrendStats.previousMonth ? (
                        <span className="text-text-tertiary ml-2 text-[13px]">
                          {uploadTrendStats.delta > 0 ? '首次出现上传记录' : '与上月持平'}
                        </span>
                      ) : null}
                    </span>
                  </div>
                </div>
              ) : null}

              <UploadTrendsChart data={data.uploadTrends} />
            </>
          ) : (
            <div className="text-text-tertiary mt-6 text-sm">暂无上传记录。</div>
          )}
        </SectionPanel>

        <SectionPanel title="Storage Usage" description="按存储提供方统计的容量占比">
          {isLoading ? (
            <ProvidersSkeleton />
          ) : isError ? (
            <div className="text-red mt-5 text-sm">无法加载存储数据，请稍后再试。</div>
          ) : storageUsage ? (
            (() => {
              const monthDeltaBytes = storageUsage.currentMonthBytes - storageUsage.previousMonthBytes
              let monthDeltaDescription = '与上月持平'

              if (storageUsage.previousMonthBytes > 0) {
                if (monthDeltaBytes !== 0) {
                  const prefix = monthDeltaBytes > 0 ? '+' : '-'
                  monthDeltaDescription = `${prefix}${formatBytes(Math.abs(monthDeltaBytes))} 对比上月`
                }
              } else if (storageUsage.currentMonthBytes > 0) {
                monthDeltaDescription = '首次记录'
              }

              return (
                <>
                  <div className="border-fill/20 bg-fill/5 mt-5 grid gap-3 rounded-lg border p-4 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">总占用</span>
                      <span className="text-text font-semibold">{formatBytes(storageUsage.totalBytes)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">照片数量</span>
                      <span className="text-text font-semibold">
                        {plainNumberFormatter.format(storageUsage.totalPhotos)} 张
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">本月新增</span>
                      <span className="text-text font-semibold">
                        {formatBytes(storageUsage.currentMonthBytes)}
                        <span className="text-text-tertiary ml-2 text-[13px]">{monthDeltaDescription}</span>
                      </span>
                    </div>
                  </div>

                  <ProvidersList providers={storageUsage.providers} totalBytes={storageUsage.totalBytes} />
                </>
              )
            })()
          ) : (
            <div className="text-text-tertiary mt-5 text-sm">暂无存储使用数据。</div>
          )}
        </SectionPanel>

        <SectionPanel title="Popular Tags" description="最近上传中最常使用的标签">
          {isLoading ? (
            <RankedListSkeleton />
          ) : isError ? (
            <div className="text-red mt-4 text-sm">无法加载标签数据，请稍后再试。</div>
          ) : (
            <RankedList items={popularTagItems ?? []} emptyText="暂无标签统计数据。" />
          )}
        </SectionPanel>

        <SectionPanel title="Top Devices" description="根据 EXIF 信息统计的热门拍摄设备">
          {isLoading ? (
            <RankedListSkeleton />
          ) : isError ? (
            <div className="text-red mt-4 text-sm">无法加载设备数据，请稍后再试。</div>
          ) : (
            <RankedList items={deviceItems ?? []} emptyText="暂无设备统计数据。" />
          )}
        </SectionPanel>
      </div>
    </MainPageLayout>
  )
}
