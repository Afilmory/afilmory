import { Button, Modal, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@afilmory/ui'
import { Spring } from '@afilmory/utils'
import { RefreshCcwIcon } from 'lucide-react'
import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'

import { useSuperAdminTenantsQuery, useUpdateTenantBanMutation, useUpdateTenantPlanMutation } from '../hooks'
import type { BillingPlanDefinition, SuperAdminTenantSummary } from '../types'
import { TenantDetailModal } from './TenantDetailModal'
import { TenantUsageCell } from './TenantUsageCell'

const DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function SuperAdminTenantManager() {
  const tenantsQuery = useSuperAdminTenantsQuery()
  const updatePlanMutation = useUpdateTenantPlanMutation()
  const updateBanMutation = useUpdateTenantBanMutation()
  const { t } = useTranslation()

  const { isLoading } = tenantsQuery
  const { isError } = tenantsQuery
  const { data } = tenantsQuery

  const plans = data?.plans ?? []
  const tenants = data?.tenants ?? []

  const handlePlanChange = (tenant: SuperAdminTenantSummary, planId: string) => {
    if (planId === tenant.planId) {
      return
    }
    updatePlanMutation.mutate(
      { tenantId: tenant.id, planId },
      {
        onSuccess: () => {
          toast.success(t('superadmin.tenants.toast.plan-success', { name: tenant.name, planId }))
        },
        onError: (error) => {
          toast.error(t('superadmin.tenants.toast.plan-error'), {
            description: error instanceof Error ? error.message : t('common.retry-later'),
          })
        },
      },
    )
  }

  const handleToggleBanned = (tenant: SuperAdminTenantSummary) => {
    const next = !tenant.banned
    updateBanMutation.mutate(
      { tenantId: tenant.id, banned: next },
      {
        onSuccess: () => {
          toast.success(
            next
              ? t('superadmin.tenants.toast.ban-success', { name: tenant.name })
              : t('superadmin.tenants.toast.unban-success', { name: tenant.name }),
          )
        },
        onError: (error) => {
          toast.error(t('superadmin.tenants.toast.ban-error'), {
            description: error instanceof Error ? error.message : t('common.retry-later'),
          })
        },
      },
    )
  }

  const isPlanUpdating = (tenantId: string) =>
    updatePlanMutation.isPending && updatePlanMutation.variables?.tenantId === tenantId

  const isBanUpdating = (tenantId: string) =>
    updateBanMutation.isPending && updateBanMutation.variables?.tenantId === tenantId

  if (isError) {
    return (
      <LinearBorderPanel className="p-6 text-sm text-red">
        {t('superadmin.tenants.error.loading', {
          reason: tenantsQuery.error instanceof Error ? tenantsQuery.error.message : t('common.unknown-error'),
        })}
      </LinearBorderPanel>
    )
  }

  if (isLoading) {
    return <TenantSkeleton />
  }

  return (
    <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={Spring.presets.smooth}>
      <header className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1"
          onClick={() => tenantsQuery.refetch()}
          disabled={tenantsQuery.isFetching}
        >
          <RefreshCcwIcon className="size-4" />
          <span>
            {tenantsQuery.isFetching ? t('superadmin.tenants.refresh.loading') : t('superadmin.tenants.refresh.button')}
          </span>
        </Button>
      </header>

      <LinearBorderPanel className="p-6 bg-background-secondary mt-4">
        {tenants.length === 0 ? (
          <p className="text-text-secondary text-sm">{t('superadmin.tenants.empty')}</p>
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="min-w-full divide-y divide-border/40 text-sm">
              <thead>
                <tr className="text-text-tertiary text-xs uppercase tracking-wide">
                  <th className="px-3 py-2 text-left">{t('superadmin.tenants.table.tenant')}</th>
                  <th className="px-3 py-2 text-left">{t('superadmin.tenants.table.plan')}</th>
                  <th className="px-3 py-2 text-left">{t('superadmin.tenants.table.usage')}</th>
                  <th className="px-3 py-2 text-center">{t('superadmin.tenants.table.status')}</th>
                  <th className="px-3 py-2 text-center">{t('superadmin.tenants.table.ban')}</th>
                  <th className="px-3 py-2 text-left">{t('superadmin.tenants.table.created')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {tenants.map((tenant) => (
                  <tr key={tenant.id}>
                    <td className="px-3 py-3 align-top">
                      <div className="font-medium text-text">{tenant.name}</div>
                      <div className="text-text-secondary text-xs">{tenant.slug}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <PlanSelector
                        value={tenant.planId}
                        plans={plans}
                        disabled={isPlanUpdating(tenant.id)}
                        onChange={(nextPlan) => handlePlanChange(tenant, nextPlan)}
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => Modal.present(TenantDetailModal, { tenant })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            Modal.present(TenantDetailModal, { tenant })
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <TenantUsageCell usageTotals={tenant.usageTotals} />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center align-top">
                      <StatusBadge status={tenant.status} banned={tenant.banned} />
                    </td>
                    <td className="px-3 py-1 text-center align-top">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className={tenant.banned ? 'text-rose-400' : undefined}
                        onClick={() => handleToggleBanned(tenant)}
                        disabled={isBanUpdating(tenant.id)}
                      >
                        {isBanUpdating(tenant.id)
                          ? t('superadmin.tenants.button.processing')
                          : tenant.banned
                            ? t('superadmin.tenants.button.unban')
                            : t('superadmin.tenants.button.ban')}
                      </Button>
                    </td>
                    <td className="px-3 py-3 align-top text-text-secondary text-xs">
                      {formatDateLabel(tenant.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </LinearBorderPanel>
    </m.div>
  )
}

function PlanSelector({
  value,
  plans,
  disabled,
  onChange,
}: {
  value: string
  plans: BillingPlanDefinition[]
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1">
      <Select value={value} onValueChange={(value) => onChange(value)} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder={t('superadmin.tenants.plan.placeholder')} />
        </SelectTrigger>
        <SelectContent>
          {plans.map((plan) => (
            <SelectItem value={plan.id} key={plan.id}>
              {plan.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <PlanDescription plan={plans.find((plan) => plan.id === value)} />
    </div>
  )
}

function PlanDescription({ plan }: { plan: BillingPlanDefinition | undefined }) {
  if (!plan) {
    return null
  }
  return <p className="text-text-tertiary text-xs">{plan.description}</p>
}

function StatusBadge({ status, banned }: { status: SuperAdminTenantSummary['status']; banned: boolean }) {
  const { t } = useTranslation()
  if (banned) {
    return (
      <span className="bg-rose-500/10 text-rose-400 rounded-full px-2 py-0.5 text-xs">
        {t('superadmin.tenants.status.banned')}
      </span>
    )
  }
  if (status === 'active') {
    return (
      <span className="bg-emerald-500/10 text-emerald-400 rounded-full px-2 py-0.5 text-xs">
        {t('superadmin.tenants.status.active')}
      </span>
    )
  }
  if (status === 'suspended') {
    return (
      <span className="bg-amber-500/10 text-amber-400 rounded-full px-2 py-0.5 text-xs">
        {t('superadmin.tenants.status.suspended')}
      </span>
    )
  }
  return (
    <span className="bg-slate-500/10 text-slate-400 rounded-full px-2 py-0.5 text-xs">
      {t('superadmin.tenants.status.inactive')}
    </span>
  )
}

function formatDateLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return DATE_FORMATTER.format(date)
}

function TenantSkeleton() {
  return (
    <LinearBorderPanel className="space-y-4 p-6">
      <div className="bg-fill/40 h-6 w-1/3 animate-pulse rounded" />
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={`tenant-skeleton-${index}`} className="bg-fill/20 h-14 animate-pulse rounded" />
        ))}
      </div>
    </LinearBorderPanel>
  )
}
