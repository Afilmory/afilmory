import type {ConsolaInstance} from 'consola';
import consola from 'consola'

export type LogLevel = 'log' | 'info' | 'success' | 'warn' | 'error' | 'debug' | 'trace' | 'start' | 'fatal'

export interface LogMessage {
  tag: string
  level: LogLevel | string
  args: unknown[]
  timestamp: Date
}

type LogListener = (message: LogMessage) => void

let listener: LogListener | null = null
let forwardToConsole = true

export function setLogListener(newListener: LogListener | null, options: { forwardToConsole?: boolean } = {}): void {
  listener = newListener
  if (options.forwardToConsole !== undefined) {
    forwardToConsole = options.forwardToConsole
  }
}

export function setConsoleForwarding(enabled: boolean): void {
  forwardToConsole = enabled
}

function notifyListener(tag: string, level: LogLevel | string, args: unknown[]): void {
  listener?.({
    tag,
    level,
    args,
    timestamp: new Date(),
  })
}

function combineTags(parentTag: string, childTag: string): string {
  if (!parentTag) return childTag
  return `${parentTag}/${childTag}`
}

function wrapInstance(instance: ConsolaInstance, tag: string): ConsolaInstance {
  return new Proxy(instance, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)

      if (property === 'withTag') {
        return (...args: any[]) => {
          const modifier = String(args[0] ?? '')
          const nextTag = modifier ? combineTags(tag, modifier) : tag
          const nextInstance = Reflect.apply(value, target, args) as ConsolaInstance
          return wrapInstance(nextInstance, nextTag)
        }
      }

      if (typeof value !== 'function') {
        return value
      }

      return (...args: any[]) => {
        notifyListener(tag, String(property), args)

        if (forwardToConsole) {
          return Reflect.apply(value, target, args)
        }

        return
      }
    },
  })
}

function createTaggedLogger(tag: string): ConsolaInstance {
  return wrapInstance(consola.withTag(tag), tag)
}

export const logger = {
  main: createTaggedLogger('MAIN'),
  s3: createTaggedLogger('S3'),
  image: createTaggedLogger('IMAGE'),
  thumbnail: createTaggedLogger('THUMBNAIL'),
  blurhash: createTaggedLogger('BLURHASH'),
  exif: createTaggedLogger('EXIF'),
  fs: createTaggedLogger('FS'),
  worker: (id: number) => createTaggedLogger(`WORKER-${id}`),
}

export type Logger = typeof logger
export type WorkerLogger = ReturnType<typeof logger.worker>
