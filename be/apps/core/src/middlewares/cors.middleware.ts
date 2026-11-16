import type { HttpMiddleware } from '@tsuki-hono/common'
import { Middleware } from '@tsuki-hono/common'
import type { Context, Next } from 'hono'
import { cors } from 'hono/cors'
import { injectable } from 'tsyringe'

@Middleware({ priority: -2 })
@injectable()
export class CorsMiddleware implements HttpMiddleware {
  private readonly corsMiddleware = cors({
    // Gallery/dashboard authentication is same-origin. Public assets may be
    // fetched across origins, but tenant galleries must never read another
    // host's cookie-authenticated responses (including sibling tenant hosts).
    origin: '*',
    credentials: false,
    allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Lang'],
  })

  async use(context: Context, next: Next) {
    return await this.corsMiddleware(context, next)
  }
}
