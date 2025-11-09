import { Button } from '@afilmory/ui'
import { Spring } from '@afilmory/utils'
import { m } from 'motion/react'
import { startTransition, useCallback, useEffect, useId, useMemo, useState } from 'react'

import { LinearBorderPanel } from '~/components/common/GlassPanel'
import { MainPageLayout, useMainPageLayout } from '~/components/layouts/MainPageLayout'

import type { SchemaFormRendererProps } from '../../schema-form/SchemaFormRenderer'
import { SchemaFormRenderer } from '../../schema-form/SchemaFormRenderer'
import type { SchemaFormValue } from '../../schema-form/types'
import { collectFieldNodes } from '../../schema-form/utils'
import { useSettingUiSchemaQuery, useUpdateSettingsMutation } from '../hooks'
import type { SettingEntryInput, SettingUiSchemaResponse, SettingValueState } from '../types'

const providerGroupVisibility: Record<string, string> = {
  'builder-storage-s3': 's3',
  'builder-storage-github': 'github',
  'builder-storage-local': 'local',
  'builder-storage-eagle': 'eagle',
}

function buildInitialState(
  schema: SettingUiSchemaResponse['schema'],
  values: SettingUiSchemaResponse['values'],
): SettingValueState<string> {
  const state: SettingValueState<string> = {} as SettingValueState<string>
  const fields = collectFieldNodes(schema.sections)

  for (const field of fields) {
    const rawValue = values[field.key]
    state[field.key] = typeof rawValue === 'string' ? rawValue : ''
  }

  return state
}

export function SettingsForm() {
  const { data, isLoading, isError, error } = useSettingUiSchemaQuery()
  const updateSettingsMutation = useUpdateSettingsMutation()
  const { setHeaderActionState } = useMainPageLayout()
  const formId = useId()
  const [formState, setFormState] = useState<SettingValueState<string>>({} as SettingValueState<string>)
  const [initialState, setInitialState] = useState<SettingValueState<string> | null>(null)

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

  const providerValue = formState['builder.storage.provider'] ?? ''

  const shouldRenderNode = useCallback<NonNullable<SchemaFormRendererProps<string>['shouldRenderNode']>>(
    (node) => {
      if (node.type !== 'group') {
        return true
      }

      const expectedProvider = providerGroupVisibility[node.id]
      if (!expectedProvider) {
        return true
      }

      return expectedProvider === providerValue
    },
    [providerValue],
  )

  const changedEntries = useMemo<SettingEntryInput[]>(() => {
    const entries: SettingEntryInput[] = []

    if (!initialState) {
      return entries
    }

    for (const [key, value] of Object.entries(formState)) {
      if (initialState[key] !== value) {
        entries.push({ key, value })
      }
    }

    return entries
  }, [formState, initialState])

  const handleChange = useCallback((key: string, value: SchemaFormValue) => {
    setFormState((prev) => ({
      ...prev,
      [key]: typeof value === 'string' ? value : value == null ? '' : String(value),
    }))
  }, [])

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
  }, [isLoading, isError, changedEntries.length, setHeaderActionState, updateSettingsMutation.isPending])

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
            <span>{`无法加载设置：${error instanceof Error ? error.message : '未知错误'}`}</span>
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
        <SchemaFormRenderer
          schema={schema}
          values={formState}
          onChange={handleChange}
          shouldRenderNode={shouldRenderNode}
        />

        <div className="flex justify-end">
          <div className="text-text-tertiary text-xs">
            {mutationErrorMessage
              ? `保存失败：${mutationErrorMessage}`
              : updateSettingsMutation.isSuccess && changedEntries.length === 0
                ? '保存成功，设置已同步'
                : changedEntries.length > 0
                  ? `有 ${changedEntries.length} 项设置待保存`
                  : '所有设置已同步'}
          </div>
        </div>
      </m.form>
    </>
  )
}
