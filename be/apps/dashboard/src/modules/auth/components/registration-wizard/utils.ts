import type { UiFieldNode, UiNode } from '~/modules/schema-form/types'

export const collectSiteFields = (nodes: ReadonlyArray<UiNode<string>>): Array<UiFieldNode<string>> => {
  const fields: Array<UiFieldNode<string>> = []

  for (const node of nodes) {
    if (node.type === 'field') {
      fields.push(node)
      continue
    }

    fields.push(...collectSiteFields(node.children))
  }

  return fields
}

export const firstErrorMessage = (errors: Array<unknown>): string | undefined => {
  if (!errors?.length) return undefined
  const [first] = errors
  if (first == null) return undefined
  if (typeof first === 'string') return first
  if (first instanceof Error) return first.message
  if (typeof first === 'object' && 'message' in (first as Record<string, unknown>)) {
    return String((first as Record<string, unknown>).message)
  }
  try {
    return JSON.stringify(first)
  } catch {
    return String(first)
  }
}
