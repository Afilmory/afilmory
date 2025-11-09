import 'reflect-metadata'

import { ReadableStream } from 'node:stream/web'

import type { Context, Next } from 'hono'
import { injectable } from 'tsyringe'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import type {
  ArgumentMetadata,
  CanActivate,
  Constructor,
  ExceptionFilter,
  ExecutionContext,
  FrameworkResponse,
  Interceptor,
  PipeTransform,
  RouteParamMetadataItem,
} from '../src'
import {
  BadRequestException,
  BeforeApplicationShutdown,
  Body,
  ContextParam,
  Controller,
  createApplication,
  createLogger,
  Delete,
  forwardRef,
  Get,
  Headers,
  HonoHttpApplication,
  HttpContext,
  HttpMiddleware,
  Middleware,
  MiddlewareDefinition,
  Module,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  Post,
  Query,
  Req,
  RouteParamtypes,
  UseFilters,
  UseGuards,
  UseInterceptors,
  ZodSchema,
  ZodValidationPipe,
} from '../src'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_MIDDLEWARE, APP_PIPE, ROUTE_ARGS_METADATA } from '../src/constants'
import type { ArgumentsHost, CallHandler } from '../src/interfaces'

const BASE_URL = 'http://localhost'

const GENERATED_RESPONSE = Symbol.for('hono.framework.generatedResponse')

declare module '../src/context/http-context' {
  interface HttpContextValues {
    auth?: {
      apiKey?: string
      allowed?: boolean
    }
  }
}

function createRequest(path: string, init?: RequestInit) {
  return new Request(`${BASE_URL}${path}`, init)
}

const callOrder: string[] = []

function FactoryParam() {
  return (target: object, propertyKey: string | symbol, parameterIndex: number) => {
    const existing = (Reflect.getMetadata(ROUTE_ARGS_METADATA, target, propertyKey) || []) as RouteParamMetadataItem[]
    existing.push({
      index: parameterIndex,
      type: RouteParamtypes.CUSTOM,
      pipes: [],
      factory: () => 'factory-value',
    })
    Reflect.defineMetadata(ROUTE_ARGS_METADATA, existing, target, propertyKey)
  }
}

@injectable()
class SharedService {
  getValue() {
    return 'shared'
  }
}

@injectable()
class DemoService {
  constructor(private readonly shared: SharedService) {}

  greet(name: string) {
    return `Hello ${name.toUpperCase()} from ${this.shared.getValue()}`
  }
}

@injectable()
class ApiKeyGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    callOrder.push('global-guard')
    const httpContext = context.getContext()
    expect(HttpContext.get()).toBe(httpContext)
    const apiKey = httpContext.hono.req.header('x-api-key') ?? undefined
    HttpContext.assign({
      auth: {
        ...httpContext.auth,
        apiKey,
      },
    })
    return apiKey === 'test-key'
  }
}

@injectable()
class AllowGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    callOrder.push('method-guard')
    const httpContext = context.getContext()
    const allowed = httpContext.hono.req.header('x-allow') === 'yes'
    HttpContext.assign({
      auth: {
        ...httpContext.auth,
        allowed,
      },
    })
    return allowed
  }
}

@injectable()
class GlobalPipe implements PipeTransform<unknown> {
  transform(value: unknown, metadata) {
    callOrder.push(`pipe-${metadata.type}`)
    if (metadata.type === 'query' && typeof value === 'string') {
      return `${value}-global`
    }
    return value
  }
}

@injectable()
class TrackingZodPipe extends ZodValidationPipe {
  constructor() {
    super({
      transform: true,
      whitelist: true,
      errorHttpStatusCode: 422,
      forbidUnknownValues: true,
      enableDebugMessages: true,
      stopAtFirstError: true,
    })
  }

  transform(value: unknown, metadata: ArgumentMetadata) {
    callOrder.push(`zod-${metadata.type}:${metadata.metatype?.name ?? 'unknown'}`)
    return super.transform(value, metadata)
  }
}

@injectable()
class DoublePipe implements PipeTransform<unknown, number> {
  transform(value: unknown) {
    callOrder.push('double-pipe')
    const parsed = Number(value)
    if (Number.isNaN(parsed)) {
      throw new BadRequestException('NaN')
    }
    return parsed * 2
  }
}

@injectable()
class GlobalInterceptor implements Interceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<FrameworkResponse> {
    callOrder.push('global-interceptor-before')
    const result = await next.handle()
    callOrder.push('global-interceptor-after')
    return result
  }
}

@injectable()
class MethodInterceptor implements Interceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<FrameworkResponse> {
    callOrder.push('method-interceptor-before')
    const result = await next.handle()
    callOrder.push('method-interceptor-after')
    const generated = (result as unknown as Record<PropertyKey, unknown>)[GENERATED_RESPONSE]
    const contentType = result.headers.get('content-type') ?? ''

    if (generated && contentType.includes('text/plain')) {
      const text = await result.text()
      const headerEntries = Array.from(result.headers.entries())
      if (!headerEntries.some(([key]) => key.toLowerCase() === 'content-type')) {
        headerEntries.push(['content-type', 'text/plain; charset=utf-8'])
      }

      const response = new Response(`${text}|intercepted`, {
        status: result.status,
        statusText: result.statusText,
        headers: headerEntries,
      })

      Reflect.set(response as unknown as Record<PropertyKey, unknown>, GENERATED_RESPONSE, true)

      return response
    }

    return result
  }
}

@injectable()
class MissingService {
  constructor(private readonly value: string) {}
}

@injectable()
@Controller('broken')
class BrokenController {
  constructor(private readonly missing: MissingService) {}

  @Get('/')
  handler() {
    return 'broken'
  }
}

@Module({
  controllers: [BrokenController],
})
class BrokenModule {}

@Module({
  imports: [forwardRef(() => ForwardRefRightModule)],
})
class ForwardRefLeftModule {}

@Module({
  imports: [forwardRef(() => ForwardRefLeftModule)],
})
class ForwardRefRightModule {}

class CustomError extends Error {}

class StacklessError extends Error {
  constructor() {
    super('stackless')
    this.stack = undefined
  }
}

@injectable()
class GlobalExceptionFilter implements ExceptionFilter {
  async catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof CustomError) {
      const ctx = host.getContext().hono
      return ctx.json({ handled: 'custom' }, 418)
    }
    return
  }
}

@injectable()
class MethodExceptionFilter implements ExceptionFilter {
  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.getContext().hono
    return ctx.json(
      {
        handled: true,
        message: (exception as Error).message,
      },
      422,
    )
  }
}

@injectable()
class MiddlewareTracker {
  readonly events: string[] = []
}

@Middleware({ path: '/*', priority: -20 })
@injectable()
class FirstTestMiddleware implements HttpMiddleware {
  constructor(private readonly tracker: MiddlewareTracker) {}

  async use(context: Context, next: Next): Promise<void> {
    this.tracker.events.push(`first-before:${context.req.path}`)
    await next()
    this.tracker.events.push(`first-after:${context.req.path}`)
  }
}

