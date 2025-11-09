import fs from 'node:fs/promises'
import path from 'node:path'

import { glob } from 'glob'
import type { Plugin } from 'vite'

interface TocItem {
  id: string
  level: number
  text: string
  children?: TocItem[]
}

interface FileToc {
  file: string
  path: string
  title: string
  toc: TocItem[]
}

interface TocExtractorOptions {
  contentsDir?: string
  outputDir?: string
  outputFile?: string
  maxDepth?: number
  indexFile?: string
}

const defaultOptions: Required<TocExtractorOptions> = {
  contentsDir: 'contents',
  outputDir: 'src',
  outputFile: 'toc-data.ts',
  maxDepth: 6,
  indexFile: 'index',
}

/**
 * TOC 提取器插件
 *
 * 通过正则表达式从 MD 和 MDX 文件中提取标题，生成目录结构
 * 并保存到 TypeScript 文件中
 */
export function tocExtractor(options: TocExtractorOptions = {}): Plugin {
  const opts = { ...defaultOptions, ...options }

  return {
    name: 'toc-extractor',
    enforce: 'pre',

    async buildStart() {
      await generateTocData(opts)
    },

    async handleHotUpdate({ file, server }) {
      // 监听 contents 目录文件变化，重新生成 TOC 数据
      if (file.includes(path.resolve(opts.contentsDir))) {
        await generateTocData(opts)
        server.ws.send({
          type: 'full-reload',
        })
      }
    },

    configureServer(server) {
      // 开发模式下提供手动触发接口
      server.middlewares.use('/__generate-toc', async (_req, res) => {
        try {
          await generateTocData(opts)
          res.end('TOC data generated successfully')
        } catch (error) {
          res.statusCode = 500
          res.end(`Error generating TOC data: ${error}`)
        }
      })
    },
  }
}

async function generateTocData(options: Required<TocExtractorOptions>) {
  const { contentsDir, outputDir, outputFile, maxDepth, indexFile } = options

  try {
    const pattern = path.join(contentsDir, '**/*.{md,mdx}')
    const files = await glob(pattern, {
      ignore: ['**/node_modules/**'],
      absolute: false,
    })

    const allTocData: FileToc[] = []

    for (const file of files) {
      const tocData = await extractTocFromFile(file, contentsDir, maxDepth, indexFile)
      if (tocData) {
        allTocData.push(tocData)
      }
    }

    allTocData.sort((a, b) => a.path.localeCompare(b.path))

    const tsContent = generateTocTsContent(allTocData)

    await fs.mkdir(outputDir, { recursive: true })

    const outputPath = path.join(outputDir, outputFile)
    await fs.writeFile(outputPath, tsContent, 'utf-8')

    console.info(`✓ Generated TOC data for ${allTocData.length} files to ${outputPath}`)
  } catch (error) {
    console.error('Error generating TOC data:', error)
    throw error
  }
}

async function extractTocFromFile(
  file: string,
  contentsDir: string,
  maxDepth: number,
  indexFile: string,
): Promise<FileToc | null> {
  try {
    const content = await fs.readFile(file, 'utf-8')

    const frontmatterTitle = extractFrontmatterTitle(content)

    const headings = extractHeadings(content, maxDepth)

    if (headings.length === 0 && !frontmatterTitle) {
      return null
    }

    const toc = buildTocTree(headings)

    const relativePath = path.relative(contentsDir, file)

    const routePath = generateRoutePath(file, contentsDir, indexFile)

    return {
      file: relativePath,
      path: routePath,
      title: frontmatterTitle || headings[0]?.text || path.basename(file, path.extname(file)),
      toc,
    }
  } catch (error) {
    console.warn(`Failed to process file ${file}:`, error)
    return null
  }
}

function generateRoutePath(file: string, contentsDir: string, indexFile: string): string {
  // 移除 contents 前缀和文件扩展名（与 route-generator 保持一致）
  let routePath = file.replace(new RegExp(`^${contentsDir}/`), '').replace(/\.(md|mdx)$/, '')

  // 处理 index 文件（与 route-generator 保持一致）
  if (routePath === indexFile) {
    routePath = '/'
  } else if (routePath.endsWith(`/${indexFile}`)) {
    const basePath = routePath.replace(`/${indexFile}`, '')
    routePath = basePath ? `/${basePath}` : '/'
  } else {
    routePath = `/${routePath}`
  }

  return routePath
}

