import { Button } from '@afilmory/ui'
import { Spring } from '@afilmory/utils'
import { isEqual } from 'es-toolkit'
import { m } from 'motion/react'
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { LinearBorderPanel } from '~/components/common/GlassPanel'

import { SchemaFormRenderer } from '../../schema-form/SchemaFormRenderer'
import type { SchemaFormState, SchemaFormValue } from '../../schema-form/types'
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

export function SuperAdminSettingsForm() {
  const { data, isLoading, isError, error } = useSuperAdminSettingsQuery()
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
      const reason = updateMutation.error instanceof Error ? updateMutation.error.message : '保存失败'
      return `保存失败：${reason}`
    }

    if (updateMutation.isPending) {
      return '正在保存设置...'
    }

    if (!hasChanges && updateMutation.isSuccess) {
      return '保存成功，设置已更新'
    }

    if (hasChanges) {
      return '您有尚未保存的变更'
    }

    return '所有设置已同步'
  }, [hasChanges, updateMutation.error, updateMutation.isError, updateMutation.isPending, updateMutation.isSuccess])

  if (isError) {
    return (
      <LinearBorderPanel className="p-6">
        <div className="text-red text-sm">
          <span>{`无法加载超级管理员设置：${error instanceof Error ? error.message : '未知错误'}`}</span>
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
      return '无限制'
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
      <SchemaFormRenderer schema={data.schema} values={formState} onChange={handleChange} />

      <div className="grid gap-4 md:grid-cols-2">
        <LinearBorderPanel className="p-6">
          <div className="space-y-1">
            <p className="text-text-tertiary text-xs tracking-wide uppercase">当前用户总数</p>
            <p className="text-text text-3xl font-semibold">{typeof totalUsers === 'number' ? totalUsers : 0}</p>
          </div>
        </LinearBorderPanel>
        <LinearBorderPanel className="p-6">
          <div className="space-y-1">
            <p className="text-text-tertiary text-xs tracking-wide uppercase">剩余可注册名额</p>
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
          loadingText="保存中..."
          variant="primary"
          size="sm"
        >
          保存修改
        </Button>
      </div>
    </m.form>
  )
}
