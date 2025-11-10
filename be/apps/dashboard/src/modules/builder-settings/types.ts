import type { SchemaFormState, SchemaFormValue, UiSchema } from '../schema-form/types'

export type BuilderSettingField =
  | 'system.processing.defaultConcurrency'
  | 'system.processing.enableLivePhotoDetection'
  | 'system.processing.digestSuffixLength'
  | 'system.processing.supportedFormats'
  | 'system.observability.showProgress'
  | 'system.observability.showDetailedStats'
  | 'system.observability.logging.level'
  | 'system.observability.logging.verbose'
  | 'system.observability.logging.outputToFile'
  | 'system.observability.performance.worker.workerCount'
  | 'system.observability.performance.worker.workerConcurrency'
  | 'system.observability.performance.worker.useClusterMode'
  | 'system.observability.performance.worker.timeout'

export type BuilderSettingValue = string | number | boolean | null

export type BuilderSettingValueState = SchemaFormState<BuilderSettingField>

export interface BuilderSettingUiSchemaResponse {
  readonly schema: UiSchema<BuilderSettingField>
  readonly values: Partial<Record<BuilderSettingField, BuilderSettingValue>>
}

export interface BuilderSystemSettingsPayload {
  readonly processing: {
    readonly defaultConcurrency: number
    readonly enableLivePhotoDetection: boolean
    readonly digestSuffixLength: number
    readonly supportedFormats?: readonly string[]
  }
  readonly observability: {
    readonly showProgress: boolean
    readonly showDetailedStats: boolean
    readonly logging: {
      readonly level: 'info' | 'warn' | 'error' | 'debug'
      readonly verbose: boolean
      readonly outputToFile: boolean
    }
    readonly performance: {
      readonly worker: {
        readonly workerCount: number
        readonly workerConcurrency: number
        readonly useClusterMode: boolean
        readonly timeout: number
      }
    }
  }
}

export interface BuilderSettingsPayload {
  readonly system: BuilderSystemSettingsPayload
}

export type BuilderSettingsFormState = Record<BuilderSettingField, SchemaFormValue>
