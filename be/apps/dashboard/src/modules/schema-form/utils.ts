import type { UiFieldNode, UiNode } from './types'

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
