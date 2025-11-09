import 'reflect-metadata'

import { env } from '@afilmory/env'
import type { HonoHttpApplication } from '@afilmory/framework'
import { createApplication, createLogger, createZodValidationPipe, HttpException } from '@afilmory/framework'
import { BizException } from 'core/errors'

import { PgPoolProvider } from './database/database.provider'
import { AllExceptionsFilter } from './filters/all-exceptions.filter'
import { LoggingInterceptor } from './interceptors/logging.interceptor'
import { ResponseTransformInterceptor } from './interceptors/response-transform.interceptor'
import { AppModules } from './modules/index.module'
import { registerOpenApiRoutes } from './openapi'
import { RedisProvider } from './redis/redis.provider'

export interface BootstrapOptions {
  globalPrefix?: string
}

const isDevelopment = env.NODE_ENV !== 'production'

const GlobalValidationPipe = createZodValidationPipe({
  transform: true,
  whitelist: true,
  errorHttpStatusCode: 422,
  forbidUnknownValues: true,
  enableDebugMessages: isDevelopment,
  stopAtFirstError: true,
})

const honoErrorLogger = createLogger('HonoErrorHandler')

export async function createConfiguredApp(options: BootstrapOptions = {}): Promise<HonoHttpApplication> {
  const app = await createApplication(AppModules, {
    globalPrefix: options.globalPrefix ?? '/api',
  })

  const container = app.getContainer()

  app.useGlobalFilters(new AllExceptionsFilter())
  app.useGlobalInterceptors(new LoggingInterceptor())
  app.useGlobalInterceptors(new ResponseTransformInterceptor())

  app.useGlobalPipes(new GlobalValidationPipe())

  // Warm up DB connection during bootstrap
  const poolProvider = container.resolve(PgPoolProvider)
  await poolProvider.warmup()

  // Warm up Redis connection during bootstrap
  const redisProvider = container.resolve(RedisProvider)
  await redisProvider.warmup()

  registerOpenApiRoutes(app.getInstance(), { globalPrefix: options.globalPrefix ?? '/api' })

  const hono = app.getInstance()
  hono.onError((error, context) => {
    if (error instanceof BizException) {
      return new Response(JSON.stringify(error.toResponse()), {
        status: error.getHttpStatus(),
        headers: {
          'content-type': 'application/json',
        },
      })
    }

    if (error instanceof HttpException) {
      return new Response(JSON.stringify(error.getResponse()), {
        status: error.getStatus(),
        headers: {
          'content-type': 'application/json',
        },
      })
    }

    if (typeof error === 'object' && error !== null && 'statusCode' in error) {
      const statusCode =
        typeof (error as { statusCode?: number }).statusCode === 'number'
          ? (error as { statusCode?: number }).statusCode!
          : 500

      return new Response(JSON.stringify(error), {
        status: statusCode,
        headers: {
          'content-type': 'application/json',
        },
      })
    }

    honoErrorLogger.error(`Unhandled error ${context.req.method} ${context.req.url}`, error)

    return new Response(
      JSON.stringify({
        statusCode: 500,
        message: 'Internal server error',
      }),
      {
        status: 500,
        headers: {
          'content-type': 'application/json',
        },
      },
    )
  })

  return app
}
