import { Button } from '@afilmory/ui'
import { Spring } from '@afilmory/utils'
import { isEqual } from 'es-toolkit'
import { m } from 'motion/react'
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'

import { SchemaFormRenderer } from '../../schema-form/SchemaFormRenderer'
import type { SchemaFormState, SchemaFormValue, UiNode } from '../../schema-form/types'
import { useSuperAdminSettingsQuery, useUpdateSuperAdminSettingsMutation } from '../hooks'
import type { SuperAdminSettingsResponse, UpdateSuperAdminSettingsPayload } from '../types'
import type { SuperAdminFieldMap } from '../utils/schema-form-adapter'
import {
  buildFieldMap,
  createFormState,
  createUpdatePayload,
  detectFormChanges,
  normalizeServerValues,
} from '../utils/schema-form-adapter'

type FormState = SchemaFormState<string>

function areFormStatesEqual(left: FormState | null, right: FormState | null): boolean {
  if (left === right) {
    return true
  }

  if (!left || !right) {
    return false
  }

  return isEqual(left, right)
}

function extractRawSettings(payload: SuperAdminSettingsResponse): Record<string, unknown> | null {
  if ('values' in payload) {
    return (payload.values ?? null) as Record<string, unknown> | null
  }

  if ('settings' in payload) {
    return (payload.settings ?? null) as Record<string, unknown> | null
  }

  return null
}

interface SuperAdminSettingsFormProps {
  visibleSectionIds?: readonly string[]
}

export function SuperAdminSettingsForm({ visibleSectionIds }: SuperAdminSettingsFormProps = {}) {
  const { data, isLoading, isError, error } = useSuperAdminSettingsQuery()
  const { t } = useTranslation()
  const [fieldMap, setFieldMap] = useState<SuperAdminFieldMap>(() => new Map())
  const [formState, setFormState] = useState<FormState | null>(null)
  const [initialState, setInitialState] = useState<FormState | null>(null)
  const lastServerStateRef = useRef<FormState | null>(null)

  const syncFromServer = useCallback((payload: SuperAdminSettingsResponse) => {
    const map = buildFieldMap(payload.schema)
    const rawValues = extractRawSettings(payload)
    const normalizedValues = normalizeServerValues(map, rawValues ?? undefined)
    const nextState = createFormState(map, normalizedValues)
    const lastState = lastServerStateRef.current

    if (lastState && areFormStatesEqual(lastState, nextState)) {
      return
    }

    lastServerStateRef.current = nextState

    startTransition(() => {
      setFieldMap(map)
      setFormState(nextState)
      setInitialState(nextState)
    })
  }, [])

  const updateMutation = useUpdateSuperAdminSettingsMutation({
    onSuccess: syncFromServer,
  })

  useEffect(() => {
    if (!data) {
      return
    }

    syncFromServer(data)
  }, [data, syncFromServer])

  const hasChanges = useMemo(
    () => detectFormChanges(fieldMap, formState, initialState),
    [fieldMap, formState, initialState],
  )

  const handleChange = useCallback(
    (key: string, value: SchemaFormValue) => {
      setFormState((prev) => {
        if (!prev || !fieldMap.has(key)) {
          return prev
        }

        if (Object.is(prev[key], value)) {
          return prev
        }

        return {
          ...prev,
          [key]: value,
        }
      })
    },
    [fieldMap],
  )

  const buildPayload = useCallback(
    (): UpdateSuperAdminSettingsPayload | null => createUpdatePayload(fieldMap, formState, initialState),
    [fieldMap, formState, initialState],
  )

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()
    const payload = buildPayload()
    if (!payload) {
      return
    }

    updateMutation.mutate(payload)
  }

  const mutationMessage = useMemo(() => {
    if (updateMutation.isError) {
      const reason =
        updateMutation.error instanceof Error
          ? updateMutation.error.message
          : t('superadmin.settings.message.unknown-error')
      return t('superadmin.settings.message.error', { reason })
    }

    if (updateMutation.isPending) {
      return t('superadmin.settings.message.saving')
    }

    if (!hasChanges && updateMutation.isSuccess) {
      return t('superadmin.settings.message.saved')
    }

    if (hasChanges) {
      return t('superadmin.settings.message.dirty')
    }

    return t('superadmin.settings.message.idle')
  }, [hasChanges, updateMutation.error, updateMutation.isError, updateMutation.isPending, updateMutation.isSuccess])

  const shouldRenderNode = useMemo(() => {
    if (!visibleSectionIds || visibleSectionIds.length === 0) {
      return
    }
    const allowed = new Set(visibleSectionIds)
    return (node: UiNode<string>) => {
      if (node.type === 'section') {
        return allowed.has(node.id)
      }
      return true
    }
  }, [visibleSectionIds])

  if (isError) {
    return (
      <LinearBorderPanel className="p-6">
        <div className="text-red text-sm">
          <span>
            {t('superadmin.settings.error.loading', {
              reason: error instanceof Error ? error.message : t('superadmin.settings.message.unknown-error'),
            })}
          </span>
        </div>
      </LinearBorderPanel>
    )
  }

  if (isLoading || !formState || !data) {
    return (
      <LinearBorderPanel className="space-y-4 p-6">
        <div className="bg-fill/40 h-6 w-1/3 animate-pulse rounded-full" />
        <div className="space-y-4">
          {['skeleton-1', 'skeleton-2', 'skeleton-3'].map((key) => (
            <div key={key} className="bg-fill/30 h-20 animate-pulse rounded-xl" />
          ))}
        </div>
      </LinearBorderPanel>
    )
  }

  const { stats } = data
  const { registrationsRemaining, totalUsers } = stats
  const remainingLabel = (() => {
    if (registrationsRemaining === null || registrationsRemaining === undefined) {
      return t('superadmin.settings.stats.unlimited')
    }

    if (typeof registrationsRemaining === 'number' && Number.isFinite(registrationsRemaining)) {
      return String(registrationsRemaining)
    }

    return '-'
  })()

  return (
    <m.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={Spring.presets.smooth}
      className="space-y-6"
    >
      <SchemaFormRenderer
        schema={data.schema}
        values={formState}
        onChange={handleChange}
        shouldRenderNode={shouldRenderNode}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <LinearBorderPanel className="p-6">
          <div className="space-y-1">
            <p className="text-text-tertiary text-xs tracking-wide uppercase">
              {t('superadmin.settings.stats.total-users')}
            </p>
            <p className="text-text text-3xl font-semibold">{typeof totalUsers === 'number' ? totalUsers : 0}</p>
          </div>
        </LinearBorderPanel>
        <LinearBorderPanel className="p-6">
          <div className="space-y-1">
            <p className="text-text-tertiary text-xs tracking-wide uppercase">
              {t('superadmin.settings.stats.remaining')}
            </p>
            <p className="text-text text-3xl font-semibold">{remainingLabel}</p>
          </div>
        </LinearBorderPanel>
      </div>

      <div className="flex items-center justify-end gap-3">
        <span className="text-text-tertiary text-xs">{mutationMessage}</span>
        <Button
          type="submit"
          disabled={!hasChanges}
          isLoading={updateMutation.isPending}
          loadingText={t('superadmin.settings.button.loading')}
          variant="primary"
          size="sm"
        >
          {t('superadmin.settings.button.save')}
        </Button>
      </div>
    </m.form>
  )
}
