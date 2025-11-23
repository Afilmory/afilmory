import { Button, Input, Switch, Textarea } from '@afilmory/ui'
import { Spring } from '@afilmory/utils'
import { m } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'
import { PageTabs } from '~/components/navigation/PageTabs'
import {
  SuperAdminSettingsForm,
  useSuperAdminSettingsQuery,
  useUpdateSuperAdminSettingsMutation,
} from '~/modules/super-admin'
import type { UpdateSuperAdminSettingsPayload } from '~/modules/super-admin/types'

const APP_PLAN_SECTION_IDS = ['billing-plan-settings'] as const
const STORAGE_PLAN_SECTION_IDS = ['storage-plan-settings'] as const
const TABS = [
  { id: 'app', labelKey: 'superadmin.plans.tabs.app', sections: APP_PLAN_SECTION_IDS },
  { id: 'storage', labelKey: 'superadmin.plans.tabs.storage', sections: STORAGE_PLAN_SECTION_IDS },
] as const

export function Component() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]['id']>('app')
  const active = TABS.find((tab) => tab.id === activeTab) ?? TABS[0]

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={Spring.presets.smooth}
      className="space-y-6"
    >
      <header className="space-y-2">
        <h1 className="text-text text-2xl font-semibold">{t('superadmin.plans.title')}</h1>
        <p className="text-text-secondary text-sm">{t('superadmin.plans.description')}</p>
      </header>

      <PageTabs
        activeId={activeTab}
        onSelect={(id) => setActiveTab(id as typeof activeTab)}
        items={TABS.map((tab) => ({
          id: tab.id,
          labelKey: tab.labelKey,
        }))}
      />

      {active.id === 'app' ? <SuperAdminSettingsForm visibleSectionIds={active.sections} /> : <StoragePlanEditor />}
    </m.div>
  )
}

type StoragePlanRow = {
  id: string
  name: string
  description: string
  capacityGb: string
  isActive: boolean
  monthlyPrice: string
  currency: string
  creemProductId: string
}

function bytesToGb(bytes: unknown): string {
  if (bytes === null || bytes === undefined) return ''
  const num = Number(bytes)
  if (!Number.isFinite(num)) return ''
  return (num / 1024 / 1024 / 1024).toFixed(2)
}

function gbToBytes(value: string): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.round(parsed * 1024 * 1024 * 1024))
}

