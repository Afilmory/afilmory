import type { Logger as BuilderLogger } from '@afilmory/builder/logger/index.js'
import { relayLogMessage } from '@afilmory/builder/logger/index.js'
import type { PrettyLogger } from '@tsuki/framework'
import type { ConsolaInstance } from 'consola'

class ConsolaCompatibleLogger {
  constructor(
    private readonly logger: PrettyLogger,
    private readonly tag: string,
  ) {}

  private forward(level: string, args: unknown[]): void {
    relayLogMessage(this.tag, level, args)
  }

  info(...args: unknown[]): void {
    this.forward('info', args)
    this.logger.info(...args)
  }

  success(...args: unknown[]): void {
    this.forward('success', args)
    this.logger.info(...args)
  }

  warn(...args: unknown[]): void {
    this.forward('warn', args)
    this.logger.warn(...args)
  }

  error(...args: unknown[]): void {
    this.forward('error', args)
    this.logger.error(...args)
  }

  log(...args: unknown[]): void {
    this.forward('log', args)
    this.logger.log(...args)
  }

  debug(...args: unknown[]): void {
    this.forward('debug', args)
    this.logger.debug(...args)
  }

  withTag(tag: string): ConsolaCompatibleLogger {
    const modifier = String(tag ?? '')
    const nextTag = modifier ? combineTags(this.tag, modifier) : this.tag
    return new ConsolaCompatibleLogger(this.logger.extend(tag), nextTag)
  }
}

export function createBuilderLoggerAdapter(baseLogger: PrettyLogger): BuilderLogger {
  const createTaggedLogger = (tag: string): ConsolaCompatibleLogger =>
    new ConsolaCompatibleLogger(baseLogger.extend(tag), tag)

  return {
    main: createTaggedLogger('PhotoBuilder:Main') as unknown as ConsolaInstance,
    s3: createTaggedLogger('PhotoBuilder:S3') as unknown as ConsolaInstance,
    b2: createTaggedLogger('PhotoBuilder:B2') as unknown as ConsolaInstance,
    image: createTaggedLogger('PhotoBuilder:Image') as unknown as ConsolaInstance,
    thumbnail: createTaggedLogger('PhotoBuilder:Thumbnail') as unknown as ConsolaInstance,
    blurhash: createTaggedLogger('PhotoBuilder:Blurhash') as unknown as ConsolaInstance,
    exif: createTaggedLogger('PhotoBuilder:Exif') as unknown as ConsolaInstance,
    fs: createTaggedLogger('PhotoBuilder:Fs') as unknown as ConsolaInstance,
    worker: (id: number) => createTaggedLogger(`PhotoBuilder:Worker-${id}`) as unknown as ConsolaInstance,
  }
}

function combineTags(parentTag: string, childTag: string): string {
  if (!parentTag) {
    return childTag
  }
  if (!childTag) {
    return parentTag
  }
  return `${parentTag}/${childTag}`
}
