import { Button } from '@afilmory/ui'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'

import { BILLING_USAGE_EVENT_CONFIG, getUsageEventDescription, getUsageEventLabel } from '../../constants'
import type { BillingUsageEvent, BillingUsageOverview } from '../../types'

type PhotoUsagePanelProps = {
  overview?: BillingUsageOverview | null
  isLoading?: boolean
  isFetching?: boolean
  onRefresh?: () => void
}

const photoUsageI18nKeys = {
  summary: {
    title: 'photos.usage.summary.title',
    description: 'photos.usage.summary.description',
    refresh: 'photos.usage.summary.refresh',
  },
  events: {
    title: 'photos.usage.events.title',
    description: 'photos.usage.events.description',
    total: 'photos.usage.events.total',
    emptyTitle: 'photos.usage.events.empty.title',
    emptyDescription: 'photos.usage.events.empty.description',
    unitLabel: 'photos.usage.events.unit.label',
    unitByte: 'photos.usage.events.unit.byte',
    unitCount: 'photos.usage.events.unit.count',
    metadataEmpty: 'photos.usage.events.metadata.empty',
    metadataMore: 'photos.usage.events.metadata.more',
    metadataValueUnknown: 'photos.usage.events.metadata.value-unknown',
  },
} as const satisfies {
  summary: {
    title: I18nKeys
    description: I18nKeys
    refresh: I18nKeys
  }
  events: {
    title: I18nKeys
    description: I18nKeys
    total: I18nKeys
    emptyTitle: I18nKeys
    emptyDescription: I18nKeys
    unitLabel: I18nKeys
    unitByte: I18nKeys
    unitCount: I18nKeys
    metadataEmpty: I18nKeys
    metadataMore: I18nKeys
    metadataValueUnknown: I18nKeys
  }
}

