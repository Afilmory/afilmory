import type {
  SchemaFormState,
  SchemaFormValue,
  UiFieldComponentDefinition,
  UiFieldNode,
  UiNode,
  UiSchema,
} from '../../schema-form/types'
import type { SuperAdminSettingField, SuperAdminSettings, UpdateSuperAdminSettingsPayload } from '../types'

export type SuperAdminFieldMap = Map<SuperAdminSettingField, UiFieldNode<SuperAdminSettingField>>

type FieldHandler = {
  prepare: (
    value: SchemaFormValue | undefined,
    field: UiFieldNode<SuperAdminSettingField>,
  ) => SchemaFormValue | undefined
  equals: (
    current: SchemaFormValue | undefined,
    baseline: SchemaFormValue | undefined,
    field: UiFieldNode<SuperAdminSettingField>,
  ) => boolean
  serialize: (
    value: SchemaFormValue | undefined,
    field: UiFieldNode<SuperAdminSettingField>,
  ) => SchemaFormValue | null | undefined
}

type ResolvedFieldKind = 'boolean' | 'number' | 'string'

function stringFromValue(value: SchemaFormValue | undefined): string {
  if (value === undefined || value === null) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  return String(value)
}

function normalizeText(value: SchemaFormValue | undefined): string {
  return stringFromValue(value).trim()
}

type NumberNormalization = { kind: 'empty' } | { kind: 'invalid'; raw: string } | { kind: 'valid'; value: number }

function normalizeNumberInput(value: SchemaFormValue | undefined): NumberNormalization {
  const raw = stringFromValue(value).trim()
  if (raw.length === 0) {
    return { kind: 'empty' }
  }

  const parsed = Number(raw)
  if (Number.isFinite(parsed)) {
    return { kind: 'valid', value: parsed }
  }

  return { kind: 'invalid', raw }
}

const STRING_HANDLER: FieldHandler = {
  prepare: (value) => stringFromValue(value),
  equals: (current, baseline) => normalizeText(current) === normalizeText(baseline),
  serialize: (value, field) => {
    const normalized = normalizeText(value)
    if (normalized.length === 0) {
      return field.isSensitive ? undefined : null
    }
    return normalized
  },
}

const BOOLEAN_HANDLER: FieldHandler = {
  prepare: Boolean,
  equals: (current, baseline) => Boolean(current) === Boolean(baseline),
  serialize: Boolean,
}

const NUMBER_HANDLER: FieldHandler = {
  prepare: (value) => stringFromValue(value),
  equals: (current, baseline) => {
    const left = normalizeNumberInput(current)
    const right = normalizeNumberInput(baseline)

    if (left.kind !== right.kind) {
      return false
    }

    if (left.kind === 'valid' && right.kind === 'valid') {
      return left.value === right.value
    }

    if (left.kind === 'invalid' && right.kind === 'invalid') {
      return left.raw === right.raw
    }

    return true
  },
  serialize: (value) => {
    const normalized = normalizeNumberInput(value)
    if (normalized.kind === 'valid') {
      return normalized.value
    }

    if (normalized.kind === 'empty') {
      return null
    }

    return
  },
}

function resolveFieldKind(field: UiFieldNode<SuperAdminSettingField>): ResolvedFieldKind {
  const component = field.component as UiFieldComponentDefinition<SuperAdminSettingField>

  if (component.type === 'switch') {
    return 'boolean'
  }

  if (component.type === 'text' && component.inputType === 'number') {
    return 'number'
  }

  return 'string'
}

function resolveFieldHandler(field: UiFieldNode<SuperAdminSettingField>): FieldHandler {
  const kind = resolveFieldKind(field)
  switch (kind) {
    case 'boolean': {
      return BOOLEAN_HANDLER
    }
    case 'number': {
      return NUMBER_HANDLER
    }
    default: {
      return STRING_HANDLER
    }
  }
}

function traverseNodes(
  schema: UiSchema<SuperAdminSettingField>,
  visitor: (node: UiNode<SuperAdminSettingField>) => void,
): void {
  const queue: UiNode<SuperAdminSettingField>[] = [...schema.sections]

  while (queue.length > 0) {
    const node = queue.shift()
    if (!node) {
      continue
    }

    visitor(node)

    if ('children' in node && Array.isArray(node.children)) {
      queue.push(...node.children)
    }
  }
}

export function buildFieldMap(schema: UiSchema<SuperAdminSettingField>): SuperAdminFieldMap {
  const map: SuperAdminFieldMap = new Map()

  traverseNodes(schema, (node) => {
    if (node.type === 'field') {
      map.set(node.key, node)
    }
  })

  return map
}

function toSnakeCase(input: string): string {
  return input
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replaceAll(/[-\s]+/g, '_')
    .toLowerCase()
}

function getRawValue(source: Record<string, unknown> | undefined, key: SuperAdminSettingField): unknown | undefined {
  if (!source) {
    return undefined
  }

  if (key in source) {
    return source[key]
  }

  const snake = toSnakeCase(key)
  if (snake in source) {
    return source[snake]
  }

  return undefined
}

function normalizeSchemaFormValue(value: unknown): SchemaFormValue | undefined {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value
  }

  if (value === undefined) {
    return undefined
  }

  return undefined
}

export function normalizeServerValues(
  fieldMap: SuperAdminFieldMap,
  rawValues: Record<string, unknown> | null | undefined,
): SuperAdminSettings {
  const normalized: SuperAdminSettings = {}
  const source = rawValues ?? undefined

  fieldMap.forEach((field, key) => {
    normalized[key] = normalizeSchemaFormValue(getRawValue(source, key))
  })

  return normalized
}

export function createFormState(
  fieldMap: SuperAdminFieldMap,
  values: SuperAdminSettings,
): SchemaFormState<SuperAdminSettingField> {
  const state: SchemaFormState<SuperAdminSettingField> = {}

  fieldMap.forEach((field, key) => {
    const handler = resolveFieldHandler(field)
    state[key] = handler.prepare(values[key], field)
  })

  return state
}

export function detectFormChanges(
  fieldMap: SuperAdminFieldMap,
  current: SchemaFormState<SuperAdminSettingField> | null,
  baseline: SchemaFormState<SuperAdminSettingField> | null,
): boolean {
  if (!current || !baseline || fieldMap.size === 0) {
    return false
  }

  for (const [key, field] of fieldMap) {
    const handler = resolveFieldHandler(field)
    if (!handler.equals(current[key], baseline[key], field)) {
      return true
    }
  }

  return false
}

export function createUpdatePayload(
  fieldMap: SuperAdminFieldMap,
  current: SchemaFormState<SuperAdminSettingField> | null,
  baseline: SchemaFormState<SuperAdminSettingField> | null,
): UpdateSuperAdminSettingsPayload | null {
  if (!current || !baseline || fieldMap.size === 0) {
    return null
  }

  const payload: UpdateSuperAdminSettingsPayload = {}

  fieldMap.forEach((field, key) => {
    const handler = resolveFieldHandler(field)
    if (!handler.equals(current[key], baseline[key], field)) {
      const serialized = handler.serialize(current[key], field)
      if (serialized !== undefined) {
        payload[key] = serialized
      }
    }
  })

  return Object.keys(payload).length === 0 ? null : payload
}