@Middleware({ path: '/*', priority: 0 })
@injectable()
class SecondTestMiddleware implements HttpMiddleware {
  constructor(private readonly tracker: MiddlewareTracker) {}

  async use(context: Context, next: Next): Promise<void> {
    this.tracker.events.push(`second-before:${context.req.path}`)
    await next()
    this.tracker.events.push(`second-after:${context.req.path}`)
  }
}

@injectable()
@Controller('middleware')
class MiddlewareController {
  constructor(private readonly tracker: MiddlewareTracker) {}

  @Get('/')
  handle() {
    this.tracker.events.push('handler')
    return { ok: true }
  }
}

@Module({
  controllers: [MiddlewareController],
  providers: [
    MiddlewareTracker,
    {
      provide: APP_MIDDLEWARE as unknown as Constructor,
      useClass: FirstTestMiddleware,
    },
    {
      provide: APP_MIDDLEWARE as unknown as Constructor,
      useClass: SecondTestMiddleware,
    },
  ],
})
class MiddlewareTestModule {}

const BodySchema = z
  .object({
    message: z.string({ message: 'message required' }),
    tags: z.array(z.string()).default([]),
  })
  .describe('BodySchema')

@ZodSchema(BodySchema)
class BodyDto {
  message!: string
  tags!: string[]
}

@UseInterceptors(MethodInterceptor)
@Controller('demo')
@injectable()
class DemoController {
  constructor(private readonly service: DemoService) {}

  @Get('/')
  async greet(
    @Query('name') name: string,
    @Headers('x-extra') header: string | undefined,
    @ContextParam() contextParam: Context,
    @Req() request: Request,
    context: Context,
  ) {
    expect(contextParam).toBe(context)
    expect((request as any).raw).toBeInstanceOf(Request)
    HttpContext.setContext(context)
    return `${this.service.greet(name)}|header:${header ?? 'none'}`
  }

  @Get('/guarded')
  @UseGuards(AllowGuard)
  guarded() {
    return 'guarded'
  }

  @Get('/raw')
  raw(context: Context) {
    const response = context.newResponse('raw-body')
    context.res = response
    return context.res
  }

  @Get('/buffer')
  buffer() {
    return new TextEncoder().encode('buffer')
  }

  @Get('/array-buffer')
  arrayBuffer() {
    return new ArrayBuffer(16)
  }

  @Get('/stream')
  stream() {
    const encoder = new TextEncoder()
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('stream-data'))
        controller.close()
      },
    })
  }

  @Get('/http-error')
  httpError() {
    throw new BadRequestException({ message: 'bad' })
  }

  @Get('/global-error')
  globalError() {
    throw new Error('boom')
  }

  @Get('/stackless-error')
  stacklessError() {
    throw new StacklessError()
  }

  @Get('/string-error')
  stringError() {
    throw 'string failure'
  }

  @Get('/custom-error')
  throwCustom() {
    throw new CustomError('custom')
  }

  @Get('/void')
  voidRoute() {}

  @Get('/full-query')
  fullQuery(@Query() query: Record<string, string | undefined>) {
    return query
  }

  @Get('/full-params/:id/:slug')
  fullParams(@Param() params: Record<string, string>) {
    return params
  }

  @Post('/double/:id')
  @UseGuards(AllowGuard)
  async double(
    @Param('id', DoublePipe) id: number,
    @Body() payload: BodyDto,
    @Body() rawBody: unknown,
    @Headers() headers: Record<string, string>,
    context: Context,
  ) {
    context.header('x-double', String(id))
    return {
      id,
      payload,
      isDtoInstance: payload instanceof BodyDto,
      rawBody,
      headerCount: Object.keys(headers).length,
    }
  }

  @Post('/plain')
  async plain(@Body() payload: unknown) {
    return { payload }
  }

  @Post('/cache')
  async cache(@Body() first: unknown, @Body() second: unknown) {
    return { same: first === second }
  }

  @Delete('/method-filter')
  @UseFilters(MethodExceptionFilter)
  methodFilter() {
    throw new Error('broken')
  }
}

Reflect.defineMetadata(
  'design:paramtypes',
  [Number, BodyDto, Object, Object, Object],
  DemoController.prototype,
  'double',
)

@Module({
  providers: [SharedService],
})
class SharedModule {}

@Module({
  imports: [SharedModule, SharedModule],
  controllers: [DemoController],
  providers: [
    DemoService,
    ApiKeyGuard,
    AllowGuard,
    GlobalPipe,
    TrackingZodPipe,
    DoublePipe,
    GlobalInterceptor,
    MethodInterceptor,
    GlobalExceptionFilter,
    MethodExceptionFilter,
  ],
})
class RootModule {}

@injectable()
@Controller('factory')
class FactoryController {
  @Get('/')
  handle(@FactoryParam() value: string) {
    return value
  }
}

@Module({
  controllers: [FactoryController],
})
class FactoryModule {}

@injectable()
@Controller({ prefix: 'static', bypassGlobalPrefix: true })
class StaticController {
  @Get('/asset')
  asset() {
    return 'static-asset'
  }
}

@Module({ controllers: [StaticController] })
class StaticModule {}

const lifecycleEvents: string[] = []

@injectable()
class LifecycleProvider
  implements OnModuleInit, OnModuleDestroy, OnApplicationBootstrap, BeforeApplicationShutdown, OnApplicationShutdown
{
  onModuleInit(): void {
    lifecycleEvents.push('module:init')
  }

  onApplicationBootstrap(): void {
    lifecycleEvents.push('app:bootstrap')
  }

  beforeApplicationShutdown(signal?: string): void {
    lifecycleEvents.push(`before:${signal ?? 'none'}`)
  }

  async onModuleDestroy(): Promise<void> {
    lifecycleEvents.push('module:destroy')
  }

  onApplicationShutdown(signal?: string): void {
    lifecycleEvents.push(`app:shutdown:${signal ?? 'none'}`)
  }
}

@Module({
  providers: [LifecycleProvider],
})
class LifecycleModule {}

