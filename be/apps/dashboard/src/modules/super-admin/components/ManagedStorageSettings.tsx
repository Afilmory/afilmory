import { Button, Label, Modal } from '@afilmory/ui'
import { nanoid } from 'nanoid'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'
import type { StorageProvider } from '~/modules/storage-providers'
import { useStorageProviderSchemaQuery } from '~/modules/storage-providers'
import { ProviderEditModal } from '~/modules/storage-providers/components/ProviderEditModal'
import { storageProvidersI18nKeys } from '~/modules/storage-providers/constants'
import {
  createEmptyProvider,
  normalizeStorageProviderConfig,
} from '~/modules/storage-providers/utils'

import { useSuperAdminSettingsQuery, useUpdateSuperAdminSettingsMutation } from '../hooks'
import type { UpdateSuperAdminSettingsPayload } from '../types'

function coerceManagedProviders(input: unknown): StorageProvider[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((entry) => {
      const normalized = normalizeStorageProviderConfig(entry as StorageProvider)
      const id = normalizeProviderId(normalized.id)
      if (!id) {
        return null
      }
      return { ...normalized, id }
    })
    .filter((provider): provider is StorageProvider => provider !== null)
}

const normalizeProviderId = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const ensureLocalProviderId = (value: string | null | undefined): string => {
  return normalizeProviderId(value) ?? nanoid()
}

export function ManagedStorageSettings() {
  const { t } = useTranslation()
  const schemaQuery = useStorageProviderSchemaQuery()
  const settingsQuery = useSuperAdminSettingsQuery()
  const updateSettings = useUpdateSuperAdminSettingsMutation()

  const [providers, setProviders] = useState<StorageProvider[]>([])
  const [baselineProviders, setBaselineProviders] = useState<StorageProvider[]>([])
  const [managedId, setManagedId] = useState<string | null>(null)

  const settingsSource = useMemo(() => {
    const payload = settingsQuery.data
    if (!payload) return null
    return 'values' in payload ? payload.values : payload.settings
  }, [settingsQuery.data])

  const baselineManagedId = useMemo(() => {
    const managed = settingsSource?.managedStorageProvider
    return typeof managed === 'string' && managed.trim().length > 0 ? managed.trim() : null
  }, [settingsSource])

  useEffect(() => {
    if (!settingsSource) {
      return
    }
    const rawProviders = settingsSource.managedStorageProviders
    const nextProviders = coerceManagedProviders(rawProviders)
    setProviders(nextProviders)
    setBaselineProviders(nextProviders)
    const fallbackId = baselineManagedId ?? normalizeProviderId(nextProviders[0]?.id) ?? null
    setManagedId(fallbackId)
  }, [settingsSource, baselineManagedId])

  useEffect(() => {
    if (!managedId) {
      return
    }
    const exists = providers.some((provider) => normalizeProviderId(provider.id) === managedId)
    if (!exists) {
      setManagedId(null)
    }
  }, [providers, managedId])

  const providersChanged = useMemo(
    () => JSON.stringify(baselineProviders) !== JSON.stringify(providers),
    [baselineProviders, providers],
  )
  const normalizedManagedId = normalizeProviderId(managedId)
  const managedChanged = normalizedManagedId !== baselineManagedId
  const canSave = (providersChanged || managedChanged) && !updateSettings.isPending

  const handleEdit = (provider: StorageProvider | null) => {
    const providerForm = schemaQuery.data
    if (!providerForm) return

    const seed = provider ?? createEmptyProvider(providerForm.types[0]?.value ?? 's3')
    Modal.present(
      ProviderEditModal,
      {
        provider: seed,
        activeProviderId: null,
        providerSchema: providerForm,
        onSave: (next) => {
          const normalized = normalizeStorageProviderConfig(next)
          const providerWithId: StorageProvider = { ...normalized, id: ensureLocalProviderId(normalized.id) }
          setProviders((prev) => {
            const exists = prev.some((item) => item.id === providerWithId.id)
            if (exists) {
              return prev.map((item) => (item.id === providerWithId.id ? providerWithId : item))
            }
            return [...prev, providerWithId]
          })
          setManagedId((prev) => prev ?? providerWithId.id)
        },
        onSetActive: () => {},
      },
      { dismissOnOutsideClick: false },
    )
  }

  const handleSave = () => {
    if (!providersChanged && !managedChanged) {
      return
    }

    const payload: UpdateSuperAdminSettingsPayload = {}
    if (providersChanged) {
      payload.managedStorageProviders = providers
    }
    if (managedChanged) {
      payload.managedStorageProvider = normalizedManagedId
    }
    updateSettings.mutate(payload)
  }

  if (schemaQuery.isLoading || settingsQuery.isLoading) {
    return (
      <LinearBorderPanel className="space-y-3 p-6">
        <div className="bg-fill/30 h-6 w-32 animate-pulse rounded" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-fill/20 h-16 animate-pulse rounded-lg" />
          ))}
        </div>
      </LinearBorderPanel>
    )
  }

  if (schemaQuery.isError || settingsQuery.isError) {
    return (
      <LinearBorderPanel className="space-y-2 p-6">
        <h2 className="text-text text-lg font-semibold">{t('superadmin.settings.managed-storage.title')}</h2>
        <p className="text-red text-sm">
          {t('superadmin.settings.managed-storage.error', {
            reason:
              (settingsQuery.error as Error | undefined)?.message ||
              (schemaQuery.error as Error | undefined)?.message ||
              t('common.unknown-error'),
          })}
        </p>
      </LinearBorderPanel>
    )
  }

  return (
    <LinearBorderPanel className="space-y-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-text text-lg font-semibold">{t('superadmin.settings.managed-storage.title')}</h2>
          <p className="text-text-secondary text-sm">{t('superadmin.settings.managed-storage.description')}</p>
        </div>
        <Button onClick={() => handleEdit(null)} disabled={!schemaQuery.data}>
          {t(storageProvidersI18nKeys.actions.add)}
        </Button>
      </div>

      {providers.length === 0 ? (
        <p className="text-text-secondary text-sm">{t('superadmin.settings.managed-storage.empty')}</p>
      ) : (
        <div className="space-y-3">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className={[
                'border-fill/60 bg-fill/5 flex flex-wrap items-center gap-3 rounded-lg border p-4',
                managedId === provider.id ? 'border-accent' : '',
              ].join(' ')}
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <Label className="text-text text-sm font-semibold">{provider.name || provider.id}</Label>
                  {managedId === provider.id ? (
                    <span className="text-accent border-accent/40 bg-accent/10 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                      {t('superadmin.settings.managed-storage.current')}
                    </span>
                  ) : null}
                </div>
                <p className="text-text-tertiary text-xs">
                  {t('superadmin.settings.managed-storage.type', { type: provider.type })}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => handleEdit(provider)}>
                  {t('superadmin.settings.managed-storage.actions.edit')}
                </Button>
                <Button
                  variant={managedId === provider.id ? 'secondary' : 'primary'}
                  onClick={() => setManagedId(normalizeProviderId(provider.id))}
                >
                  {managedId === provider.id
                    ? t('superadmin.settings.managed-storage.actions.selected')
                    : t('superadmin.settings.managed-storage.actions.select')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 my-4">
        <Button variant="secondary" disabled={!canSave} isLoading={updateSettings.isPending} onClick={handleSave}>
          {updateSettings.isPending
            ? t(storageProvidersI18nKeys.actions.saving)
            : t('superadmin.settings.managed-storage.actions.save')}
        </Button>
      </div>
    </LinearBorderPanel>
  )
}
