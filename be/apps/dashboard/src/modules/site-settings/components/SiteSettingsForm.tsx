import { Button } from '@afilmory/ui'
import { Spring } from '@afilmory/utils'
import { m } from 'motion/react'
import { startTransition, useCallback, useEffect, useId, useMemo, useState } from 'react'

import { LinearBorderPanel } from '~/components/common/GlassPanel'
import { MainPageLayout, useMainPageLayout } from '~/components/layouts/MainPageLayout'

import { SchemaFormRenderer } from '../../schema-form/SchemaFormRenderer'
import type { SchemaFormValue, UiFieldNode } from '../../schema-form/types'
import { collectFieldNodes } from '../../schema-form/utils'
import { useSiteSettingUiSchemaQuery, useUpdateSiteSettingsMutation } from '../hooks'
import type { SiteSettingEntryInput, SiteSettingUiSchemaResponse, SiteSettingValueState } from '../types'

function coerceInitialValue(field: UiFieldNode<string>, rawValue: string | null): SchemaFormValue {
  const { component } = field

  if (component.type === 'switch') {
    if (typeof rawValue !== 'string') {
      return false
    }

    const normalized = rawValue.trim().toLowerCase()
    if (normalized === 'true') {
      return true
    }

    if (normalized === 'false') {
      return false
    }

    return false
  }

  return typeof rawValue === 'string' ? rawValue : ''
}

function buildInitialState(
  schema: SiteSettingUiSchemaResponse['schema'],
  values: SiteSettingUiSchemaResponse['values'],
): SiteSettingValueState<string> {
  const state: SiteSettingValueState<string> = {} as SiteSettingValueState<string>
  const fields = collectFieldNodes(schema.sections)

  for (const field of fields) {
    const rawValue = values[field.key] ?? null
    state[field.key] = coerceInitialValue(field, rawValue)
  }

  return state
}

function serializeValue(field: UiFieldNode<string>, value: SchemaFormValue | undefined): string {
  if (field.component.type === 'switch') {
    return value ? 'true' : 'false'
  }

  if (typeof value === 'string') {
    return value
  }

  if (value == null) {
    return ''
  }

  return String(value)
}

export function SiteSettingsForm() {
  const { data, isLoading, isError, error } = useSiteSettingUiSchemaQuery()
  const updateSettingsMutation = useUpdateSiteSettingsMutation()
  const { setHeaderActionState } = useMainPageLayout()
  const formId = useId()
  const [formState, setFormState] = useState<SiteSettingValueState<string>>({} as SiteSettingValueState<string>)
  const [initialState, setInitialState] = useState<SiteSettingValueState<string> | null>(null)

  const fieldMap = useMemo(() => {
    if (!data) {
      return new Map<string, UiFieldNode<string>>()
    }

    const fields = collectFieldNodes(data.schema.sections)
    return new Map(fields.map((field) => [field.key, field]))
  }, [data])

  useEffect(() => {
    if (!data) {
      return
    }

    const initialValues = buildInitialState(data.schema, data.values)
    startTransition(() => {
      setFormState(initialValues)
      setInitialState(initialValues)
    })
  }, [data])

  const changedEntries = useMemo<SiteSettingEntryInput[]>(() => {
    if (!initialState) {
      return []
    }

    const entries: SiteSettingEntryInput[] = []

    for (const [key, value] of Object.entries(formState)) {
      if (!Object.prototype.hasOwnProperty.call(initialState, key)) {
        continue
      }

      if (initialState[key] === value) {
        continue
      }

      const field = fieldMap.get(key)
      if (!field) {
        continue
      }

      entries.push({
        key,
        value: serializeValue(field, value),
      })
    }

    return entries
  }, [fieldMap, formState, initialState])

  const handleChange = useCallback(
    (key: string, value: SchemaFormValue) => {
      const field = fieldMap.get(key)
      const normalizedValue: SchemaFormValue = value == null ? (field?.component.type === 'switch' ? false : '') : value

      setFormState((prev) => ({
        ...prev,
        [key]: normalizedValue,
      }))
    },
    [fieldMap],
  )

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()
    if (changedEntries.length === 0 || updateSettingsMutation.isPending) {
      return
    }

    updateSettingsMutation.mutate(changedEntries)
  }

  const mutationErrorMessage =
    updateSettingsMutation.isError && updateSettingsMutation.error
      ? updateSettingsMutation.error instanceof Error
        ? updateSettingsMutation.error.message
        : '未知错误'
      : null

  useEffect(() => {
    setHeaderActionState((prev) => {
      const nextState = {
        disabled: isLoading || isError || changedEntries.length === 0,
        loading: updateSettingsMutation.isPending,
      }
      return prev.disabled === nextState.disabled && prev.loading === nextState.loading ? prev : nextState
    })

    return () => {
      setHeaderActionState({ disabled: false, loading: false })
    }
  }, [changedEntries.length, isError, isLoading, setHeaderActionState, updateSettingsMutation.isPending])

  const headerActionPortal = (
    <MainPageLayout.Actions>
      <Button
        type="submit"
        form={formId}
        disabled={changedEntries.length === 0}
        isLoading={updateSettingsMutation.isPending}
        loadingText="保存中…"
        variant="primary"
        size="sm"
      >
        保存修改
      </Button>
    </MainPageLayout.Actions>
  )

  if (isLoading) {
    return (
      <>
        {headerActionPortal}
        <LinearBorderPanel className="p-6">
          <div className="space-y-4">
            <div className="bg-fill/40 h-5 w-1/2 animate-pulse rounded-lg" />
            <div className="space-y-3">
              {['skeleton-1', 'skeleton-2', 'skeleton-3', 'skeleton-4'].map((key) => (
                <div key={key} className="bg-fill/30 h-20 animate-pulse rounded-lg" />
              ))}
            </div>
          </div>
        </LinearBorderPanel>
      </>
    )
  }

  if (isError) {
    return (
      <>
        {headerActionPortal}
        <LinearBorderPanel className="p-6">
          <div className="text-red flex items-center gap-3 text-sm">
            <i className="i-mingcute-close-circle-fill text-lg" />
            <span>{`无法加载站点设置：${error instanceof Error ? error.message : '未知错误'}`}</span>
          </div>
        </LinearBorderPanel>
      </>
    )
  }

  if (!data) {
    return headerActionPortal
  }

  const { schema } = data

  return (
    <>
      {headerActionPortal}
      <m.form
        id={formId}
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={Spring.presets.smooth}
        className="space-y-6"
      >
        <SchemaFormRenderer schema={schema} values={formState} onChange={handleChange} />

        <div className="flex justify-end">
          <div className="text-text-tertiary text-xs">
            {mutationErrorMessage
              ? `保存失败：${mutationErrorMessage}`
              : updateSettingsMutation.isSuccess && changedEntries.length === 0
                ? '保存成功，站点设置已同步'
                : changedEntries.length > 0
                  ? `有 ${changedEntries.length} 项设置待保存`
                  : '所有设置已同步'}
          </div>
        </div>
      </m.form>
    </>
  )
}