describe('HonoHttpApplication end-to-end', () => {
  let fetcher: (request: Request) => Promise<Response>
  let app: HonoHttpApplication

  it('emits metadata for DTO parameters', () => {
    const paramTypes = (Reflect.getMetadata('design:paramtypes', DemoController.prototype, 'double') ??
      []) as Constructor[]
    expect(paramTypes.length).toBeGreaterThan(1)
    expect(paramTypes[1]).toBe(BodyDto)
  })

  beforeAll(async () => {
    app = await createApplication(RootModule, { globalPrefix: '/api' })
    app.useGlobalGuards(new ApiKeyGuard())
    app.useGlobalPipes(new GlobalPipe(), new TrackingZodPipe())
    app.useGlobalInterceptors(new GlobalInterceptor())
    app.useGlobalFilters(new GlobalExceptionFilter())
    fetcher = (request) => Promise.resolve(app.getInstance().fetch(request))
  })

  afterAll(async () => {
    await app.close('test-suite')
  })

  beforeEach(() => {
    callOrder.length = 0
  })

  const authorizedHeaders = (extra: Record<string, string> = {}) => ({
    'x-api-key': 'test-key',
    ...extra,
  })

  it('processes successful request through guards, pipes, and interceptors', async () => {
    const response = await fetcher(
      createRequest('/api/demo?name=neo', {
        headers: authorizedHeaders({ 'x-extra': 'value' }),
      }),
    )

    const text = await response.text()
    expect(text).toContain('Hello NEO-GLOBAL')
    expect(text).toContain('header:value')
    expect(text).toContain('intercepted')
    expect(callOrder[0]).toBe('global-guard')
    expect(callOrder).toContain('pipe-query')
    expect(callOrder).toContain('method-interceptor-before')
    expect(callOrder).toContain('method-interceptor-after')
    expect(callOrder.indexOf('method-interceptor-before')).toBeLessThan(callOrder.indexOf('method-interceptor-after'))
  })

  it('enforces method guard and returns forbidden', async () => {
    const response = await fetcher(
      createRequest('/api/demo/guarded', {
        headers: authorizedHeaders(),
      }),
    )

    expect(response.status).toBe(403)
  })

  it('auto-registers class-based enhancers from decorators without providers', async () => {
    @injectable()
    class InlineGuard implements CanActivate {
      async canActivate(): Promise<boolean> {
        callOrder.push('inline-guard')
        return true
      }
    }

    @Controller('inline')
    @injectable()
    class InlineController {
      @Get('/')
      @UseGuards(InlineGuard)
      handle() {
        return 'ok'
      }
    }

    @Module({ controllers: [InlineController] })
    class InlineModule {}

    const app = await createApplication(InlineModule)
    const fetcher = (request: Request) => Promise.resolve(app.getInstance().fetch(request))

    const response = await fetcher(createRequest('/inline'))
    expect(response.status).toBe(200)
    expect(callOrder).toContain('inline-guard')
    await app.close('inline-enhancers')
  })

  it('returns context response when handler yields existing response', async () => {
    const response = await fetcher(
      createRequest('/api/demo/raw', {
        headers: authorizedHeaders(),
      }),
    )
    expect(await response.text()).toBe('raw-body')
  })

  it('supports array buffer and readable stream responses', async () => {
    const bufferResponse = await fetcher(createRequest('/api/demo/buffer', { headers: authorizedHeaders() }))
    expect(await bufferResponse.arrayBuffer()).toBeInstanceOf(ArrayBuffer)

    const arrayBufferResponse = await fetcher(createRequest('/api/demo/array-buffer', { headers: authorizedHeaders() }))
    expect((await arrayBufferResponse.arrayBuffer()).byteLength).toBe(16)

    const streamResponse = await fetcher(createRequest('/api/demo/stream', { headers: authorizedHeaders() }))
    expect(await streamResponse.text()).toBe('stream-data')
  })

  it('returns default response when handler does not produce a payload', async () => {
    const response = await fetcher(
      createRequest('/api/demo/void', {
        headers: authorizedHeaders(),
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('')
  })

  it('handles body parsing, caching, and zod validation', async () => {
    const response = await fetcher(
      createRequest('/api/demo/double/5', {
        method: 'POST',
        headers: {
          ...authorizedHeaders({
            'x-allow': 'yes',
            'content-type': 'application/json',
          }),
        },
        body: JSON.stringify({ message: 'payload', tags: ['a'] }),
      }),
    )

    expect(response.headers.get('x-double')).toBe('10')
    const json = await response.json()
    expect(json).toMatchObject({
      id: 10,
      payload: { message: 'payload', tags: ['a'] },
      isDtoInstance: true,
    })
    expect(json.rawBody).toEqual({ message: 'payload', tags: ['a'] })
    expect(callOrder).toContain('zod-body:BodyDto')
  })

  it('supports bypassing global prefix for specific controllers', async () => {
    const app = await createApplication(StaticModule, { globalPrefix: '/api' })
    const hono = app.getInstance()
    const fetcher = (request: Request) => Promise.resolve(hono.fetch(request))

    const success = await fetcher(createRequest('/static/asset'))
    expect(success.status).toBe(200)
    expect(await success.text()).toBe('static-asset')

    const missing = await fetcher(createRequest('/api/static/asset'))
    expect(missing.status).toBe(404)

    await app.close('bypass-global-prefix')
  })

  it('surfaces validation errors for DTO payloads', async () => {
    const response = await fetcher(
      createRequest('/api/demo/double/5', {
        method: 'POST',
        headers: {
          ...authorizedHeaders({
            'x-allow': 'yes',
            'content-type': 'application/json',
          }),
        },
        body: JSON.stringify({ tags: ['a'] }),
      }),
    )

    expect(response.status).toBe(422)
    const json = await response.json()
    expect(json).toMatchObject({
      statusCode: 422,
      message: 'Validation failed',
      errors: {
        message: [expect.stringContaining('message required')],
      },
      meta: {
        target: 'BodyDto',
        paramType: 'body',
      },
    })
  })

  it('rejects body when payload is not json', async () => {
    const response = await fetcher(
      createRequest('/api/demo/plain', {
        method: 'POST',
        headers: {
          ...authorizedHeaders(),
          'content-type': 'text/plain',
        },
        body: 'just text',
      }),
    )

    expect(response.status).toBe(422)
    const json = await response.json()
    expect(json).toMatchObject({
      statusCode: 422,
      message: 'Payload must be a JSON object',
    })
  })

  it('rejects body when content-type header is missing', async () => {
    const response = await fetcher(
      createRequest('/api/demo/plain', {
        method: 'POST',
        headers: authorizedHeaders(),
      }),
    )

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      statusCode: 422,
      message: 'Payload must be a JSON object',
    })
  })

  it('caches parsed body across multiple parameters', async () => {
    const response = await fetcher(
      createRequest('/api/demo/cache', {
        method: 'POST',
        headers: {
          ...authorizedHeaders(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ok: true }),
      }),
    )

    const json = await response.json()
    expect(json).toEqual({ same: true })
  })

  it('provides full query objects when decorator omits key', async () => {
    const response = await fetcher(
      createRequest('/api/demo/full-query?name=neo&role=admin', {
        headers: authorizedHeaders(),
      }),
    )

    expect(await response.json()).toMatchObject({ name: 'neo', role: 'admin' })
  })

  it('provides full params when decorator omits key', async () => {
    const response = await fetcher(
      createRequest('/api/demo/full-params/123/slug', {
        headers: authorizedHeaders(),
      }),
    )

    expect(await response.json()).toMatchObject({ id: '123', slug: 'slug' })
  })

  it('propagates http exceptions as structured json', async () => {
    const response = await fetcher(
      createRequest('/api/demo/http-error', {
        headers: authorizedHeaders(),
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ message: 'bad' })
  })

  it('handles errors without stack traces gracefully', async () => {
    const response = await fetcher(
      createRequest('/api/demo/stackless-error', {
        headers: authorizedHeaders(),
      }),
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({
      message: 'Internal server error',
    })
  })

  it('falls back to default 500 when filters do not handle error', async () => {
    const response = await fetcher(
      createRequest('/api/demo/global-error', {
        headers: authorizedHeaders(),
      }),
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({
      message: 'Internal server error',
    })
  })

  it('normalizes non-error throwables to 500 responses', async () => {
    const response = await fetcher(
      createRequest('/api/demo/string-error', {
        headers: authorizedHeaders(),
      }),
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({
      message: 'Internal server error',
    })
  })

  it('applies method filters overriding global behavior', async () => {
    const response = await fetcher(
      createRequest('/api/demo/method-filter', {
        method: 'DELETE',
        headers: authorizedHeaders(),
      }),
    )

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      handled: true,
      message: 'broken',
    })
  })

  it('handles custom filter registered globally', async () => {
    const response = await fetcher(
      createRequest('/api/demo/custom-error', {
        headers: authorizedHeaders(),
      }),
    )

    expect(response.status).toBe(418)
    expect(await response.json()).toMatchObject({ handled: 'custom' })
  })

  it('returns empty body when handler yields void', async () => {
    const response = await fetcher(
      createRequest('/api/demo/void', {
        headers: authorizedHeaders(),
      }),
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('')
  })

  it('rejects invalid json payloads', async () => {
    const response = await fetcher(
      createRequest('/api/demo/double/5', {
        method: 'POST',
        headers: {
          ...authorizedHeaders({
            'x-allow': 'yes',
            'content-type': 'application/json',
          }),
        },
        body: '{ invalid json',
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      message: 'Invalid JSON payload',
    })
  })

  it('exposes the underlying dependency container', () => {
    expect(app.getContainer()).toBeDefined()
  })

  it('emits parameter metadata logs when DEBUG is enabled', async () => {
    const original = Reflect.getMetadata('design:paramtypes', DemoController.prototype, 'greet')
    Reflect.defineMetadata('design:paramtypes', [String], DemoController.prototype, 'greet')
    process.env.DEBUG = 'true'

    try {
      const response = await fetcher(
        createRequest('/api/demo?name=params', {
          headers: authorizedHeaders({ 'x-extra': 'value', 'x-allow': 'yes' }),
        }),
      )
      expect(response.status).toBe(200)
    } finally {
      if (original) {
        Reflect.defineMetadata('design:paramtypes', original, DemoController.prototype, 'greet')
      } else {
        Reflect.deleteMetadata('design:paramtypes', DemoController.prototype, 'greet')
      }
      delete process.env.DEBUG
    }
  })
})

describe('HonoHttpApplication logging', () => {
  it('uses anonymous fallback module name when constructor is unnamed', async () => {
    const infoLogs: string[] = []
    const logger = createLogger('Framework', {
      colors: false,
      writer: {
        info: (...args) => infoLogs.push(args.filter(Boolean).join(' ')),
        debug: () => {},
        warn: () => {},
        error: () => {},
        log: () => {},
      },
    })

    const app = await createApplication(class {}, { logger })
    await app.close('logger-test')

    expect(infoLogs).not.toHaveLength(0)
    infoLogs.forEach((entry) => {
      expect(entry).toContain('AnonymousModule')
    })
  })
})

describe('HonoHttpApplication parameter factories', () => {
  it('resolves values provided by metadata factories without pipes', async () => {
    const app = await createApplication(FactoryModule)

    const response = await app.getInstance().fetch(createRequest('/factory'))

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('factory-value')

    await app.close('factory-test')
  })
})

describe('HonoHttpApplication internals', () => {
  it('throws descriptive errors when dependency resolution fails', async () => {
    await expect(createApplication(BrokenModule)).rejects.toThrowError(/Cannot inject the dependency missing/i)
  })

  it('supports forwardRef module relationships without infinite recursion', async () => {
    const app = await createApplication(ForwardRefLeftModule)
    expect(app.getInstance()).toBeDefined()
    await app.close('forward-ref')
  })

  it('exposes initialization state through getInitialized()', async () => {
    const app = new HonoHttpApplication(FactoryModule)
    expect(app.getInitialized()).toBe(false)
    await app.init()
    expect(app.getInitialized()).toBe(true)
    await app.close('initialization-state')
  })

  it('reuses an existing response object without wrapping', async () => {
    const app = await createApplication(FactoryModule)
    const context = {
      res: { sentinel: true },
      json: () => new Response('never'),
    } as unknown as Context

    const ensureResponse = (
      app as unknown as {
        ensureResponse: (ctx: Context, payload?: unknown) => Response | unknown
      }
    ).ensureResponse.bind(app)

    const result = ensureResponse(context, context.res)
    expect(result).toBe(context.res)
    await app.close('reuse-response')
    await app.close('reuse-response-again')
  })

  it('falls back to context response when payload is undefined', async () => {
    const app = await createApplication(FactoryModule)
    const baseResponse = new Response('fallback')
    const context = {
      res: baseResponse,
      json: () => new Response('never'),
    } as unknown as Context

    const ensureResponse = (
      app as unknown as {
        ensureResponse: (ctx: Context, payload?: unknown) => Response | unknown
      }
    ).ensureResponse.bind(app)

    const result = ensureResponse(context)
    expect(result).toBe(baseResponse)
    await app.close('undefined-payload')
  })

  it('throws a descriptive error when provider token is undefined', async () => {
    const app = await createApplication(FactoryModule)
    const getProviderInstance = (
      app as unknown as {
        getProviderInstance: (token: Constructor) => unknown
      }
    ).getProviderInstance.bind(app)

    expect(() => getProviderInstance(undefined as unknown as Constructor)).toThrowError(
      /Cannot resolve provider for undefined token/,
    )

    await app.close('undefined-token')
  })

  it('preserves token identity when resolution fails for non-constructors', async () => {
    const app = await createApplication(FactoryModule)
    const getProviderInstance = (
      app as unknown as {
        getProviderInstance: (token: Constructor | string) => unknown
      }
    ).getProviderInstance.bind(app)

    expect(() => getProviderInstance('missing-token' as unknown as Constructor)).toThrowError(
      /Failed to resolve provider missing-token/,
    )

    await app.close('missing-token-resolution')
  })

  it('formats anonymous provider names when resolution fails', async () => {
    const app = await createApplication(FactoryModule)
    const getProviderInstance = (
      app as unknown as {
        getProviderInstance: (token: Constructor) => unknown
      }
    ).getProviderInstance.bind(app)

    const Anonymous = class {
      constructor(private readonly dep: unknown) {}
    }
    injectable()(Anonymous)
    Object.defineProperty(Anonymous, 'name', { value: '', configurable: true })

    expect(() => getProviderInstance(Anonymous as unknown as Constructor)).toThrowError(
      /Failed to resolve provider class/,
    )

    await app.close('anonymous-resolution')
  })

  it('formats token names consistently', async () => {
    const app = await createApplication(FactoryModule)
    const formatTokenName = (
      app as unknown as {
        formatTokenName: (token: Constructor | string | undefined) => string
      }
    ).formatTokenName.bind(app)

    class Named {}
    const Anonymous = class {}
    Object.defineProperty(Anonymous, 'name', { value: '', configurable: true })

    expect(formatTokenName(Named as Constructor)).toBe('Named')
    expect(formatTokenName(Anonymous as Constructor)).toContain('class')
    expect(formatTokenName('token' as unknown as Constructor)).toBe('token')
    expect(formatTokenName(undefined as unknown as Constructor)).toBe('AnonymousProvider')

    await app.close('format-token-name')
  })

  it('skips duplicate provider registrations', async () => {
    const app = await createApplication(FactoryModule)

    const registerSingleton = (
      app as unknown as {
        registerSingleton: (token: Constructor) => void
      }
    ).registerSingleton.bind(app)

    const Temp = class TempService {}
    const Anonymous = class {}
    Object.defineProperty(Anonymous, 'name', { value: '', configurable: true })

    registerSingleton(Temp as Constructor)
    registerSingleton(Temp as Constructor)

    registerSingleton(Anonymous as Constructor)
    registerSingleton(Anonymous as Constructor)

    expect(app.getContainer().isRegistered(Temp as Constructor, true)).toBe(true)
    await app.close('duplicate-providers')
  })

  it('extracts middleware metadata and lifecycle targets across variants', async () => {
    const app = await createApplication(FactoryModule)
    const internals = app as unknown as {
      extractMiddlewareLifecycleTarget: (value?: unknown) => unknown
      extractMiddlewareMetadata: (source?: Constructor | Record<string, unknown>) => Record<string, unknown>
      resolveMiddlewareDefinition: (value: unknown, source?: Constructor | Record<string, unknown>) => unknown
      getEnhancerType: (token: unknown) => unknown
    }

    @Middleware({ path: '/decorated-inline', priority: 7 })
    class InlineMiddleware implements HttpMiddleware {
      async use(): Promise<void> {}
    }

    const instance = new InlineMiddleware()
    const definition = { handler: instance, path: '/explicit', priority: 2 }

    expect(internals.extractMiddlewareLifecycleTarget()).toBeUndefined()
    expect(internals.extractMiddlewareLifecycleTarget(instance)).toBe(instance)
    expect(internals.extractMiddlewareLifecycleTarget(definition)).toBe(instance)

    expect(internals.extractMiddlewareMetadata()).toEqual({})
    const suppliedMetadata = { path: '/supplied', priority: 4 }
    expect(internals.extractMiddlewareMetadata(suppliedMetadata)).toBe(suppliedMetadata)
    expect(internals.extractMiddlewareMetadata(InlineMiddleware)).toEqual({ path: '/decorated-inline', priority: 7 })

    const decoratedDefinition = internals.resolveMiddlewareDefinition(
      instance,
      InlineMiddleware,
    ) as MiddlewareDefinition
    expect(decoratedDefinition.path).toBe('/decorated-inline')
    expect(decoratedDefinition.priority).toBe(7)

    const mergedDefinition = internals.resolveMiddlewareDefinition(definition, {
      path: '/override',
      priority: 1,
    }) as MiddlewareDefinition
    expect(mergedDefinition.path).toBe('/explicit')
    expect(mergedDefinition.priority).toBe(2)

    const fallbackMerged = internals.resolveMiddlewareDefinition({ handler: instance } as MiddlewareDefinition, {
      path: '/fallback',
      priority: 3,
    }) as MiddlewareDefinition
    expect(fallbackMerged.path).toBe('/fallback')
    expect(fallbackMerged.priority).toBe(3)

    expect(() => internals.getEnhancerType(Symbol('unknown-token'))).toThrowError(/Unknown enhancer token/)

    await app.close('middleware-metadata')
  })

  it('registers global middlewares across array and string paths', async () => {
    const app = await createApplication(FactoryModule)
    const internals = app as unknown as {
      resolveMiddlewareDefinition: (
        value: unknown,
        source?: Constructor | Record<string, unknown>,
      ) => MiddlewareDefinition
      useGlobalMiddlewares: (...definition: MiddlewareDefinition[]) => void
      globalEnhancers: { middlewares: MiddlewareDefinition[] }
    }

    class ArrayMiddleware implements HttpMiddleware {
      public calls: string[] = []
      async use(context: Context, next: Next): Promise<void> {
        this.calls.push(context.req.path)
        await next()
      }
    }

    @Middleware({ path: '/decorated-global', priority: 4 })
    class DecoratedGlobalMiddleware implements HttpMiddleware {
      async use(): Promise<void> {}
    }

    const arrayInstance = new ArrayMiddleware()
    const arrayDefinition: MiddlewareDefinition = {
      handler: arrayInstance,
      path: ['/alpha', /beta/i],
      priority: 10,
    }

    const decoratedDefinition = internals.resolveMiddlewareDefinition(
      new DecoratedGlobalMiddleware(),
      DecoratedGlobalMiddleware,
    )

    class RegexMiddleware implements HttpMiddleware {
      async use(): Promise<void> {}
    }

    const regexDefinition: MiddlewareDefinition = {
      handler: new RegexMiddleware(),
      path: /regex-path/,
    }

    const anonymousHandler = new (class {
      async use(): Promise<void> {}
    })()

    const fallbackDefinition: MiddlewareDefinition = {
      handler: anonymousHandler,
    }

    const hono = app.getInstance()
    const useSpy = vi.spyOn(hono, 'use')

    internals.useGlobalMiddlewares(arrayDefinition, decoratedDefinition, regexDefinition, fallbackDefinition)

    expect(useSpy).toHaveBeenCalledWith('/alpha', expect.any(Function))
    expect(useSpy).toHaveBeenCalledWith(/beta/i, expect.any(Function))
    expect(useSpy).toHaveBeenCalledWith('/decorated-global', expect.any(Function))
    expect(useSpy).toHaveBeenCalledWith(/regex-path/, expect.any(Function))
    expect(useSpy).toHaveBeenCalledWith('/*', expect.any(Function))
    expect(internals.globalEnhancers.middlewares).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ handler: arrayInstance }),
        expect.objectContaining({ path: '/decorated-global' }),
        expect.objectContaining({ path: '/*', handler: anonymousHandler }),
      ]),
    )

    useSpy.mockRestore()
    await app.close('global-middlewares')
  })

  it('describes middleware paths across variants', async () => {
    const app = await createApplication(FactoryModule)
    const describePath = (
      app as unknown as {
        describeMiddlewarePath: (path: unknown) => string
      }
    ).describeMiddlewarePath.bind(app)

    expect(describePath('/literal')).toBe('/literal')
    expect(describePath(/regex-case/)).toBe('/regex-case/')
    expect(describePath(['/alpha', /beta/i])).toBe('/alpha, /beta/i')

    await app.close('describe-middleware-path')
  })

  it('falls back to default middleware metadata when definitions omit fields', async () => {
    const app = await createApplication(FactoryModule)
    const appAny = app as any
    const normalizeSpy = vi
      .spyOn(appAny, 'normalizeMiddlewareDefinition')
      .mockImplementation((definition: any) => definition)
    const hono = app.getInstance()
    const useSpy = vi.spyOn(hono, 'use')
    const verboseSpy = vi.spyOn(appAny.middlewareLogger, 'verbose')

    const AnonymousMiddleware = class {
      async use(): Promise<void> {}
    }
    Object.defineProperty(AnonymousMiddleware, 'name', { value: '', configurable: true })
    const handlerInstance = new AnonymousMiddleware()
    expect(handlerInstance.constructor.name).toBe('')

    try {
      appAny.useGlobalMiddlewares({ handler: handlerInstance } as any)

      expect(useSpy).toHaveBeenCalledWith('/*', expect.any(Function))
      const verboseMessage = verboseSpy.mock.calls.find(
        (call): call is [string, string] => typeof call[0] === 'string' && call[0].includes('AnonymousMiddleware'),
      )
      expect(verboseMessage?.[0]).toContain('AnonymousMiddleware')
      expect(verboseMessage?.[0]).toContain('/*')
    } finally {
      normalizeSpy.mockRestore()
      useSpy.mockRestore()
      verboseSpy.mockRestore()
      await app.close('middleware-defaults')
    }
  })

  it('sorts global middlewares using default priority when values are undefined', async () => {
    const app = await createApplication(FactoryModule)
    const appAny = app as any
    const normalizeSpy = vi
      .spyOn(appAny, 'normalizeMiddlewareDefinition')
      .mockImplementation((definition: any) => definition)
    const hono = app.getInstance()
    const useSpy = vi.spyOn(hono, 'use')

    const lowPriority = {
      handler: { async use(): Promise<void> {} },
      path: '/low',
      priority: undefined,
    }

    const highPriority = {
      handler: { async use(): Promise<void> {} },
      path: '/high',
      priority: undefined,
    }

    try {
      appAny.useGlobalMiddlewares(lowPriority, highPriority)

      expect(appAny.globalEnhancers.middlewares).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: '/low' }), expect.objectContaining({ path: '/high' })]),
      )

      expect(useSpy).toHaveBeenCalledTimes(2)
      expect(useSpy).toHaveBeenCalledWith('/low', expect.any(Function))
      expect(useSpy).toHaveBeenCalledWith('/high', expect.any(Function))
    } finally {
      normalizeSpy.mockRestore()
      useSpy.mockRestore()
      await app.close('middleware-default-priority')
    }
  })

  it('throws descriptive error for invalid provider configuration objects', async () => {
    const app = await createApplication(FactoryModule)
    const internals = app as unknown as {
      registerRegularProvider: (config: any, scoped: Constructor[]) => void
    }

    expect(() => internals.registerRegularProvider({ provide: Symbol('no-resolver') } as any, [])).toThrowError(
      /Invalid provider configuration/,
    )

    await app.close('invalid-provider-config')
  })

  it("throws when provider configuration omits the 'provide' token", async () => {
    @Module({
      providers: [{ useValue: 123 } as any],
    })
    class MissingProvideModule {}

    await expect(createApplication(MissingProvideModule)).rejects.toThrowError(
      /Invalid provider configuration: missing 'provide' token/,
    )
  })

  it('normalizes empty paths to root', async () => {
    const app = await createApplication(FactoryModule)
    const buildPath = (
      app as unknown as {
        buildPath: (controller: { prefix: string; bypassGlobalPrefix: boolean }, routePath: string) => string
      }
    ).buildPath.bind(app)

    expect(buildPath({ prefix: '', bypassGlobalPrefix: false }, '')).toBe('/')
    await app.close('normalize-paths')
  })

  it('serializes undefined payloads to null json bodies', async () => {
    const app = await createApplication(FactoryModule)
    const json = (
      app as unknown as {
        json: (ctx: Context, payload: unknown, status: number) => Response
      }
    ).json.bind(app)

    const response = json({} as Context, undefined, 200)
    expect(response.status).toBe(200)
    expect(await response.json()).toBeNull()
    await app.close('serialize-null')
  })
})

