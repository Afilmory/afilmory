import type { HttpMiddleware } from '@afilmory/framework'
import { Middleware } from '@afilmory/framework'
import type { Context, Next } from 'hono'
import { cors } from 'hono/cors'
import { injectable } from 'tsyringe'

@Middleware({ priority: -2 })
@injectable()
export class CorsMiddleware implements HttpMiddleware {
  private readonly corsMiddleware = cors({
    origin: (origin) => {
      return origin || '*'
    },
    credentials: true,
    allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Lang'],
  })

  async use(context: Context, next: Next) {
    return await this.corsMiddleware(context, next)
  }
}
