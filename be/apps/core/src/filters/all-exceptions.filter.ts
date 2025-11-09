import type { ArgumentsHost, ExceptionFilter } from '@afilmory/framework'
import { createLogger, HttpException } from '@afilmory/framework'
import { BizException } from 'core/errors'
import { toUri } from 'core/helpers/url.helper'
import { injectable } from 'tsyringe'

@injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = createLogger('AllExceptionsFilter')
  catch(exception: unknown, host: ArgumentsHost) {
    const store = host.getContext()
    const ctx = store.hono

    const error = exception instanceof Error ? exception : new Error(String(exception))

    this.logger.error(`--- ${ctx.req.method} ${toUri(ctx.req.url)} --->\n`, error)

    if (process.env.NODE_ENV === 'development') {
      this.logger.error(error)
    }
    if (exception instanceof BizException) {
      const response = exception.toResponse()
      return new Response(JSON.stringify(response), {
        status: exception.getHttpStatus(),
        headers: {
          'content-type': 'application/json',
        },
      })
    }

    if (exception instanceof HttpException) {
      return new Response(JSON.stringify(exception.getResponse()), {
        status: exception.getStatus(),
        headers: {
          'content-type': 'application/json',
        },
      })
    }

    if (typeof exception === 'object' && exception !== null && 'statusCode' in exception) {
      return new Response(JSON.stringify(exception), {
        status: exception.statusCode as number,
        headers: {
          'content-type': 'application/json',
        },
      })
    }

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
  }
}