describe('Lifecycle hooks integration', () => {
  it('invokes lifecycle hooks in expected order', async () => {
    lifecycleEvents.length = 0
    const app = await createApplication(LifecycleModule)

    expect(lifecycleEvents).toEqual(['module:init', 'app:bootstrap'])

    lifecycleEvents.length = 0
    await app.close('SIGTERM')

    expect(lifecycleEvents).toEqual(['before:SIGTERM', 'module:destroy', 'app:shutdown:SIGTERM'])
  })
})

describe('Container resolution policy', () => {
  it('throws when resolving unregistered tokens via container', async () => {
    @injectable()
    class Unregistered {}

    const app = await createApplication(FactoryModule)
    const container = app.getContainer()

    expect(() => container.resolve(Unregistered as unknown as Constructor)).toThrowError(
      /Cannot resolve unregistered token/,
    )

    await app.close('unregistered-token')
  })

  it('supports provider aliasing via useExisting and useClass', async () => {
    const calls: string[] = []

    @injectable()
    class Impl {
      constructor() {
        calls.push('impl:new')
      }
      ping() {
        return 'pong'
      }
    }

    class Base {}

    @Module({
      providers: [{ provide: Base as unknown as Constructor, useExisting: Impl as unknown as Constructor }, Impl],
      controllers: [],
    })
    class AliasModule {}

    const app = await createApplication(AliasModule)
    const c = app.getContainer()

    const a = c.resolve(Impl as unknown as Constructor) as unknown as { ping: () => string }
    const b = c.resolve(Base as unknown as Constructor) as unknown as { ping: () => string }

    expect(a.ping()).toBe('pong')
    expect(b.ping()).toBe('pong')
    expect(calls.filter((x) => x === 'impl:new').length).toBe(1)

    await app.close('aliasing')
  })

  it('registers global guards via APP_GUARD provider token', async () => {
    callOrder.length = 0

    @Module({
      controllers: [DemoController],
      providers: [
        SharedService,
        DemoService,
        { provide: APP_GUARD as unknown as Constructor, useExisting: ApiKeyGuard },
        ApiKeyGuard,
      ],
    })
    class GuardTokenModule {}

    const app = await createApplication(GuardTokenModule, { globalPrefix: '/api' })
    const fetcher = (request: Request) => Promise.resolve(app.getInstance().fetch(request))

    // Without x-api-key, should be forbidden by global guard
    const response = await fetcher(new Request('http://localhost/api/demo'))
    expect(response.status).toBe(403)

    await app.close('guard-token')
  })
})

