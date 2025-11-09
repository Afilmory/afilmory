import type { BuilderConfigInput } from '../types/config'

export function defineBuilderConfig(config: BuilderConfigInput | (() => BuilderConfigInput)): BuilderConfigInput {
  return typeof config === 'function' ? config() : config
}
