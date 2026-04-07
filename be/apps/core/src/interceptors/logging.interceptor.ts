import type { CallHandler, ExecutionContext, FrameworkResponse, Interceptor } from '@tsuki/framework'
import { createLogger } from '@tsuki/framework'
import { toUri } from 'core/helpers/url.helper'
import { green } from 'picocolors'
import { injectable } from 'tsyringe'

const httpLogger = createLogger('HTTP')

@injectable()
export class LoggingInterceptor implements Interceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<FrameworkResponse> {
    const start = performance.now()
    const { hono } = context.getContext()
    const { method, url } = hono.req

    const uri = toUri(url)
    httpLogger.info(['<---', `${method} -> ${uri}`].join(' '))
    const result = await next.handle()
    const durationMs = Number((performance.now() - start).toFixed(2))
    httpLogger.info(['--->', `${method} -> ${uri}`, green(`+${durationMs}ms`)].join(' '))

    return result
  }
}