describe('APP_* providers and auto-registration of decorator enhancers', () => {
  it('applies APP_PIPE as a global pipe (useValue)', async () => {
    @injectable()
    class AppPipe implements PipeTransform<unknown> {
      transform(value: unknown, metadata: ArgumentMetadata) {
        if (metadata.type === 'query' && typeof value === 'string') return `${value}-app`
        return value
      }
    }

    @injectable()
    @Controller('apptok')
    class AppTokController {
      @Get('/')
      greet(@Query('q') q: string) {
        return `Q:${q}`
      }
    }

    @Module({
      controllers: [AppTokController],
      providers: [{ provide: APP_PIPE as unknown as Constructor, useValue: new AppPipe() }],
    })
    class AppTokModule {}

    const app = await createApplication(AppTokModule)
    const fetcher = (req: Request) => Promise.resolve(app.getInstance().fetch(req))
    const res = await fetcher(new Request('http://localhost/apptok?q=a'))
    expect(await res.text()).toBe('Q:a-app')
    await app.close('app-pipe')
  })

  it('applies APP_INTERCEPTOR as a global interceptor (useClass)', async () => {
    @injectable()
    class AppInterceptor2 implements Interceptor {
      async intercept(_ctx: ExecutionContext, next: CallHandler): Promise<FrameworkResponse> {
        const result = await next.handle()
        const text = await result.text()
        return new Response(`${text}|gx`, { headers: result.headers, status: result.status }) as FrameworkResponse
      }
    }

    @injectable()
    @Controller('iapp')
    class IAppController {
      @Get('/')
      ping() {
        return 'pong'
      }
    }

    @Module({
      controllers: [IAppController],
      providers: [{ provide: APP_INTERCEPTOR as unknown as Constructor, useClass: AppInterceptor2 }, AppInterceptor2],
    })
    class IAppModule {}

    const app = await createApplication(IAppModule)
    const fetcher = (req: Request) => Promise.resolve(app.getInstance().fetch(req))
    const res = await fetcher(new Request('http://localhost/iapp'))
    expect(await res.text()).toBe('pong|gx')
    await app.close('app-interceptor')
  })

  it('applies APP_FILTER as a global filter (useFactory)', async () => {
    @injectable()
    class AppFilter2 implements ExceptionFilter {
      async catch(_e: unknown, _host: ArgumentsHost) {
        return new Response(JSON.stringify({ handled: 'app' }), {
          status: 499,
          headers: {
            'content-type': 'application/json',
          },
        })
      }
    }

    @injectable()
    @Controller('fapp')
    class FAppController {
      @Get('/')
      boom() {
        throw new Error('oops')
      }
    }

    @Module({
      controllers: [FAppController],
      providers: [
        {
          provide: APP_FILTER as unknown as Constructor,
          useFactory: () => new AppFilter2(),
        },
      ],
    })
    class FAppModule {}

    const app = await createApplication(FAppModule)
    const fetcher = (req: Request) => Promise.resolve(app.getInstance().fetch(req))
    const res = await fetcher(new Request('http://localhost/fapp'))
    expect(res.status).toBe(499)
    expect(await res.json()).toEqual({ handled: 'app' })
    await app.close('app-filter')
  })

  it('auto-registers class decorators for interceptors/filters/pipes without providers', async () => {
    @injectable()
    class InlineInterceptor2 implements Interceptor {
      async intercept(_ctx: ExecutionContext, next: CallHandler): Promise<FrameworkResponse> {
        const result = await next.handle()
        const text = await result.text()
        return new Response(`${text}|inlined`, { headers: result.headers, status: result.status }) as FrameworkResponse
      }
    }

    @injectable()
    class InlineFilter2 implements ExceptionFilter {
      async catch(_e: unknown, host: ArgumentsHost) {
        const ctx = host.getContext().hono
        return ctx.json({ ok: true }, 208)
      }
    }

    @injectable()
    class InlinePipe2 implements PipeTransform<unknown, string> {
      transform(value: unknown) {
        return `${String(value)}-piped`
      }
    }

    @injectable()
    @Controller('inline2')
    class Inline2Controller {
      @Get('/i')
      @UseInterceptors(InlineInterceptor2)
      i() {
        return 'OK'
      }

      @Get('/e')
      @UseFilters(InlineFilter2)
      e() {
        throw new Error('x')
      }

      @Get('/p/:id')
      p(@Param('id', InlinePipe2) id: string) {
        return id
      }
    }

    @Module({ controllers: [Inline2Controller] })
    class Inline2Module {}

    const app = await createApplication(Inline2Module)
    const fetcher = (req: Request) => Promise.resolve(app.getInstance().fetch(req))

    const r1 = await fetcher(new Request('http://localhost/inline2/i'))
    expect(await r1.text()).toBe('OK|inlined')

    const r2 = await fetcher(new Request('http://localhost/inline2/e'))
    expect(r2.status).toBe(208)
    expect(await r2.json()).toEqual({ ok: true })

    const r3 = await fetcher(new Request('http://localhost/inline2/p/abc'))
    expect(await r3.text()).toBe('abc-piped')

    await app.close('inline2')
  })

  it('applies APP_MIDDLEWARE providers with DI support and priority ordering', async () => {
    const app = await createApplication(MiddlewareTestModule)
    const hono = app.getInstance()
    const fetcher = (req: Request) => Promise.resolve(hono.fetch(req))
    const response = await fetcher(new Request('http://localhost/middleware'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })

    const tracker = app.getContainer().resolve(MiddlewareTracker)
    expect(tracker.events).toEqual([
      'first-before:/middleware',
      'second-before:/middleware',
      'handler',
      'second-after:/middleware',
      'first-after:/middleware',
    ])

    await app.close('middleware')
  })
})