export function PhotoUsagePanel({ overview, isLoading, isFetching, onRefresh }: PhotoUsagePanelProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language ?? i18n.resolvedLanguage ?? 'en'
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale])
  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  )
  const relativeFormatter = useMemo(
    () =>
      new Intl.RelativeTimeFormat(locale, {
        numeric: 'auto',
      }),
    [locale],
  )
  const summaryItems = useMemo(() => {
    const totals = overview?.totals ?? []
    const totalMap = new Map(totals.map((entry) => [entry.eventType, entry.totalQuantity]))
    return (
      Object.entries(BILLING_USAGE_EVENT_CONFIG) as [
        BillingUsageEvent['eventType'],
        (typeof BILLING_USAGE_EVENT_CONFIG)[BillingUsageEvent['eventType']],
      ][]
    ).map(([eventType, config]) => ({
      eventType,
      label: getUsageEventLabel(eventType),
      description: getUsageEventDescription(eventType),
      tone: config.tone,
      value: totalMap.get(eventType) ?? 0,
    }))
  }, [overview?.totals])

  const events = overview?.events ?? []
  const isEmpty = !isLoading && events.length === 0

  return (
    <div className="space-y-6">
      <LinearBorderPanel className="bg-background-secondary/60 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-text">{t(photoUsageI18nKeys.summary.title)}</h3>
            <p className="text-sm text-text-secondary">{t(photoUsageI18nKeys.summary.description)}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={onRefresh}
            disabled={isFetching || isLoading}
          >
            <i className={`i-lucide-rotate-cw size-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden />
            {t(photoUsageI18nKeys.summary.refresh)}
          </Button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {isLoading && events.length === 0
            ? Array.from({ length: 3 }).map((_, index) => <SummarySkeleton key={`usage-summary-skeleton-${index}`} />)
            : summaryItems.map((item) => (
                <SummaryCard
                  key={item.eventType}
                  label={item.label}
                  description={item.description}
                  value={item.value}
                  tone={item.tone}
                  numberFormatter={numberFormatter}
                />
              ))}
        </div>
      </LinearBorderPanel>

      <LinearBorderPanel className="bg-background-secondary/60">
        <div className="flex flex-col gap-2 border-b border-border/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-text">{t(photoUsageI18nKeys.events.title)}</h3>
            <p className="text-sm text-text-secondary">{t(photoUsageI18nKeys.events.description)}</p>
          </div>
          {events.length > 0 && (
            <p className="text-xs text-text-tertiary">{t(photoUsageI18nKeys.events.total, { count: events.length })}</p>
          )}
        </div>

        {isLoading ? (
          <div className="divide-y divide-border/20">
            {Array.from({ length: 4 }).map((_, index) => (
              <UsageEventSkeleton key={`usage-event-skeleton-${index}`} />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="px-5 py-12 text-center">
            <p className="text-lg font-medium text-text">{t(photoUsageI18nKeys.events.emptyTitle)}</p>
            <p className="mt-2 text-sm text-text-secondary">{t(photoUsageI18nKeys.events.emptyDescription)}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/10">
            {events.map((event) => (
              <UsageEventRow
                key={event.id}
                event={event}
                numberFormatter={numberFormatter}
                dateTimeFormatter={dateTimeFormatter}
                relativeTimeFormatter={relativeFormatter}
              />
            ))}
          </div>
        )}
      </LinearBorderPanel>
    </div>
  )
}

type SummaryCardProps = {
  label: string
  description: string
  value: number
  tone: 'accent' | 'warning' | 'muted'
  numberFormatter: Intl.NumberFormat
}

function SummaryCard({ label, description, value, tone, numberFormatter }: SummaryCardProps) {
  const toneClass = tone === 'accent' ? 'text-emerald-400' : tone === 'warning' ? 'text-rose-400' : 'text-text'

  return (
    <LinearBorderPanel className="bg-background-tertiary/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{numberFormatter.format(value)}</p>
      <p className="mt-1 text-xs text-text-secondary">{description}</p>
    </LinearBorderPanel>
  )
}

function SummarySkeleton() {
  return (
    <div className="rounded-xl bg-background-tertiary/60 p-4">
      <div className="h-3 w-1/3 animate-pulse rounded-full bg-border/60" />
      <div className="mt-4 h-8 w-2/5 animate-pulse rounded bg-border/60" />
      <div className="mt-3 h-3 w-3/5 animate-pulse rounded-full bg-border/40" />
    </div>
  )
}

type UsageEventRowProps = {
  event: BillingUsageEvent
}

type UsageEventRowFormatters = {
  numberFormatter: Intl.NumberFormat
  dateTimeFormatter: Intl.DateTimeFormat
  relativeTimeFormatter: Intl.RelativeTimeFormat
}

function UsageEventRow({
  event,
  numberFormatter,
  dateTimeFormatter,
  relativeTimeFormatter,
}: UsageEventRowProps & UsageEventRowFormatters) {
  const { t } = useTranslation()
  const label = getUsageEventLabel(event.eventType)
  const description = getUsageEventDescription(event.eventType)
  const quantityClass = event.quantity >= 0 ? 'text-emerald-400' : 'text-rose-400'
  const dateLabel = formatDateLabel(event.occurredAt, dateTimeFormatter)
  const relativeLabel = formatRelativeLabel(event.occurredAt, relativeTimeFormatter)
  const unitLabel =
    event.unit === 'byte' ? t(photoUsageI18nKeys.events.unitByte) : t(photoUsageI18nKeys.events.unitCount)

  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex-1">
        <p className="text-sm font-semibold text-text">{label}</p>
        {description && <p className="text-xs text-text-secondary">{description}</p>}
        <MetadataBadges metadata={event.metadata} />
      </div>
      <div className="flex flex-col items-start gap-1 text-right text-sm sm:min-w-[160px]">
        <p className={`text-base font-semibold ${quantityClass}`}>{numberFormatter.format(event.quantity)}</p>
        <p className="text-xs text-text-secondary">{t(photoUsageI18nKeys.events.unitLabel, { unit: unitLabel })}</p>
      </div>
      <div className="text-right text-sm text-text-secondary sm:min-w-[180px]">
        <p>{dateLabel}</p>
        {relativeLabel && <p className="text-xs text-text-tertiary">{relativeLabel}</p>}
      </div>
    </div>
  )
}

function MetadataBadges({ metadata }: { metadata: Record<string, unknown> | null }) {
  const { t } = useTranslation()
  if (!metadata) {
    return <p className="mt-3 text-xs text-text-tertiary">{t(photoUsageI18nKeys.events.metadataEmpty)}</p>
  }

  const entries = Object.entries(metadata).filter(([, value]) => value != null)
  if (entries.length === 0) {
    return <p className="mt-3 text-xs text-text-tertiary">{t(photoUsageI18nKeys.events.metadataEmpty)}</p>
  }

  const visibleEntries = entries.slice(0, 4)
  const remaining = entries.length - visibleEntries.length
  const valueFallback = t(photoUsageI18nKeys.events.metadataValueUnknown)

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {visibleEntries.map(([key, value]) => (
        <span
          key={key}
          className="rounded-full border border-border/50 bg-background/60 px-2 py-0.5 text-xs text-text-secondary"
        >
          {key}: {formatMetadataValue(value, valueFallback)}
        </span>
      ))}
      {remaining > 0 && (
        <span className="text-xs text-text-tertiary">
          {t(photoUsageI18nKeys.events.metadataMore, { count: remaining })}
        </span>
      )}
    </div>
  )
}

function UsageEventSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex-1 space-y-2">
        <div className="h-4 w-1/3 animate-pulse rounded bg-border/50" />
        <div className="h-3 w-3/5 animate-pulse rounded bg-border/40" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-border/30" />
      </div>
      <div className="h-6 w-24 animate-pulse rounded bg-border/40" />
      <div className="h-4 w-32 animate-pulse rounded bg-border/30" />
    </div>
  )
}

function formatMetadataValue(value: unknown, fallback: string): string {
  if (value == null) {
    return fallback
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatDateLabel(value: string, formatter: Intl.DateTimeFormat): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return formatter.format(date)
}

function formatRelativeLabel(value: string, formatter: Intl.RelativeTimeFormat): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  const diffMs = date.getTime() - Date.now()
  const diffMinutes = Math.round(diffMs / (1000 * 60))
  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, 'minute')
  }
  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, 'hour')
  }
  const diffDays = Math.round(diffHours / 24)
  return formatter.format(diffDays, 'day')
}
