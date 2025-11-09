import type { Stats } from 'node:fs'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, normalize, relative, resolve } from 'node:path'
import { Readable } from 'node:stream'

import type { PrettyLogger } from '@afilmory/framework'
import { createLogger } from '@afilmory/framework'
import { DOMParser } from 'linkedom'
import { lookup as lookupMimeType } from 'mime-types'

const DEFAULT_ASSET_LINK_RELS = new Set([
  'stylesheet',
  'modulepreload',
  'preload',
  'prefetch',
  'icon',
  'shortcut icon',
  'apple-touch-icon',
  'manifest',
])

export type StaticAssetDocument = Document

const DOM_PARSER = new DOMParser()

export interface StaticAssetServiceOptions {
  routeSegment: string
  rootCandidates: string[]
  loggerName?: string
  rewriteAssetReferences?: boolean
  assetLinkRels?: Iterable<string>
}

export interface ResolvedStaticAsset {
  absolutePath: string
  relativePath: string
  stats: Stats
}

export abstract class StaticAssetService {
  protected readonly logger: PrettyLogger
  private readonly assetLinkRels: ReadonlySet<string>

  private staticRoot: string | null | undefined
  private warnedMissingRoot = false

  protected constructor(private readonly options: StaticAssetServiceOptions) {
    this.logger = createLogger(options.loggerName ?? this.constructor.name)
    this.assetLinkRels = new Set(
      options.assetLinkRels ? Array.from(options.assetLinkRels, (rel) => rel.toLowerCase()) : DEFAULT_ASSET_LINK_RELS,
    )
  }

  async handleRequest(fullPath: string, headOnly: boolean): Promise<Response | null> {
    const staticRoot = await this.resolveStaticRoot()
    if (!staticRoot) {
      return null
    }

    const relativeRequestPath = this.extractRelativePath(fullPath)
    const target = await this.resolveFile(relativeRequestPath, staticRoot)
    if (!target) {
      return null
    }

    return await this.createResponse(target, headOnly)
  }

  protected get routeSegment(): string {
    return this.options.routeSegment
  }

  protected shouldRewriteAssetReferences(_file: ResolvedStaticAsset): boolean {
    return this.options.rewriteAssetReferences !== false
  }

  protected async decorateDocument(_document: StaticAssetDocument, _file: ResolvedStaticAsset): Promise<void> {}

  protected rewriteStaticAssetReferences(document: StaticAssetDocument): void {
    const prefixAttr = (element: Element, attr: string) => {
      const current = element.getAttribute(attr)
      const next = this.prefixStaticAssetPath(current)
      if (next !== null && next !== current) {
        element.setAttribute(attr, next)
      }
    }

    document.querySelectorAll('script[src]').forEach((script) => {
      prefixAttr(script, 'src')
    })

    document.querySelectorAll('link[href]').forEach((link) => {
      const relTokens = link.getAttribute('rel')?.toLowerCase().split(/\s+/).filter(Boolean)

      const shouldRewrite = !relTokens || relTokens.some((token) => this.assetLinkRels.has(token))
      if (shouldRewrite) {
        prefixAttr(link, 'href')
      }
    })

    document.querySelectorAll('img[src], source[src], audio[src], video[src]').forEach((media) => {
      prefixAttr(media, 'src')
    })

    document.querySelectorAll('img[srcset], source[srcset]').forEach((element) => {
      const current = element.getAttribute('srcset')
      const next = this.prefixSrcset(current)
      if (next !== null && next !== current) {
        element.setAttribute('srcset', next)
      }
    })
  }

  protected prefixStaticAssetPath(value: string | null): string | null {
    if (!value) {
      return value
    }

    const trimmed = value.trim()
    if (trimmed.length === 0) {
      return value
    }

    const lower = trimmed.toLowerCase()
    if (
      lower.startsWith('http://') ||
      lower.startsWith('https://') ||
      lower.startsWith('data:') ||
      lower.startsWith('blob:') ||
      lower.startsWith('mailto:') ||
      lower.startsWith('tel:') ||
      trimmed.startsWith('//')
    ) {
      return value
    }

    if (!trimmed.startsWith('/')) {
      return value
    }

    if (trimmed.startsWith(this.routeSegment)) {
      return value
    }

    const prefixed = `${this.routeSegment}${trimmed}`
    return value === trimmed ? prefixed : value.replace(trimmed, prefixed)
  }

  private prefixSrcset(value: string | null): string | null {
    if (!value) {
      return value
    }

    const parts = value.split(',').map((entry) => {
      const trimmed = entry.trim()
      if (trimmed.length === 0) {
        return trimmed
      }

      const [url, ...rest] = trimmed.split(/\s+/)
      const prefixed = this.prefixStaticAssetPath(url) ?? url
      return [prefixed, ...rest].join(' ').trim()
    })

    return parts.join(', ')
  }

  private async resolveStaticRoot(): Promise<string | null> {
    if (this.staticRoot !== undefined) {
      return this.staticRoot
    }

    for (const candidate of this.options.rootCandidates) {
      try {
        const stats = await stat(candidate)
        if (stats.isDirectory()) {
          this.staticRoot = candidate
          this.logger.info(`Using static assets root for ${this.routeSegment}: ${candidate}`)
          return candidate
        }
      } catch {
        continue
      }
    }

    this.staticRoot = null
    if (!this.warnedMissingRoot) {
      this.warnedMissingRoot = true
      this.logger.warn(`No static asset root found for ${this.routeSegment}; static route will return 404`)
    }

    return null
  }

  private extractRelativePath(fullPath: string): string {
    const index = fullPath.indexOf(this.routeSegment)
    if (index === -1) {
      return ''
    }

    const sliceStart = index + this.routeSegment.length
    const remainder = sliceStart < fullPath.length ? fullPath.slice(sliceStart) : ''
    return this.stripLeadingSlashes(remainder)
  }

