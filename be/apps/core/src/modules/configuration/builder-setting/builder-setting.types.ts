import type { UiSchema } from '../../ui/ui-schema/ui-schema.type'

export const BUILDER_SETTING_FIELDS = [
  'system.processing.defaultConcurrency',
  'system.processing.enableLivePhotoDetection',
  'system.processing.digestSuffixLength',
  'system.processing.supportedFormats',
  'system.observability.showProgress',
  'system.observability.showDetailedStats',
  'system.observability.logging.level',
  'system.observability.logging.verbose',
  'system.observability.logging.outputToFile',
  'system.observability.performance.worker.workerCount',
  'system.observability.performance.worker.workerConcurrency',
  'system.observability.performance.worker.useClusterMode',
  'system.observability.performance.worker.timeout',
] as const

export type BuilderSettingField = (typeof BUILDER_SETTING_FIELDS)[number]

export type BuilderSettingValue = string | number | boolean | null

export type BuilderSettingValueMap = Partial<Record<BuilderSettingField, BuilderSettingValue>>

export interface BuilderSettingUiSchemaResponse {
  readonly schema: UiSchema<BuilderSettingField>
  readonly values: BuilderSettingValueMap
}

export interface BuilderSystemProcessingSettingsDto {
  readonly defaultConcurrency: number
  readonly enableLivePhotoDetection: boolean
  readonly digestSuffixLength: number
  readonly supportedFormats?: readonly string[]
}

export interface BuilderSystemLoggingSettingsDto {
  readonly level: 'info' | 'warn' | 'error' | 'debug'
  readonly verbose: boolean
  readonly outputToFile: boolean
}

export interface BuilderSystemWorkerSettingsDto {
  readonly workerCount: number
  readonly workerConcurrency: number
  readonly useClusterMode: boolean
  readonly timeout: number
}

export interface BuilderSystemSettingsDto {
  readonly processing: BuilderSystemProcessingSettingsDto
  readonly observability: {
    readonly showProgress: boolean
    readonly showDetailedStats: boolean
    readonly logging: BuilderSystemLoggingSettingsDto
    readonly performance: {
      readonly worker: BuilderSystemWorkerSettingsDto
    }
  }
}

export interface UpdateBuilderSettingsPayload {
  readonly system: BuilderSystemSettingsDto
}
