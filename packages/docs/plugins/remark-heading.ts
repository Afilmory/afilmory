import type { Heading, Root } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

/**
 * 生成标题ID的函数
 * 保持与 toc-extractor.ts 中的 generateHeadingId 函数完全一致
 * Supports Chinese (CJK) characters in heading IDs
 */
function generateHeadingId(text: string): string {
  return (
    text
      .toLowerCase()
      // Keep: Chinese (CJK), English, numbers, spaces, hyphens
      // Remove: emojis and special symbols
      .replaceAll(/[^\u4e00-\u9fa5a-z0-9\s-]/gi, '')
      .trim()
      .replaceAll(/\s+/g, '-') // 空格替换为连字符
      .replaceAll(/-+/g, '-') // 多个连字符合并为一个
      .replaceAll(/^-|-$/g, '') || // 移除开头和结尾的连字符
    // Fallback for empty results (e.g., emoji-only headings)
    `heading-${Math.random().toString(36).substring(2, 9)}`
  )
}

/**
 * 从 MDAST 节点中提取文本内容
 */

function extractTextFromNode(node: any): string {
  if (typeof node === 'string') {
    return node
  }

  if (node.type === 'text') {
    return node.value || ''
  }

  if (node.type === 'inlineCode') {
    return node.value || ''
  }

  if (node.type === 'strong' || node.type === 'emphasis') {
    return node.children?.map(extractTextFromNode).join('') || ''
  }

  if (node.type === 'link') {
    return node.children?.map(extractTextFromNode).join('') || ''
  }

  if (node.children && Array.isArray(node.children)) {
    return node.children
      .map((element: any) => extractTextFromNode(element))
      .join('')
  }

  return ''
}

interface RemarkHeadingOptions {
  /**
   * 是否覆盖已存在的 ID
   * @default false
   */
  overrideExisting?: boolean

  /**
   * ID 前缀
   * @default ''
   */
  prefix?: string

  /**
   * 自定义 ID 生成函数
   * @default generateHeadingId
   */
  generateId?: (text: string) => string
}

/**
 * Remark 插件：为标题自动添加 ID
 *
 * 此插件会遍历 Markdown/MDX 文档中的所有标题节点，
 * 为没有 ID 的标题自动生成 ID，确保与 TOC 提取器生成的 ID 一致
 *
 * @param options 配置选项
 */
const remarkHeading: Plugin<[RemarkHeadingOptions?], Root> = (options = {}) => {
  const {
    overrideExisting = false,
    prefix = '',
    generateId = generateHeadingId,
  } = options

  return (tree: Root) => {
    // 用于跟踪已使用的 ID，避免重复
    const usedIds = new Set<string>()

    visit(tree, 'heading', (node: Heading) => {
      // 检查是否已经有 ID
      const existingId = node.data?.hProperties?.id as string | undefined

      if (existingId && !overrideExisting) {
        usedIds.add(existingId)
        return
      }

      // 提取标题文本
      const text = node.children
        .map((element: any) => extractTextFromNode(element))
        .join('')

      if (!text.trim()) {
        return // 跳过空标题
      }

      // 生成基础 ID
      const baseId = prefix + generateId(text.trim())
      let finalId = baseId

      // 处理 ID 冲突，添加数字后缀
      let counter = 1
      while (usedIds.has(finalId)) {
        finalId = `${baseId}-${counter}`
        counter++
      }

      usedIds.add(finalId)

      // 设置 ID
      if (!node.data) {
        node.data = {}
      }
      if (!node.data.hProperties) {
        node.data.hProperties = {}
      }

      node.data.hProperties.id = finalId
    })
  }
}

export default remarkHeading
export { generateHeadingId, remarkHeading }