describe('Advanced provider registrations and middleware metadata', () => {
  it('covers provider configuration permutations and middleware metadata merging', async () => {
    const TRANSIENT_TOKEN = Symbol('TRANSIENT_TOKEN')
    const ALIAS_TOKEN = Symbol('ALIAS_TOKEN')
    const VALUE_TOKEN = Symbol('VALUE_TOKEN')
    const SINGLETON_FACTORY_TOKEN = Symbol('SINGLETON_FACTORY_TOKEN')
    const TRANSIENT_FACTORY_TOKEN = Symbol('TRANSIENT_FACTORY_TOKEN')
    const SINGLETON_CLASS_TOKEN = Symbol('SINGLETON_CLASS_TOKEN')

    const middlewareEvents: string[] = []
    const lifecycleEvents: string[] = []
    let transientConstructs = 0
    let singletonFactoryCreates = 0
    let transientFactoryCreates = 0

    class ArrayPathMiddleware implements HttpMiddleware, OnModuleDestroy {
      async use(context: Context, next: Next): Promise<void> {
        middlewareEvents.push(`array-before:${context.req.path}`)
        await next()
        middlewareEvents.push(`array-after:${context.req.path}`)
      }

      onModuleDestroy(): void {
        lifecycleEvents.push('array:destroy')
      }
    }

    @Middleware({ path: '/api/coverage/decorated', priority: 2 })
    @injectable()
    class DecoratedCoverageMiddleware implements HttpMiddleware, OnModuleDestroy {
      async use(context: Context, next: Next): Promise<void> {
        middlewareEvents.push(`decorated-before:${context.req.path}`)
        await next()
        middlewareEvents.push(`decorated-after:${context.req.path}`)
      }

      onModuleDestroy(): void {
        lifecycleEvents.push('decorated:destroy')
      }
    }

    class PlainGlobalMiddleware implements HttpMiddleware, OnModuleDestroy {
      async use(context: Context, next: Next): Promise<void> {
        middlewareEvents.push(`plain-before:${context.req.path}`)
        await next()
        middlewareEvents.push(`plain-after:${context.req.path}`)
      }

      onModuleDestroy(): void {
        lifecycleEvents.push('plain:destroy')
      }
    }

    const lifecycleValue = {
      destroyed: false,
      onApplicationShutdown(signal?: string) {
        lifecycleEvents.push(`value:shutdown:${signal ?? 'none'}`)
        this.destroyed = true
      },
    }

    @injectable()
    class TransientClass {
      constructor() {
        transientConstructs += 1
      }

      ping() {
        return 'transient'
      }
    }

    @injectable()
    class SingletonService {
      public readonly createdAt = Date.now()
    }

    @injectable()
    @Controller('coverage')
    class CoverageController {
      @Get('/ping')
      ping() {
        return 'pong'
      }

      @Get('/decorated')
      decorated() {
        return 'decorated'
      }
    }

    const arrayMiddlewareInstance = new ArrayPathMiddleware()

    @Module({
      controllers: [CoverageController],
      providers: [
        DecoratedCoverageMiddleware,
        TransientClass,
        {
          provide: TRANSIENT_TOKEN,
          useClass: TransientClass,
          singleton: false,
        },
        {
          provide: SINGLETON_CLASS_TOKEN,
          useClass: SingletonService,
        },
        {
          provide: ALIAS_TOKEN,
          useExisting: TransientClass,
        },
        {
          provide: VALUE_TOKEN,
          useValue: lifecycleValue,
        },
        {
          provide: SINGLETON_FACTORY_TOKEN,
          useFactory: (value: typeof lifecycleValue) => {
            singletonFactoryCreates += 1
            const product = {
              destroyed: false,
              source: value,
              onModuleDestroy() {
                this.destroyed = true
                lifecycleEvents.push('factory:singleton:destroy')
              },
            }
            lifecycleEvents.push('factory:singleton:create')
            return product
          },
          inject: [VALUE_TOKEN],
        },
        {
          provide: TRANSIENT_FACTORY_TOKEN,
          singleton: false,
          useFactory: () => {
            transientFactoryCreates += 1
            return { stamp: Symbol('transient') }
          },
        },
        {
          provide: APP_MIDDLEWARE as unknown as Constructor,
          useValue: {
            handler: arrayMiddlewareInstance,
            path: ['/api/coverage/ping', '/api/coverage/extra'],
            priority: -5,
          },
        },
        {
          provide: APP_MIDDLEWARE as unknown as Constructor,
          useExisting: DecoratedCoverageMiddleware,
        },
        {
          provide: APP_MIDDLEWARE as unknown as Constructor,
          useFactory: () => new PlainGlobalMiddleware(),
        },
      ],
    })
    class CoverageModule {}

    const app = await createApplication(CoverageModule, { globalPrefix: '/api' })
    const fetcher = (req: Request) => Promise.resolve(app.getInstance().fetch(req))

    const firstResponse = await fetcher(new Request('http://localhost/api/coverage/ping'))
    expect(await firstResponse.text()).toBe('pong')

    const decoratedResponse = await fetcher(new Request('http://localhost/api/coverage/decorated'))
    expect(await decoratedResponse.text()).toBe('decorated')

    expect(middlewareEvents).toEqual([
      'array-before:/api/coverage/ping',
      'plain-before:/api/coverage/ping',
      'plain-after:/api/coverage/ping',
      'array-after:/api/coverage/ping',
      'plain-before:/api/coverage/decorated',
      'decorated-before:/api/coverage/decorated',
      'decorated-after:/api/coverage/decorated',
      'plain-after:/api/coverage/decorated',
    ])

    const container = app.getContainer()

    const transientA = container.resolve(TRANSIENT_TOKEN as any)
    const transientB = container.resolve(TRANSIENT_TOKEN as any)
    expect(transientA).not.toBe(transientB)
    expect(transientConstructs).toBeGreaterThanOrEqual(2)

    const singletonClassA = container.resolve(SINGLETON_CLASS_TOKEN as any)
    const singletonClassB = container.resolve(SINGLETON_CLASS_TOKEN as any)
    expect(singletonClassA).toBe(singletonClassB)

    const aliasResolved = container.resolve(ALIAS_TOKEN as any)
    const original = container.resolve(TransientClass)
    expect(aliasResolved).toBe(original)

    const valueResolved = container.resolve(VALUE_TOKEN as any)
    expect(valueResolved).toBe(lifecycleValue)

    const singletonA = container.resolve(SINGLETON_FACTORY_TOKEN as any)
    const singletonB = container.resolve(SINGLETON_FACTORY_TOKEN as any)
    expect(singletonA).toBe(singletonB)
    expect(singletonFactoryCreates).toBe(1)

    const transientFactoryA = container.resolve(TRANSIENT_FACTORY_TOKEN as any)
    const transientFactoryB = container.resolve(TRANSIENT_FACTORY_TOKEN as any)
    expect(transientFactoryA).not.toBe(transientFactoryB)
    expect(transientFactoryCreates).toBe(2)

    await app.close('advanced-providers')

    expect(lifecycleValue.destroyed).toBe(true)
    expect(lifecycleEvents).toContain('value:shutdown:advanced-providers')
    expect(lifecycleEvents).toContain('factory:singleton:destroy')
    expect(lifecycleEvents).toContain('plain:destroy')
    expect(lifecycleEvents).toContain('decorated:destroy')
    expect(lifecycleEvents).toContain('array:destroy')
  })

  it('throws descriptive error for invalid middleware values', async () => {
    @Module({
      providers: [
        {
          provide: APP_MIDDLEWARE as unknown as Constructor,
          useValue: { handler: {} },
        },
      ],
    })
    class BrokenMiddlewareModule {}

    await expect(createApplication(BrokenMiddlewareModule)).rejects.toThrowError(
      /Invalid middleware configuration: expected Middleware or MiddlewareDefinition instance/,
    )
  })

  it('throws descriptive error for malformed global enhancer definitions', async () => {
    @Module({
      providers: [
        {
          provide: APP_GUARD as unknown as Constructor,
        } as any,
      ],
    })
    class BrokenGlobalEnhancerModule {}

    await expect(createApplication(BrokenGlobalEnhancerModule)).rejects.toThrowError(
      /Invalid global enhancer configuration/,
    )
  })
})
