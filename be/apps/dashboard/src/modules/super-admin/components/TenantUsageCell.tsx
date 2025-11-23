import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { BILLING_USAGE_EVENT_CONFIG } from '~/modules/photos/constants'
import type { BillingUsageEventType } from '~/modules/photos/types'

import type { SuperAdminTenantSummary } from '../types'

export function TenantUsageCell({ usageTotals }: { usageTotals: SuperAdminTenantSummary['usageTotals'] }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language ?? i18n.resolvedLanguage ?? 'en'
  const numberFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        notation: 'compact',
        maximumFractionDigits: 1,
      }),
    [locale],
  )

  const entries = useMemo(() => {
    const totalsMap = new Map<BillingUsageEventType, { total: number; unit: 'count' | 'byte' }>()
    usageTotals?.forEach((entry) => {
      totalsMap.set(entry.eventType as BillingUsageEventType, {
        total: entry.totalQuantity ?? 0,
        unit: entry.unit,
      })
    })

    return (Object.keys(BILLING_USAGE_EVENT_CONFIG) as BillingUsageEventType[]).map((eventType) => {
      const config = BILLING_USAGE_EVENT_CONFIG[eventType]
      const usage = totalsMap.get(eventType)
      return {
        eventType,
        label: t(config.labelKey),
        tone: config.tone,
        total: usage?.total ?? 0,
        unit: usage?.unit ?? 'count',
      }
    })
  }, [usageTotals, t])

  const activeEntries = entries.filter((entry) => entry.total > 0)

  if (activeEntries.length === 0) {
    return <p className="text-text-tertiary text-xs">{t('superadmin.tenants.usage.empty')}</p>
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {activeEntries.map((entry) => (
        <UsageBadge
          key={`${entry.eventType}`}
          label={entry.label}
          tone={entry.tone}
          value={entry.total}
          unit={entry.unit}
          formatter={numberFormatter}
        />
      ))}
    </div>
  )
}

type UsageBadgeProps = {
  label: string
  tone: (typeof BILLING_USAGE_EVENT_CONFIG)[BillingUsageEventType]['tone']
  value: number
  unit: 'count' | 'byte'
  formatter: Intl.NumberFormat
}

function UsageBadge({ label, tone, value, unit, formatter }: UsageBadgeProps) {
  const toneClass =
    tone === 'accent'
      ? 'bg-emerald-500/10 text-emerald-200 border-emerald-500/30'
      : tone === 'warning'
        ? 'bg-rose-500/10 text-rose-200 border-rose-500/30'
        : 'bg-fill/30 text-text-secondary border-border/40'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${toneClass}`}
    >
      <span className="uppercase tracking-wide text-[10px] text-text-tertiary/80">{label}</span>
      <span className="text-xs font-semibold text-text">{formatUsageValue(value, unit, formatter)}</span>
    </span>
  )
}

function formatUsageValue(value: number, unit: 'count' | 'byte', formatter: Intl.NumberFormat): string {
  if (!Number.isFinite(value)) {
    return '0'
  }
  if (unit === 'byte') {
    return formatBytes(value)
  }
  return formatter.format(value)
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}
