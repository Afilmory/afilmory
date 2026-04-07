# Hono Enterprise Template

A NestJS‑inspired, Hono‑powered enterprise template for building modular, type‑safe HTTP services. The core framework package ships with dependency injection, decorators, guards, pipes, interceptors, exception filters, request‑scoped context, and an extensible pretty logger. The framework tests achieve 100% coverage and the sample app demonstrates all enhancement paths end‑to‑end.

## ✨ Features

- **Hono application layer**: Hono performance with opinionated structure and decorators.
- **Modular architecture + DI**: `tsyringe`-based container, constructor injection, module imports/exports.
- **Request context**: `HttpContext` built on `AsyncLocalStorage` to safely access the current `Context` anywhere.
- **Composables (enhancers)**: Guards, Pipes, Interceptors, and Exception Filters with a declarative API.
- **Zod validation pipe**: metadata-driven DTO validation via `createZodValidationPipe({ ... })` and `@ZodSchema` decorators.
- **Pretty logger**: Namespaced, colorized output with CI-safe text labels and hierarchical `extend()`.
- **Task queue decorators**: Register background job handlers with `@TaskProcessor()` and let the queue wire itself up.
- **OpenAPI explorer**: Generate OpenAPI 3.1 docs from decorators and serve them through Scalar.
- **First-class testing**: Framework Vitest suite with 100% coverage; demo app covers all enhancer paths.
- **Infrastructure providers via DI**: Postgres (Drizzle) and Redis (ioredis) wired as modules.

## 📁 Monorepo Layout

| Path                       | Description                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/core`                | Demo application showcasing modules, controllers, and all enhancers; usable as a starter |
| `packages/framework`       | Core framework: `HonoHttpApplication`, decorators, HTTP context, logger, Zod pipe, etc.  |
| `packages/framework/tests` | Vitest suite for the framework with coverage and lifecycle tests                         |
| `packages/db`              | Drizzle schema & types plus migrations configuration                                     |
| `packages/env`             | Runtime env validation powered by `@t3-oss/env-core`                                     |
| `packages/redis`           | Redis client factory (`ioredis`) and strong types                                        |
| `packages/websocket`       | Redis-backed WebSocket gateway with pub/sub broker, heartbeat management, and logging    |

## ✅ Requirements

- Node.js 18+ (uses `AsyncLocalStorage` and modern ESM tooling)
- pnpm 10+
- TypeScript 5.9

## 🚀 Quickstart

```bash
# install dependencies
pnpm install

# run framework tests (with coverage)
pnpm -C packages/framework test

# run demo app tests
pnpm -C apps/core test

# start the demo app (vite-node)
pnpm -C apps/core dev

# or run the in-process demo runner
pnpm -C apps/web dev
```

Coverage reports are generated at `packages/framework/coverage`.

## 🔧 Environment

Create a `.env` file at the repo root with at least:

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/db
REDIS_URL=redis://localhost:6379

# Optional WebSocket gateway configuration
# WEBSOCKET_ENABLED=true
# WEBSOCKET_PORT=8081
# WEBSOCKET_PATH=/ws
# WEBSOCKET_HEARTBEAT_INTERVAL_MS=30000

# Optional Postgres pool tuning
PG_POOL_MAX=10
PG_IDLE_TIMEOUT=30000
PG_CONN_TIMEOUT=5000
```

## 🧱 Architecture & Runtime Model

### 1) Modules and Controllers

```ts
import { Controller, Get, Query, UseGuards, Module } from '@tsuki/framework'

@Controller('demo')
export class DemoController {
  constructor(private readonly service: DemoService) {}

  @Get('/hello')
  @UseGuards(ApiKeyGuard)
  async greet(@Query('name') name: string) {
    return this.service.greet(name)
  }
}

@Module({
  controllers: [DemoController],
  providers: [DemoService, ApiKeyGuard],
})
export class DemoModule {}
```

Bootstrapping with `createApplication(RootModule, options)` performs:

1. Recursive module registration via `imports`.
2. DI registration of `providers` and `controllers` using `tsyringe`.
3. Route discovery from class/method decorators and mapping to Hono.
4. Per-request pipeline: Guards → Pipes (global/method/parameter) → Interceptors → Controller → Filters.

### 1.1) Provider Lifecycle

Providers and controllers may implement lifecycle interfaces inspired by NestJS:

- `OnModuleInit` → `onModuleInit()` after a module and its imports finish registering.
- `OnApplicationBootstrap` → `onApplicationBootstrap()` after the app finishes initialization.
- `BeforeApplicationShutdown` → `beforeApplicationShutdown(signal?)` prior to shutdown.
- `OnModuleDestroy` → `onModuleDestroy()` during teardown.
- `OnApplicationShutdown` → `onApplicationShutdown(signal?)` as the final shutdown step.

Call `await app.close('SIGTERM')` on the `HonoHttpApplication` instance to trigger shutdown hooks.

### 2) Enhancers (Guards, Pipes, Interceptors, Filters)

