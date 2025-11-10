import { Button } from '@afilmory/ui'
import { Spring } from '@afilmory/utils'
import { m } from 'motion/react'
import { startTransition, useCallback, useEffect, useId, useMemo, useState } from 'react'

import { LinearBorderPanel } from '~/components/common/GlassPanel'
import { MainPageLayout, useMainPageLayout } from '~/components/layouts/MainPageLayout'

import { SchemaFormRenderer } from '../../schema-form/SchemaFormRenderer'
import type { SchemaFormValue } from '../../schema-form/types'
import { collectFieldNodes } from '../../schema-form/utils'
import { useBuilderSettingsUiSchemaQuery, useUpdateBuilderSettingsMutation } from '../hooks'
import type {
  BuilderSettingField,
  BuilderSettingsFormState,
  BuilderSettingsPayload,
  BuilderSettingUiSchemaResponse,
} from '../types'

const NUMBER_FIELDS: ReadonlySet<BuilderSettingField> = new Set([
  'system.processing.defaultConcurrency',
  'system.processing.digestSuffixLength',
  'system.observability.performance.worker.workerCount',
  'system.observability.performance.worker.workerConcurrency',
  'system.observability.performance.worker.timeout',
])

const BOOLEAN_FIELDS: ReadonlySet<BuilderSettingField> = new Set([
  'system.processing.enableLivePhotoDetection',
  'system.observability.showProgress',
  'system.observability.showDetailedStats',
  'system.observability.logging.verbose',
  'system.observability.logging.outputToFile',
  'system.observability.performance.worker.useClusterMode',
])

const SELECT_FIELDS: ReadonlySet<BuilderSettingField> = new Set(['system.observability.logging.level'])

function coerceInitialValue(key: BuilderSettingField, rawValue: SchemaFormValue): SchemaFormValue {
  if (BOOLEAN_FIELDS.has(key)) {
    if (typeof rawValue === 'boolean') {
      return rawValue
    }
    if (typeof rawValue === 'string') {
      const normalized = rawValue.trim().toLowerCase()
      return normalized === 'true'
    }
    return false
  }

  if (NUMBER_FIELDS.has(key)) {
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      return String(rawValue)
    }
    if (typeof rawValue === 'string') {
      return rawValue
    }
    return ''
  }

  if (SELECT_FIELDS.has(key) && typeof rawValue === 'string') {
    return rawValue
  }

  if (rawValue == null) {
    return ''
  }

  if (typeof rawValue === 'string') {
    return rawValue
  }

  if (typeof rawValue === 'number') {
    return String(rawValue)
  }

  return rawValue
}

function buildInitialState(
  schema: BuilderSettingUiSchemaResponse['schema'],
  values: BuilderSettingUiSchemaResponse['values'],
): BuilderSettingsFormState {
  const fields = collectFieldNodes(schema.sections)
  const state = {} as BuilderSettingsFormState

  for (const field of fields) {
    const rawValue = values[field.key] ?? null
    state[field.key] = coerceInitialValue(field.key, rawValue)
  }

  return state
}

function parseNumber(value: SchemaFormValue, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const normalized = Number(value)
    if (Number.isFinite(normalized)) {
      return normalized
    }
  }

  return fallback
}

function parseBoolean(value: SchemaFormValue, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }

  return fallback
}

function parseString(value: SchemaFormValue, fallback = ''): string {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number') {
    return String(value)
  }
  return fallback
}