function StoragePlanEditor() {
  const { t } = useTranslation()
  const query = useSuperAdminSettingsQuery()
  const mutation = useUpdateSuperAdminSettingsMutation()

  const rawValues = useMemo(() => {
    const payload = query.data
    if (!payload) return null
    if ('values' in payload && payload.values) return payload.values
    if ('settings' in payload && payload.settings) return payload.settings
    return null
  }, [query.data])

  type StoragePlanCatalogEntry = {
    name?: string
    description?: string | null
    capacityBytes?: number | null
    isActive?: boolean
  }
  type StoragePlanPricingEntry = { monthlyPrice?: number | null; currency?: string | null }
  type StoragePlanProductEntry = { creemProductId?: string | null }

  const parsed = useMemo(() => {
    const catalog = (rawValues?.storagePlanCatalog as Record<string, StoragePlanCatalogEntry> | undefined) ?? {}
    const pricing = (rawValues?.storagePlanPricing as Record<string, StoragePlanPricingEntry> | undefined) ?? {}
    const products = (rawValues?.storagePlanProducts as Record<string, StoragePlanProductEntry> | undefined) ?? {}

    return {
      rows: Object.entries(catalog).map(([id, entry]) => ({
        id,
        name: entry?.name ?? '',
        description: entry?.description ?? '',
        capacityGb: bytesToGb(entry?.capacityBytes),
        isActive: entry?.isActive !== false,
        monthlyPrice: pricing[id]?.monthlyPrice?.toString() ?? '',
        currency: pricing[id]?.currency ?? '',
        creemProductId: products[id]?.creemProductId ?? '',
      })),
    }
  }, [rawValues])

  const [rows, setRows] = useState<StoragePlanRow[]>(parsed.rows)

  useEffect(() => {
    setRows(parsed.rows)
  }, [parsed])

  const errors = useMemo(() => {
    return rows.map((row) => {
      const rowErrors: string[] = []
      if (!row.id.trim()) rowErrors.push(t('superadmin.plans.storage.validation.id'))
      if (!row.name.trim()) rowErrors.push(t('superadmin.plans.storage.validation.name'))
      if (row.capacityGb && !Number.isFinite(Number(row.capacityGb))) {
        rowErrors.push(t('superadmin.plans.storage.validation.capacity'))
      }
      if (row.monthlyPrice && !Number.isFinite(Number(row.monthlyPrice))) {
        rowErrors.push(t('superadmin.plans.storage.validation.price'))
      }
      return rowErrors
    })
  }, [rows, t])

  const hasErrors = errors.some((list) => list.length > 0)

  const payload = useMemo((): UpdateSuperAdminSettingsPayload => {
    const catalog: Record<string, StoragePlanCatalogEntry> = {}
    const pricing: Record<string, StoragePlanPricingEntry> = {}
    const products: Record<string, StoragePlanProductEntry> = {}

    rows.forEach((row) => {
      const id = row.id.trim()
      if (!id) return
      catalog[id] = {
        name: row.name.trim(),
        description: row.description.trim() || null,
        capacityBytes: gbToBytes(row.capacityGb),
        isActive: row.isActive,
      }

      if (row.monthlyPrice || row.currency) {
        const parsedPrice = Number(row.monthlyPrice)
        pricing[id] = {
          monthlyPrice: Number.isFinite(parsedPrice) ? parsedPrice : null,
          currency: row.currency.trim() || null,
        }
      }

      if (row.creemProductId.trim()) {
        products[id] = { creemProductId: row.creemProductId.trim() }
      }
    })

    return {
      storagePlanCatalog: catalog as Record<string, unknown>,
      storagePlanPricing: pricing as Record<string, unknown>,
      storagePlanProducts: products as Record<string, unknown>,
    } as UpdateSuperAdminSettingsPayload
  }, [rows])

  const baselinePayload = useMemo(() => {
    const catalog = (rawValues?.storagePlanCatalog as Record<string, StoragePlanCatalogEntry> | undefined) ?? {}
    const pricing = (rawValues?.storagePlanPricing as Record<string, StoragePlanPricingEntry> | undefined) ?? {}
    const products = (rawValues?.storagePlanProducts as Record<string, StoragePlanProductEntry> | undefined) ?? {}

    return {
      storagePlanCatalog: catalog,
      storagePlanPricing: pricing,
      storagePlanProducts: products,
    }
  }, [rawValues])

  const hasChanges = useMemo(
    () => JSON.stringify(payload) !== JSON.stringify(baselinePayload),
    [payload, baselinePayload],
  )

  const handleRowChange = (id: string, patch: Partial<StoragePlanRow>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const handleAdd = () => {
    setRows((prev) => [
      ...prev,
      {
        id: `managed-${prev.length + 1}`,
        name: '',
        description: '',
        capacityGb: '',
        isActive: true,
        monthlyPrice: '',
        currency: 'USD',
        creemProductId: '',
      },
    ])
  }

  const handleRemove = (id: string) => {
    setRows((prev) => prev.filter((row) => row.id !== id))
  }

  const handleSave = () => {
    if (hasErrors || rows.length === 0) {
      return
    }
    mutation.mutate(payload)
  }

  if (query.isLoading) {
    return (
      <LinearBorderPanel className="space-y-3 p-6">
        <div className="bg-fill/40 h-6 w-32 animate-pulse rounded-full" />
        <div className="space-y-3">
          {[1, 2].map((key) => (
            <div key={key} className="bg-fill/30 h-24 animate-pulse rounded-xl" />
          ))}
        </div>
      </LinearBorderPanel>
    )
  }

  if (query.isError || !rawValues) {
    return (
      <LinearBorderPanel className="space-y-2 p-6">
        <h2 className="text-text text-lg font-semibold">{t('superadmin.plans.storage.title')}</h2>
        <p className="text-red text-sm">
          {t('superadmin.plans.storage.error', {
            reason: query.error instanceof Error ? query.error.message : t('common.unknown-error'),
          })}
        </p>
      </LinearBorderPanel>
    )
  }

  return (
    <LinearBorderPanel className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-text text-lg font-semibold">{t('superadmin.plans.storage.title')}</h2>
          <p className="text-text-secondary text-sm">{t('superadmin.plans.storage.description')}</p>
        </div>
        <div className="flex items-center gap-2 mb-4 ml-auto">
          <Button variant="ghost" onClick={handleAdd}>
            {t('superadmin.plans.storage.actions.add')}
          </Button>
          <Button disabled={mutation.isPending || hasErrors || !hasChanges} onClick={handleSave}>
            {t('superadmin.plans.storage.actions.save')}
          </Button>
        </div>
      </div>

      {hasErrors ? <div className="text-red text-sm">{t('superadmin.plans.storage.validation.block')}</div> : null}

      <div className="space-y-4">
        {rows.length === 0 ? (
          <p className="text-text-secondary text-sm">{t('superadmin.plans.storage.empty')}</p>
        ) : null}
        {rows.map((row, idx) => (
          <div key={row.id} className="border-fill/60 bg-fill/5 rounded-xl border p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-text text-xs font-medium">{t('superadmin.plans.storage.fields.id')}</label>
                    <Input
                      value={row.id}
                      onInput={(e) => handleRowChange(row.id, { id: (e.target as HTMLInputElement).value })}
                      placeholder="managed-5gb"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-text text-xs font-medium">{t('superadmin.plans.storage.fields.name')}</label>
                    <Input
                      value={row.name}
                      onInput={(e) => handleRowChange(row.id, { name: (e.target as HTMLInputElement).value })}
                      placeholder={t('superadmin.plans.storage.fields.placeholder.name')}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-text text-xs font-medium">
                    {t('superadmin.plans.storage.fields.description')}
                  </label>
                  <Textarea
                    rows={2}
                    value={row.description}
                    onInput={(e) => handleRowChange(row.id, { description: (e.target as HTMLTextAreaElement).value })}
                    placeholder={t('superadmin.plans.storage.fields.placeholder.description')}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="space-y-1">
                    <label className="text-text text-xs font-medium">
                      {t('superadmin.plans.storage.fields.capacity')}
                    </label>
                    <Input
                      inputMode="decimal"
                      type="text"
                      value={row.capacityGb}
                      onInput={(e) => handleRowChange(row.id, { capacityGb: (e.target as HTMLInputElement).value })}
                      placeholder="5.00"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-text text-xs font-medium">
                      {t('superadmin.plans.storage.fields.price')}
                    </label>
                    <Input
                      inputMode="decimal"
                      type="text"
                      value={row.monthlyPrice}
                      onInput={(e) => handleRowChange(row.id, { monthlyPrice: (e.target as HTMLInputElement).value })}
                      placeholder="0.99"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-text text-xs font-medium">
                      {t('superadmin.plans.storage.fields.currency')}
                    </label>
                    <Input
                      value={row.currency}
                      onInput={(e) => handleRowChange(row.id, { currency: (e.target as HTMLInputElement).value })}
                      placeholder="USD"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-text text-xs font-medium">
                      {t('superadmin.plans.storage.fields.creem')}
                    </label>
                    <Input
                      value={row.creemProductId}
                      onInput={(e) => handleRowChange(row.id, { creemProductId: (e.target as HTMLInputElement).value })}
                      placeholder="prod_xxx"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={row.isActive}
                      onCheckedChange={(next) => handleRowChange(row.id, { isActive: next })}
                    />
                    <span className="text-text-secondary text-sm">{t('superadmin.plans.storage.fields.active')}</span>
                  </div>

                  <Button variant="ghost" onClick={() => handleRemove(row.id)} disabled={rows.length === 1}>
                    {t('superadmin.plans.storage.actions.remove')}
                  </Button>
                </div>

                {errors[idx] && errors[idx]!.length > 0 ? (
                  <ul className="text-red text-xs">
                    {errors[idx]!.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      {mutation.isError ? (
        <p className="text-red text-sm">
          {t('superadmin.plans.storage.error', {
            reason: mutation.error instanceof Error ? mutation.error.message : t('common.unknown-error'),
          })}
        </p>
      ) : null}

      {mutation.isSuccess && !mutation.isPending ? (
        <p className="text-text-secondary text-sm">{t('superadmin.plans.storage.saved')}</p>
      ) : null}
    </LinearBorderPanel>
  )
}