  private stripLeadingSlashes(pathname: string): string {
    let result = pathname
    while (result.startsWith('/')) {
      result = result.slice(1)
    }
    return result
  }

  private async resolveFile(requestPath: string, root: string): Promise<ResolvedStaticAsset | null> {
    const decoded = this.decodePath(requestPath)
    const normalized = this.normalizePath(decoded)
    const candidates = this.buildCandidatePaths(normalized)

    for (const candidate of candidates) {
      const resolved = await this.tryResolveFile(root, candidate)
      if (resolved) {
        return resolved
      }
    }

    return null
  }

  private decodePath(pathname: string): string {
    if (pathname.length === 0) {
      return pathname
    }

    try {
      return decodeURIComponent(pathname)
    } catch {
      return pathname
    }
  }

  private normalizePath(pathname: string): string {
    if (pathname.length === 0) {
      return 'index.html'
    }

    const withoutLeadingSlash = this.stripLeadingSlashes(pathname)
    if (withoutLeadingSlash.length === 0) {
      return 'index.html'
    }

    return withoutLeadingSlash
  }

  private buildCandidatePaths(normalizedPath: string): string[] {
    const candidates = new Set<string>()

    const sanitized = this.removeLeadingDotSlash(normalize(normalizedPath))
    candidates.add(sanitized)

    if (sanitized.endsWith('/')) {
      candidates.add(join(sanitized, 'index.html'))
    }

    if (!this.hasFileExtension(sanitized)) {
      candidates.add('index.html')
    }

    return Array.from(candidates)
  }

  private removeLeadingDotSlash(pathname: string): string {
    let result = pathname
    while (result.startsWith('./')) {
      result = result.slice(2)
    }
    return result
  }

  private hasFileExtension(pathname: string): boolean {
    return extname(pathname) !== ''
  }

  private async tryResolveFile(root: string, relativePath: string): Promise<ResolvedStaticAsset | null> {
    const safePath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath
    const absolutePath = resolve(root, safePath)

    if (!this.ensureWithinRoot(root, absolutePath)) {
      return null
    }

    try {
      const stats = await stat(absolutePath)
      if (!stats.isFile()) {
        return null
      }

      return { absolutePath, relativePath: safePath, stats }
    } catch {
      return null
    }
  }

  private ensureWithinRoot(root: string, filePath: string): boolean {
    const relativePath = relative(root, filePath)
    return relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath)
  }

  private async createResponse(file: ResolvedStaticAsset, headOnly: boolean): Promise<Response> {
    if (file.relativePath === 'index.html') {
      return await this.createIndexResponse(file, headOnly)
    }

    const mimeType = lookupMimeType(file.absolutePath) || 'application/octet-stream'
    const headers = new Headers()
    headers.set('content-type', mimeType)
    headers.set('content-length', `${file.stats.size}`)
    headers.set('last-modified', file.stats.mtime.toUTCString())

    this.applyCacheHeaders(headers, file.relativePath)

    if (headOnly) {
      return new Response(null, { headers, status: 200 })
    }

    const nodeStream = createReadStream(file.absolutePath)
    const body = Readable.toWeb(nodeStream) as unknown as ReadableStream
    return new Response(body, { headers, status: 200 })
  }

  private async createIndexResponse(file: ResolvedStaticAsset, headOnly: boolean): Promise<Response> {
    const html = await readFile(file.absolutePath, 'utf-8')
    const transformed = await this.transformIndexHtml(html, file)
    const headers = new Headers()
    headers.set('content-type', 'text/html; charset=utf-8')
    headers.set('content-length', `${Buffer.byteLength(transformed, 'utf-8')}`)
    headers.set('last-modified', file.stats.mtime.toUTCString())
    this.applyCacheHeaders(headers, file.relativePath)

    if (headOnly) {
      return new Response(null, { headers, status: 200 })
    }

    return new Response(transformed, { headers, status: 200 })
  }

  private async transformIndexHtml(html: string, file: ResolvedStaticAsset): Promise<string> {
    try {
      const document = DOM_PARSER.parseFromString(html, 'text/html') as unknown as StaticAssetDocument
      await this.decorateDocument(document, file)
      if (this.shouldRewriteAssetReferences(file)) {
        this.rewriteStaticAssetReferences(document)
      }
      return document.documentElement.outerHTML
    } catch (error) {
      this.logger.warn('Failed to transform index.html for static asset response', error)
      return html
    }
  }

  private shouldTreatAsImmutable(relativePath: string): boolean {
    if (this.isHtml(relativePath)) {
      return false
    }

    return this.hasFileExtension(relativePath)
  }

  private applyCacheHeaders(headers: Headers, relativePath: string): void {
    const policy = this.resolveCachePolicy(relativePath)
    headers.set('cache-control', policy.browser)
    headers.set('cdn-cache-control', policy.cdn)
    headers.set('surrogate-control', policy.cdn)
  }

  private resolveCachePolicy(relativePath: string): { browser: string; cdn: string } {
    if (this.isHtml(relativePath)) {
      return {
        browser: 'no-cache',
        cdn: 'no-cache',
      }
    }

    if (this.shouldTreatAsImmutable(relativePath)) {
      return {
        browser: 'public, max-age=31536000, immutable',
        cdn: 'public, max-age=31536000, immutable',
      }
    }

    return {
      browser: 'public, max-age=3600, must-revalidate',
      cdn: 'public, max-age=86400, stale-while-revalidate=600',
    }
  }

  private isHtml(relativePath: string): boolean {
    return relativePath === 'index.html' || relativePath.endsWith('.html')
  }
}