function parseFormats(value: SchemaFormValue): string[] {
  const raw = typeof value === 'string' ? value : ''
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

function buildPayload(
  state: BuilderSettingsFormState,
  baseline: BuilderSettingUiSchemaResponse['values'],
): BuilderSettingsPayload {
  const getNumber = (key: BuilderSettingField, fallback: number) => parseNumber(state[key], fallback)
  const getBoolean = (key: BuilderSettingField, fallback: boolean) => parseBoolean(state[key], fallback)
  const getString = (key: BuilderSettingField, fallback = '') => parseString(state[key], fallback)
  const formats = parseFormats(state['system.processing.supportedFormats'])
  const rawLevel = getString('system.observability.logging.level', 'info').toLowerCase()
  const loggingLevel: 'info' | 'warn' | 'error' | 'debug' =
    rawLevel === 'warn' || rawLevel === 'error' || rawLevel === 'debug' ? (rawLevel as any) : 'info'

  return {
    system: {
      processing: {
        defaultConcurrency: getNumber(
          'system.processing.defaultConcurrency',
          Number(baseline['system.processing.defaultConcurrency'] ?? 10),
        ),
        enableLivePhotoDetection: getBoolean(
          'system.processing.enableLivePhotoDetection',
          Boolean(baseline['system.processing.enableLivePhotoDetection']),
        ),
        digestSuffixLength: getNumber('system.processing.digestSuffixLength', 0),
        supportedFormats: formats.length > 0 ? formats : undefined,
      },
      observability: {
        showProgress: getBoolean('system.observability.showProgress', true),
        showDetailedStats: getBoolean('system.observability.showDetailedStats', true),
        logging: {
          level: loggingLevel,
          verbose: getBoolean('system.observability.logging.verbose', false),
          outputToFile: getBoolean('system.observability.logging.outputToFile', false),
        },
        performance: {
          worker: {
            workerCount: getNumber('system.observability.performance.worker.workerCount', 4),
            workerConcurrency: getNumber('system.observability.performance.worker.workerConcurrency', 2),
            useClusterMode: getBoolean('system.observability.performance.worker.useClusterMode', true),
            timeout: getNumber('system.observability.performance.worker.timeout', 30000),
          },
        },
      },
    },
  }
}

function hasStateChanges(current: BuilderSettingsFormState, baseline: BuilderSettingsFormState | null) {
  if (!baseline) {
    return false
  }

  return Object.entries(current).some(([key, value]) => !Object.is(value, baseline[key as BuilderSettingField]))
}

export function BuilderSettingsForm() {
  const { data, isLoading, isError, error } = useBuilderSettingsUiSchemaQuery()
  const updateMutation = useUpdateBuilderSettingsMutation()
  const { setHeaderActionState } = useMainPageLayout()
  const formId = useId()

  const [formState, setFormState] = useState<BuilderSettingsFormState>({} as BuilderSettingsFormState)
  const [initialState, setInitialState] = useState<BuilderSettingsFormState | null>(null)

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

  const dirty = hasStateChanges(formState, initialState)

  const handleChange = useCallback((key: BuilderSettingField, value: SchemaFormValue) => {
    setFormState((prev) => ({
      ...prev,
      [key]: value,
    }))
  }, [])

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()
    if (!data || !initialState || updateMutation.isPending || !dirty) {
      return
    }

    const payload = buildPayload(formState, data.values)
    updateMutation.mutate(payload, {
      onSuccess: () => {
        setInitialState(formState)
      },
    })
  }

  const mutationMessage = useMemo(() => {
    if (updateMutation.isError) {
      const reason = updateMutation.error instanceof Error ? updateMutation.error.message : '保存失败'
      return `保存失败：${reason}`
    }
    if (updateMutation.isPending) {
      return '正在保存构建器设置…'
    }
    if (!dirty && updateMutation.isSuccess) {
      return '保存成功，配置已更新'
    }
    if (dirty) {
      return '您有尚未保存的更改'
    }
    return '所有设置已同步'
  }, [dirty, updateMutation.error, updateMutation.isError, updateMutation.isPending, updateMutation.isSuccess])

  useEffect(() => {
    const disabled = isLoading || isError || !dirty
    setHeaderActionState((prev) => {
      const next = {
        disabled,
        loading: updateMutation.isPending,
      }
      return prev.disabled === next.disabled && prev.loading === next.loading ? prev : next
    })

    return () => {
      setHeaderActionState({ disabled: false, loading: false })
    }
  }, [dirty, isError, isLoading, setHeaderActionState, updateMutation.isPending])

  const headerActionPortal = (
    <MainPageLayout.Actions>
      <Button
        type="submit"
        form={formId}
        disabled={!dirty}
        isLoading={updateMutation.isPending}
        loadingText="保存中…"
        variant="primary"
        size="sm"
      >
        保存修改
      </Button>
    </MainPageLayout.Actions>
  )

  if (isLoading || !data || !initialState) {
    return (
      <>
        {headerActionPortal}
        <LinearBorderPanel className="p-6">
          <div className="space-y-4">
            <div className="bg-fill/40 h-6 w-1/2 animate-pulse rounded" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="bg-fill/30 h-20 animate-pulse rounded-lg" />
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
          <div className="text-red flex items-center gap-2 text-sm">
            <i className="i-mingcute-close-circle-fill text-lg" />
            <span>{`无法加载构建器设置：${error instanceof Error ? error.message : '未知错误'}`}</span>
          </div>
        </LinearBorderPanel>
      </>
    )
  }

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
        <SchemaFormRenderer schema={data.schema} values={formState} onChange={handleChange} />

        <div className="flex justify-end">
          <p className="text-text-tertiary text-xs">{mutationMessage}</p>
        </div>
      </m.form>
    </>
  )
}