function extractFrontmatterTitle(content: string): string | null {
  // 匹配 frontmatter 中的 title 字段
  const frontmatterMatch = content.match(/^---\n(.*?)\n---/s)
  if (!frontmatterMatch) return null

  const frontmatterContent = frontmatterMatch[1]
  // eslint-disable-next-line regexp/no-super-linear-backtracking
  const titleMatch = frontmatterContent.match(/^title:\s*(.+)$/m)
  if (!titleMatch) return null

  // 移除引号
  return titleMatch[1].replaceAll(/^['"]|['"]$/g, '').trim()
}

/**
 * 移除内容中的代码块
 * 包括围栏代码块 (```...```) 和缩进代码块
 */
function removeCodeBlocks(content: string): string {
  // 1. 移除围栏代码块 (```...``` 或 ~~~...~~~)
  let result = content.replaceAll(/^```[\s\S]+?^```$/gm, '')
  result = result.replaceAll(/^~~~[\s\S]+?^~~~$/gm, '')

  // 2. 移除缩进代码块 (连续的4空格或1Tab缩进的行)
  const lines = result.split('\n')
  const filteredLines: string[] = []
  let inCodeBlock = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const isCodeLine = /^(?: {4}|\t)/.test(line) && line.trim() !== ''
    const isEmptyLine = line.trim() === ''

    if (isCodeLine) {
      inCodeBlock = true
      continue // 跳过代码行
    }

    if (inCodeBlock && isEmptyLine) {
      // 在代码块中的空行，检查下一行是否还是代码
      let nextNonEmptyIndex = i + 1
      while (nextNonEmptyIndex < lines.length && lines[nextNonEmptyIndex].trim() === '') {
        nextNonEmptyIndex++
      }

      if (nextNonEmptyIndex < lines.length && /^(?: {4}|\t)/.test(lines[nextNonEmptyIndex])) {
        // 下一个非空行还是代码，跳过这个空行
        continue
      } else {
        // 代码块结束
        inCodeBlock = false
      }
    }

    if (!isCodeLine) {
      inCodeBlock = false
    }

    filteredLines.push(line)
  }

  return filteredLines.join('\n')
}

function extractHeadings(content: string, maxDepth: number): TocItem[] {
  const headings: TocItem[] = []
  const usedIds = new Set<string>() // Track used IDs to avoid duplicates

  // 首先移除所有代码块
  const contentWithoutCodeBlocks = removeCodeBlocks(content)

  // 正则表达式匹配 Markdown 标题 (## Title 格式)
  // eslint-disable-next-line regexp/no-super-linear-backtracking
  const headingRegex = /^(#{1,6})\s+(.+)$/gm

  let match
  while ((match = headingRegex.exec(contentWithoutCodeBlocks)) !== null) {
    const level = match[1].length

    if (level > maxDepth) continue

    const text = match[2].trim()

    // 生成基础 ID
    const baseId = `heading-${generateHeadingId(text)}`
    let finalId = baseId

    // 处理 ID 冲突，添加数字后缀（与 remark-heading.ts 保持一致）
    let counter = 1
    while (usedIds.has(finalId)) {
      finalId = `${baseId}-${counter}`
      counter++
    }

    usedIds.add(finalId)

    headings.push({
      id: finalId,
      level,
      text,
    })
  }

  return headings
}

function generateHeadingId(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^\w\s-]/g, '') // 移除特殊字符
    .replaceAll(/\s+/g, '-') // 空格替换为连字符
    .replaceAll(/-+/g, '-') // 多个连字符合并为一个
    .replaceAll(/^-|-$/g, '') // 移除开头和结尾的连字符
}

function buildTocTree(headings: TocItem[]): TocItem[] {
  const result: TocItem[] = []
  const stack: TocItem[] = []

  for (const heading of headings) {
    // 将当前标题的子元素初始化为空数组
    heading.children = []

    // 找到合适的父级
    while (stack.length > 0 && stack.at(-1)!.level >= heading.level) {
      stack.pop()
    }

    if (stack.length === 0) {
      // 顶级标题
      result.push(heading)
    } else {
      // 作为子标题
      const parent = stack.at(-1)
      if (parent && !parent.children) {
        parent.children = []
      }
      if (parent && parent.children) {
        parent.children.push(heading)
      }
    }

    stack.push(heading)
  }

  return result
}

function generateTocTsContent(tocData: FileToc[]): string {
  return `// This file is automatically generated by the toc-extractor plugin
// Do not edit manually

export interface TocItem {
  id: string
  level: number
  text: string
  children?: TocItem[]
}

export interface FileToc {
  file: string
  path: string
  title: string
  toc: TocItem[]
}

export const tocData: FileToc[] = ${JSON.stringify(tocData, null, 2)}

// Helper function to find TOC data by file path
export function getTocByFile(filePath: string): TocItem[] | undefined {
  const item = tocData.find(item => item.file === filePath)
  return item?.toc
}

// Helper function to find TOC data by route path
export function getTocByPath(routePath: string): TocItem[] | undefined {
  const item = tocData.find(item => item.path === routePath)
  return item?.toc
}

// Helper function to flatten TOC tree into a simple array
export function flattenToc(toc: TocItem[]): TocItem[] {
  const result: TocItem[] = []
  
  function traverse(items: TocItem[]) {
    for (const item of items) {
      result.push({
        id: item.id,
        level: item.level,
        text: item.text,
      })
      if (item.children && item.children.length > 0) {
        traverse(item.children)
      }
    }
  }
  
  traverse(toc)
  return result
}

// Helper function to get all headings at a specific level
export function getHeadingsByLevel(toc: TocItem[], level: number): TocItem[] {
  const result: TocItem[] = []
  
  function traverse(items: TocItem[]) {
    for (const item of items) {
      if (item.level === level) {
        result.push(item)
      }
      if (item.children && item.children.length > 0) {
        traverse(item.children)
      }
    }
  }
  
  traverse(toc)
  return result
}
`
}

export default tocExtractor
