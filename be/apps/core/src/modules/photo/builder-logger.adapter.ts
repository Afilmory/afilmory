import type { Logger as BuilderLogger } from '@afilmory/builder/logger'
import type { PrettyLogger } from '@afilmory/framework'

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
    main: createTaggedLogger('PhotoBuilder:Main'),
    s3: createTaggedLogger('PhotoBuilder:S3'),
    image: createTaggedLogger('PhotoBuilder:Image'),
    thumbnail: createTaggedLogger('PhotoBuilder:Thumbnail'),
    blurhash: createTaggedLogger('PhotoBuilder:Blurhash'),
    exif: createTaggedLogger('PhotoBuilder:Exif'),
    fs: createTaggedLogger('PhotoBuilder:Fs'),
    worker: (id: number) => createTaggedLogger(`PhotoBuilder:Worker-${id}`),
  }
}
