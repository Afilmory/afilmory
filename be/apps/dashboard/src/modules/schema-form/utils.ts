import type { UiFieldNode, UiNode } from './types'

const HEX_COLOR_PATTERN = /^#[\dA-F]{6}(?:[\dA-F]{2})?$/i

export function collectFieldNodes<Key extends string>(nodes: ReadonlyArray<UiNode<Key>>): Array<UiFieldNode<Key>> {
  const fields: Array<UiFieldNode<Key>> = []

  for (const node of nodes) {
    if (node.type === 'field') {
      fields.push(node)
      continue
    }

    fields.push(...collectFieldNodes(node.children))
  }

  return fields
}

export function normalizeColorPickerValue(value: unknown, fallback = '#86C9AE'): string {
  if (typeof value !== 'string' || !HEX_COLOR_PATTERN.test(value)) {
    return fallback
  }

  return value.slice(0, 7).toUpperCase()
}

export function parseMultiSelectValue(value: unknown): string[] {
  if (typeof value !== 'string' || value.length === 0) {
    return []
  }

  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) {
      return []
    }

    return Array.from(new Set(parsed.filter((item): item is string => typeof item === 'string')))
  }
  catch {
    return []
  }
}

export function updateMultiSelectValue(value: unknown, option: string, selected: boolean): string {
  const current = new Set(parseMultiSelectValue(value))
  if (selected) {
    current.add(option)
  }
  else {
    current.delete(option)
  }
  return JSON.stringify(Array.from(current))
}
