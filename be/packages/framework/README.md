<div align="center">

# @tsuki/framework

A lightweight yet feature-complete enterprise framework built on Hono, providing NestJS-like modularity, decorators, and dependency injection while retaining Hono's performance and flexibility.

</div>

## 📚 Table of Contents

- [Framework Positioning & Features](#framework-positioning--features)
- [Quick Start](#quick-start)
- [Framework Architecture](#framework-architecture)
  - [Module System](#module-system)
  - [Dependency Injection & Provider Lifecycle](#dependency-injection--provider-lifecycle)
  - [Controllers & Route Mapping](#controllers--route-mapping)
  - [Enhancer System: Guards, Pipes, Interceptors, Exception Filters](#enhancer-system-guards-pipes-interceptors-exception-filters)
  - [Middleware System](#middleware-system)
  - [Request Context HttpContext](#request-context-httpcontext)
  - [Validation & DTOs](#validation--dtos)
  - [Logging System](#logging-system)
  - [OpenAPI Document Generation](#openapi-document-generation)
  - [Event System](#event-system)
- [Request Execution Flow](#request-execution-flow)
- [Lifecycle Hooks & Application Management](#lifecycle-hooks--application-management)
- [Testing Strategy](#testing-strategy)
- [Best Practices & Common Pitfalls](#best-practices--common-pitfalls)
- [Reference Implementation & Examples](#reference-implementation--examples)

---

## Framework Positioning & Features

`@tsuki/framework` is a server-side framework built around Hono, aimed at providing an enterprise-grade development experience while maintaining performance:

- **Decorator-Driven**: Modules, controllers, routes, parameters, and enhancers are all declared using decorators.
- **Dependency Injection**: Container based on `tsyringe`, supporting singleton/factory/provider configurations with strict checking for unregistered dependencies.
- **Request-Scoped Context**: Implemented using `AsyncLocalStorage`, enabling access to Hono `Context` and custom values at any level.
- **Enhancer System**: Guards, Pipes, Interceptors, and Exception Filters work in layers, applicable globally/controller-level/method-level.
- **Type-Safe Validation**: Strong typing for requests through Zod schemas + DTO generators.
- **Modern Logging**: `PrettyLogger` provides namespaces, colored output, and level control.
- **OpenAPI Support**: Automatically collects decorator metadata to generate OpenAPI 3.1 specification documents.
- **Event-Driven Extension**: Built-in Redis-driven event system supporting cross-process pub/sub.

## Quick Start

```ts
// main.ts
import 'reflect-metadata'
import { serve } from '@hono/node-server'
import { createApplication } from '@tsuki/framework'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await createApplication(AppModule, {
    globalPrefix: '/api',
  })

  // Register global enhancers (optional) — pass INSTANCES
  // app.useGlobalGuards(new AuthGuard())
  // app.useGlobalPipes(new ValidationPipe())
  // Or use APP_* tokens in module providers (see below)

  const hono = app.getInstance()
  serve({ fetch: hono.fetch, port: 3000 })
}

bootstrap()
```

```ts
// app.module.ts
import { Module, Controller, Get } from '@tsuki/framework'

@Controller('hello')
class HelloController {
  @Get('/')
  sayHi() {
    return { message: 'Hello afilmory!' }
  }
}

@Module({ controllers: [HelloController] })
export class AppModule {}
```

## Framework Architecture

### Module System

- Declare modules using the `@Module` decorator, organizing business logic in three parts: `imports`, `controllers`, and `providers`.
- Supports `forwardRef(() => OtherModule)` to resolve circular dependencies.
- Modules are initialized only once (singleton) and maintain their own provider collection.
- Controller instantiation is delayed until route registration; Providers can be instantiated early before lifecycle hooks.

```ts
@Module({
  imports: [DatabaseModule],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
```

### Dependency Injection & Provider Lifecycle

- Container based on `tsyringe`; framework creates an independent container instance for the root module at startup and stores it in the global `ContainerRef`.
- Provider support:
  - Direct class registration (singleton by default).
  - `useClass` / `useValue` / `useExisting` / `useFactory`.
  - `singleton: false` can declare non-singleton providers.
- **Strict DI with smart exceptions**:
  - Container is patched: attempting to resolve unregistered tokens throws a `ReferenceError`, helping quickly locate DI configuration issues.
  - **Exception**: Classes referenced in enhancer decorators (`@UseGuards`, `@UsePipes`, `@UseInterceptors`, `@UseFilters`) are auto-registered as singletons on first use, so they don't need to be listed in `providers` unless they have dependencies.
- Framework automatically detects Providers implementing lifecycle interfaces and invokes their hooks at appropriate times.

```ts
@injectable()
export class UserService implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {}
  async onModuleDestroy() {}
}
```

### Controllers & Route Mapping

- `@Controller(prefix)` specifies the base path; HTTP method decorators (`@Get`, `@Post`, etc.) declare routes.
- Framework reads controller metadata and registers corresponding handlers on the Hono instance.
- Route parameters are injected via parameter decorators (`@Param`, `@Query`, `@Body`, `@Headers`, `@Req`, `@ContextParam`).
- Parameters without decorators are automatically inferred as `Context`, allowing direct access.

### Enhancer System: Guards, Pipes, Interceptors, Exception Filters

- `@UseGuards` / `@UsePipes` / `@UseInterceptors` / `@UseFilters` provide a unified interface, supporting both class-level and method-level stacking.
- **Auto-registration of decorator classes**: Class references in decorators (e.g., `@UseGuards(AuthGuard)`) are automatically registered as singletons on first use. You don't need to list them in `providers` if they have no extra dependencies. If they depend on other services, those dependencies must still be registered in a module.
- **Global enhancers** can be registered in two ways:
  1. **Instance-based** via `app.useGlobal*()` — pass instances only:
     ```ts
     app.useGlobalGuards(new AuthGuard())
     app.useGlobalPipes(new ValidationPipe())
     app.useGlobalInterceptors(new LoggingInterceptor())
     app.useGlobalFilters(new AllExceptionsFilter())
     app.useGlobalMiddlewares({
       handler: new RequestTracingMiddleware(),
       path: ['/api/*', /auth/],
       priority: -10,
     })
     ```
  2. **Module-based** via `APP_*` tokens in providers (NestJS-style):

     ```ts
     import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_MIDDLEWARE, APP_PIPE } from '@tsuki/framework'

     @Module({
       providers: [
         { provide: APP_GUARD, useClass: AuthGuard },
         { provide: APP_PIPE, useValue: preconfiguredPipe },
         { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
         { provide: APP_INTERCEPTOR, useClass: ResponseTransformInterceptor },
         { provide: APP_FILTER, useFactory: (...deps) => new CustomFilter(...deps), inject: [Logger] },
         { provide: APP_MIDDLEWARE, useClass: RequestTracingMiddleware },
       ],
     })
     export class AppModule {}
     ```

     These are materialized during `init()` before controllers are bound.

- Execution order:
  1.  Global guards → Controller guards → Method guards.
  2.  Interceptors wrap handlers in a stack, supporting pre/post-request processing (logging, caching, response wrapping, etc.).
  3.  Pipes act on input parameters, enabling DTO validation and transformation with Zod engine.
  4.  Exception filters handle errors and return custom Responses.

### Middleware System

- Middlewares implement the `HttpMiddleware` interface and expose an async `use(context, next)` method. Decorate classes with `@Middleware({ path, priority })` to attach optional routing metadata.
- When no metadata is provided, the framework defaults to `path: '/*'` and `priority: 0`. Lower priority values run earlier; definitions are sorted before registration so fallback values still participate in ordering.
- Metadata from `@Middleware` and `MiddlewareDefinition` objects is merged—explicit properties win, decorator values fill the gaps. Supported paths include strings, regular expressions, or arrays of both.
- Registration options:
  - Call `app.useGlobalMiddlewares()` with one or more `MiddlewareDefinition` objects. Each definition must include a `handler` instance; `path` and `priority` remain optional.
  - Provide middlewares through the dependency-injected `APP_MIDDLEWARE` token using `useClass`, `useExisting`, `useValue`, or `useFactory`. Factories may return either a `HttpMiddleware` instance or a full `MiddlewareDefinition`.
- Middleware handlers participate in lifecycle hooks (`OnModuleInit`, `OnModuleDestroy`, etc.) just like other providers.

```ts
import type { Context, Next } from 'hono'
import { APP_MIDDLEWARE, Middleware } from '@tsuki/framework'
import { injectable } from 'tsyringe'

// Logger, CacheService, and LegacyMiddleware are regular injectables.

@Middleware({ path: ['/api/*', /reports/], priority: -20 })
@injectable()
class RequestTracingMiddleware {
  constructor(private readonly logger: Logger) {}

  async use(context: Context, next: Next) {
    const start = Date.now()
    await next()
    this.logger.info('request', {
      path: context.req.path,
      durationMs: Date.now() - start,
    })
  }
}

@Module({
  providers: [
    Logger,
    { provide: APP_MIDDLEWARE, useClass: RequestTracingMiddleware },
    {
      provide: APP_MIDDLEWARE,
      useFactory: (cache: CacheService) => ({
        handler: {
          async use(context: Context, next: Next) {
            await next()
            cache.touch(context.req.path)
          },
        },
        path: '/static/*',
        priority: 10,
      }),
      inject: [CacheService],
    },
  ],
})
export class AppModule {}

// Or register imperatively after bootstrap
app.useGlobalMiddlewares({ handler: new LegacyMiddleware(), path: '/legacy' })
```

### Request Context HttpContext

- Provides request-scoped data container via `AsyncLocalStorage`, with the current Hono `Context` injected by default.
- Within any Provider/guard/interceptor, call `HttpContext.get()` or `HttpContext.getValue('hono')` to retrieve context.
- Supports `HttpContext.assign({ userId })` to extend custom values, with type augmentation via module declaration.

```ts
declare module '@tsuki/framework' {
  interface HttpContextValues {
    userId?: string
  }
}

HttpContext.assign({ userId: 'u_123' })
```

### Validation & DTOs

- `createZodSchemaDto` / `createZodDto` helper functions: automatically generate DTO classes from Zod Schemas and write metadata.
- `ZodValidationPipe`:
  - Transforms to DTO instances by default.
  - Supports strategies like whitelist / forbidUnknownValues / stopAtFirstError.
  - Validation failures throw `HttpException` with structured `errors`.
- Pre-configured pipes can be generated using `createZodValidationPipe(options)`.

```ts
const CreateUserSchema = z.object({ email: z.string().email() })
class CreateUserDto extends createZodSchemaDto(CreateUserSchema) {}

@Post('/')
async create(@Body(CreateUserValidationPipe) dto: CreateUserDto) {
	return this.service.create(dto)
}
```

### Logging System

- `PrettyLogger` supports:
  - Namespace levels (`logger.extend('Router')`).
  - Colored output, symbol/text labels, timestamps.
  - Minimum log level (can be auto-downgraded to debug via `DEBUG=true`).
- Framework prints debug logs for DI, routing, lifecycle, etc. at critical stages.

### OpenAPI Document Generation

- `createOpenApiDocument(rootModule, options)` collects module → controller → route hierarchy information.
- Automatically recognizes:
  - Paths, HTTP methods, OperationIds.
  - Parameter locations (path/query/header) and request body schemas.
  - Zod Schema → JSON Schema conversion (supports optional/nullable, enums, unions, nested structures).
  - Custom `@ApiTags`, `@ApiDoc` metadata.
- Outputs complete OpenAPI 3.1 compliant documentation, including component schemas and module topology (`x-modules`).

### Event System

- Located in `src/events`, provides:
  - `@OnEvent(event)` annotation marks methods as consumers.
  - `@EmitEvent(event)` automatically publishes events after method success.
  - `EventEmitterService` uses Redis Pub/Sub for cross-instance broadcasting.
  - `EventModule.forRootAsync({ useFactory })` supports async initialization of Redis Client.
- Runtime scans container for listeners and auto-binds them; releases subscriptions on graceful shutdown.

## Request Execution Flow

```text
Inbound Request
	└─> HttpContext.run() establishes request context
			 ├─ Guards (global → controller → method)
			 ├─ Interceptors (forward pre-logic)
			 ├─ Parameter resolution & pipe transformation
			 ├─ Controller handler
			 ├─ Interceptors (reverse post-logic)
			 ├─ Exception filters (if error thrown)
			 └─ Normalized Response output
```

The framework preserves the original `context.res` when no explicit return, or automatically wraps objects/strings into Response with marking to avoid duplicate serialization.

## Lifecycle Hooks & Application Management

Providers implementing the following interfaces are automatically registered:

- `OnModuleInit` / `OnModuleDestroy`
- `OnApplicationBootstrap`
- `BeforeApplicationShutdown`
- `OnApplicationShutdown`

`HonoHttpApplication` during `init()`:

1. Recursively registers modules and Providers.
2. Collects lifecycle participants and instantiates on demand.
3. Registers controllers and routes.
4. Invokes `onApplicationBootstrap()`.

`close(signal?)` is used for graceful shutdown, triggering in order: `before → moduleDestroy → applicationShutdown`.

## Testing Strategy

**Global enhancers:**

`useGlobal*` methods accept instances created with `new` (not resolved from container). For middlewares, wrap the instance in a `MiddlewareDefinition`:

```ts
const app = await createApplication(AppModule)

// Pass instances created with 'new'
app.useGlobalGuards(new AuthGuard())
app.useGlobalPipes(new ValidationPipe())
app.useGlobalInterceptors(new LoggingInterceptor())
app.useGlobalFilters(new AllExceptionsFilter())
app.useGlobalMiddlewares({ handler: new LegacyMiddleware(), path: '/*' })
```

**If your enhancer needs DI**, prefer using `APP_*` tokens in module providers instead:

```ts
import { APP_GUARD, APP_INTERCEPTOR } from '@tsuki/framework'

@Module({
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
```

**Testing approaches:**

- Recommended to use `vitest` (already configured in repository).
- **Unit tests**: Leverage `tsyringe` container to inject mocks and directly resolve Service instances.
  ```ts
  const container = app.getContainer()
  const service = container.resolve(UserService)
  ```
- **Integration tests**: Call `createApplication()` to construct complete app, use `app.getInstance().request()` to make requests, testing interceptors, pipes, and filters.
- **Event system**: Can be verified by replacing Redis Client (e.g., in-memory mock).

## Best Practices & Common Pitfalls

- **Avoid type-only imports**: DI resolution requires actual classes. Use `import { Service } from './service'`, not `import type { Service }`.
- **Decorator auto-registration**: Classes in `@UseGuards(Guard)`, `@UsePipes(Pipe)`, etc. are auto-registered as singletons. If they have dependencies, those dependencies must be registered in a module.
- **Global enhancers**: `app.useGlobal*()` accepts instances created with `new` (not from container). If your enhancers need DI, use `APP_*` tokens in module providers instead—this is preferred for cleaner organization and proper dependency injection.
- **Provider ordering**: If relying on lifecycle hooks, ensure the containing module is correctly imported via `imports`.
- **Request body JSON validation**: Framework validates `content-type: application/json` by default; other types require custom pipes.
- **Context access**: `HttpContext` is only valid within requests; manual context injection needed in task queues or event callbacks.
- **OpenAPI DTO naming**: Schemas use class names by default, customizable via `createZodSchemaDto(schema, { name })`.
- **Logging & DEBUG**: Setting `DEBUG=true` enables verbose DI/routing logs; production environments should keep default levels.

## Reference Implementation & Examples

- `packages/core`: Demonstrates framework organization in real services (modules, guards, filters).
- `packages/task-queue`, `packages/websocket`: Illustrate how to write extension modules and cross-package integration.
- `packages/framework/tests`: Covers DI, decorator metadata, route execution, and exception handling scenarios—recommended starting point.

---

For more details, consult `AGENTS.md` in the repository root (detailed development guide for AI agents) or read the `src/` directory source code directly. Feel free to extend modules, enhancers, and tooling based on business needs.
