import type { Logger as BuilderLogger } from '@afilmory/builder/logger/index.js'
import type { PrettyLogger } from '@afilmory/framework'
import type { ConsolaInstance } from 'consola'

class ConsolaCompatibleLogger {
  constructor(private readonly logger: PrettyLogger) {}

  info(...args: unknown[]): void {
    this.logger.info(...args)
  }

  success(...args: unknown[]): void {
    this.logger.info(...args)
  }

  warn(...args: unknown[]): void {
    this.logger.warn(...args)
  }

  error(...args: unknown[]): void {
    this.logger.error(...args)
  }

  log(...args: unknown[]): void {
    this.logger.log(...args)
  }

  debug(...args: unknown[]): void {
    this.logger.debug(...args)
  }

  withTag(tag: string): ConsolaCompatibleLogger {
    return new ConsolaCompatibleLogger(this.logger.extend(tag))
  }
}

export function createBuilderLoggerAdapter(baseLogger: PrettyLogger): BuilderLogger {
  const createTaggedLogger = (tag: string): ConsolaCompatibleLogger =>
    new ConsolaCompatibleLogger(baseLogger.extend(tag))

  return {
    main: createTaggedLogger('PhotoBuilder:Main') as unknown as ConsolaInstance,
    s3: createTaggedLogger('PhotoBuilder:S3') as unknown as ConsolaInstance,
    image: createTaggedLogger('PhotoBuilder:Image') as unknown as ConsolaInstance,
    thumbnail: createTaggedLogger('PhotoBuilder:Thumbnail') as unknown as ConsolaInstance,
    blurhash: createTaggedLogger('PhotoBuilder:Blurhash') as unknown as ConsolaInstance,
    exif: createTaggedLogger('PhotoBuilder:Exif') as unknown as ConsolaInstance,
    fs: createTaggedLogger('PhotoBuilder:Fs') as unknown as ConsolaInstance,
    worker: (id: number) => createTaggedLogger(`PhotoBuilder:Worker-${id}`) as unknown as ConsolaInstance,
  }
}
