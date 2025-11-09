import type { UiNode } from '../ui-schema/ui-schema.type'
import type { SettingKeyType, SettingUiSchema } from './setting.type'

export const SETTING_UI_SCHEMA_VERSION = '1.3.0'

export const SETTING_UI_SCHEMA: SettingUiSchema = {
  version: SETTING_UI_SCHEMA_VERSION,
  title: '系统设置',
  description: '管理 AFilmory 系统的全局行为与服务接入。',
  sections: [],
} satisfies SettingUiSchema

function collectKeys(nodes: ReadonlyArray<UiNode<SettingKeyType>>): SettingKeyType[] {
  const keys: SettingKeyType[] = []

  for (const node of nodes) {
    if (node.type === 'field') {
      keys.push(node.key)
      continue
    }

    keys.push(...collectKeys(node.children))
  }

  return keys
}

export const SETTING_UI_SCHEMA_KEYS = Array.from(new Set(collectKeys(SETTING_UI_SCHEMA.sections))) as SettingKeyType[]