- `@UseGuards(...guards)`: `CanActivate.canActivate(ctx)` returning `boolean | Promise<boolean>`. `false` throws `ForbiddenException`.
- `@UsePipes(...pipes)` and parameter-level pipes (e.g., `@Param('id', ParseIntPipe)`): merged globally and per-method.
- `@UseInterceptors(...interceptors)`: `interceptor.intercept(context, next)` chaining.
- `@UseFilters(...filters)`: handle and customize error responses; unhandled errors return a 500 JSON payload.

Zod validation is provided by registering DTO classes with `createZodSchemaDto(...)` (or the lower-level `@ZodSchema(...)`) and enabling a global `createZodValidationPipe({ ... })`. See `packages/framework/tests/application.spec.ts` for full examples.

### 2.5) Infrastructure Modules: Database (Postgres) and Redis

Both the database and Redis are registered as DI-driven modules in the demo app.

- Database lives under `apps/core/src/database` and exposes a `DbAccessor` that returns a request-aware Drizzle instance.
- Redis lives under `apps/core/src/redis` and exposes a `RedisAccessor` that returns a singleton `ioredis` client.

Ensure `DatabaseModule` and `RedisModule` are imported by your root module (already wired in the demo):

```ts
import { Module } from '@tsuki/framework'
import { DatabaseModule } from '../database/module'
import { RedisModule } from '../redis/module'
import { AppModule } from './app/app.module'

@Module({
  imports: [DatabaseModule, RedisModule, AppModule],
})
export class AppModules {}
```

Using Redis from a service via DI:

```ts
import { injectable } from 'tsyringe'
import { RedisAccessor } from '../redis/providers'

@injectable()
export class CacheService {
  constructor(private readonly redis: RedisAccessor) {}

  async setGreeting(key: string, name: string): Promise<void> {
    await this.redis.get().set(key, name, 'EX', 60)
  }

  async getGreeting(key: string): Promise<string | null> {
    return await this.redis.get().get(key)
  }
}
```

### 2.6) WebSocket Gateway

The `@afilmory/websocket` package provides a Redis-backed WebSocket gateway with channel subscriptions, Redis pub/sub fan-out, and automatic heartbeat/ping management. The demo app exposes it through `WebSocketDemoModule` (disabled by default). The `/api/websocket/info` route reports status, and `/api/websocket/channels/:channel/publish` publishes payloads to connected clients.

### 2.7) Task Queue with Decorators

The `@afilmory/task-queue` package ships with a decorator-driven registration model so workers only need to annotate their handler methods:

```ts
import { injectable } from 'tsyringe'
import { OnModuleDestroy, OnModuleInit } from '@tsuki/framework'
import { RedisQueueDriver, TaskContext, TaskProcessor, TaskQueue, TaskQueueManager } from '@afilmory/task-queue'

@injectable()
export class NotificationQueue implements OnModuleInit, OnModuleDestroy {
  public queue!: TaskQueue

  constructor(
    private readonly manager: TaskQueueManager,
    private readonly redis: RedisAccessor,
  ) {}

  async onModuleInit(): Promise<void> {
    const driver = new RedisQueueDriver({
      redis: this.redis.get(),
      queueName: 'core:notifications',
      visibilityTimeoutMs: 45_000,
    })

    this.queue = this.manager.createQueue('notifications', {
      driver,
      start: false,
      middlewares: [
        async (ctx, next) => {
          ctx.logger.debug('start', { taskId: ctx.taskId })
          await next()
        },
      ],
    })

    await this.queue.start({ pollIntervalMs: 250 })
  }

  @TaskProcessor('send-notification', {
    options: {
      maxAttempts: 5,
      retryableFilter: () => true,
      backoffStrategy: (attempt) => Math.min(30_000, 2 ** attempt * 250),
    },
  })
  async sendNotification(payload: NotificationPayload, context: TaskContext<NotificationPayload>): Promise<void> {
    // business logic here
    context.logger.info('Delivered notification', { taskId: context.taskId })
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.shutdown()
  }
}
```

`@TaskProcessor()` delays registration until `onModuleInit` finishes so that the queue instance is ready, supports alternate queue property names, and accepts per-handler options (or an options factory). Any service can inject the queue to enqueue work:

```ts
@injectable()
export class NotificationService {
  constructor(private readonly worker: NotificationQueue) {}

  async enqueue(payload: NotificationPayload) {
    return await this.worker.queue.enqueue({ name: 'send-notification', payload })
  }
}
```

### 2.8) OpenAPI & Interactive Docs

The framework can build an OpenAPI 3.1 document directly from module and controller decorators and expose it alongside a Scalar-powered UI.

```ts
import type { Hono } from 'hono'
import { ApiDoc, ApiTags, createOpenApiDocument } from '@tsuki/framework'

import { AppModules } from './modules/index.module'

function registerDocs(app: Hono, prefix = '/api') {
  const document = createOpenApiDocument(AppModules, {
    title: 'Core Service API',
    version: '1.0.0',
    description: 'Decorator-generated OpenAPI spec',
    globalPrefix: prefix,
    servers: [{ url: prefix }],
  })

  const specPath = `${prefix}/openapi.json`
  const docsPath = `${prefix}/docs`

  app.get(specPath, (ctx) => ctx.json(document))
  app.get(docsPath, (ctx) => ctx.html(renderScalarHtml(specPath)))
}
```

`createOpenApiDocument()` groups operations by module and controller, providing consistent tags for consumers, while the Scalar embed above mirrors the recommended CDN integration.

Decorate controllers or individual handlers with `@ApiTags()` to introduce domain-specific groupings, and use `@ApiDoc({ summary, tags, deprecated, ... })` to fine-tune operation metadata without leaving your code.

### 3) Result Handling

Handlers may return `Response`, `string`, `ArrayBuffer`, `ArrayBufferView`, `ReadableStream`, or plain objects. Non-`Response` values are normalized to a proper HTTP response. `undefined` or returning `context.res` preserves the current response.

### 4) Logger

```ts
import { createLogger } from '@tsuki/framework'

const logger = createLogger('App')
logger.info('Service started')
logger.warn('Auth failed', { userId })

const scoped = logger.extend('Module')
scoped.debug('Loaded')
```

Logger options include custom writer, color strategy, clock, per-level colors, and CI-safe text labels. The framework uses namespaces `Framework`, `Framework:DI`, and `Framework:Router` internally.

### 5) Request Context

`HttpContext.run(context, fn)` establishes a request scope backed by `AsyncLocalStorage`. The store is a typed object that always includes the active Hono `Context` as `store.hono` and can be extended via module augmentation. Use `HttpContext.get()`/`HttpContext.getValue('hono')` inside guards, interceptors, or services, and `HttpContext.assign()`/`setValue()` to attach custom request metadata.

## 🧪 Testing & Quality

- Framework tests: `pnpm -C packages/framework test` (coverage threshold 100%).
- Demo app tests: `pnpm -C apps/core test`.
- Type checking: use TypeScript 5.9; optionally run `pnpm tsc --noEmit` at the repo root.

## 🧩 Developer Guide

### Bootstrapping an App

```ts
import 'reflect-metadata'
import { serve } from '@hono/node-server'
import { createApplication, createZodValidationPipe } from '@tsuki/framework'
import { AppModule } from './app.module'

const ValidationPipe = createZodValidationPipe({
  transform: true,
  whitelist: true,
  errorHttpStatusCode: 422,
  forbidUnknownValues: true,
})

const app = await createApplication(AppModule, { globalPrefix: '/api' })
app.useGlobalPipes(ValidationPipe)
app.useGlobalFilters(AllExceptionsFilter)
app.useGlobalInterceptors(LoggingInterceptor)

const hono = app.getInstance()

serve({ fetch: hono.fetch, port: 3000 })
```

### Dependency Injection & Types

Use `tsyringe` decorators for providers and constructor injection. When running through transpilers that strip design metadata (e.g. esbuild), add a `Reflect.metadata` shim so runtime DI still sees parameter types:

```ts
import 'reflect-metadata'
import { injectable } from 'tsyringe'
import { Controller, Get } from '@tsuki/framework'

@injectable()
class AppService {
  getHello(echo?: string | null) {
    return {
      message: 'Hello',
      timestamp: new Date().toISOString(),
      echo: echo ?? undefined,
    }
  }
}

@Controller('app')
@injectable()
@Reflect.metadata('design:paramtypes', [AppService])
class AppController {
  constructor(private readonly service: AppService) {}

  @Get('/')
  getRoot() {
    return this.service.getHello()
  }
}
```

### Parameter Decorators

`@Body`, `@Query`, `@Param`, `@Headers`, `@Req`, `@ContextParam` extract values and optionally run per-parameter pipes.

### Exceptions

Throw `HttpException` or built-ins like `BadRequestException`, `ForbiddenException`, `NotFoundException`. Custom filters may translate errors into consistent API responses.

### Validation with Zod

```ts
import { z } from 'zod'
import { Body, Controller, Post, createZodSchemaDto } from '@tsuki/framework'

const CreateMessageSchema = z.object({
  message: z.string().min(1),
  tags: z.array(z.string()).default([]),
})

class CreateMessageDto extends createZodSchemaDto(CreateMessageSchema) {}

@Controller('messages')
class MessagesController {
  @Post('/:id')
  create(@Body() body: CreateMessageDto) {
    return { status: 'queued', ...body }
  }
}
```

Alternative: call `createZodDto(CreateMessageSchema)` to obtain a ready-to-use class without extending.

## 📜 Scripts

In `apps/core/package.json`:

- `dev`: start the demo server with vite-node.
- `demo`: run an in-process demo exercising routes and enhancers.
- `test`: run tests for the demo app.

## 🔗 References & Inspiration

- [NestJS](https://nestjs.com/) — decorator-driven, layered application architecture.
- [Hono](https://hono.dev/) — small, fast web framework.
- [tsyringe](https://github.com/microsoft/tsyringe) — lightweight dependency injection container.
- [Zod](https://zod.dev/) — type-safe schema validation.

---

Customize the framework under `packages/framework/src` and use `apps/core` as a reference implementation for modules, controllers, and enhancers. Consider extending with enterprise capabilities (configuration, CQRS, event bus, etc.) as your project evolves.
