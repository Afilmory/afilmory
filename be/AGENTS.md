# Hono Framework Developer Guide for AI Agents

This document provides a comprehensive guide to the Hono-based enterprise framework for AI coding assistants. This framework is NestJS-inspired with Hono performance, featuring decorators, dependency injection, and a modular architecture.

## 📋 Table of Contents

- [Framework Overview](#framework-overview)
- [Core Concepts](#core-concepts)
- [Architecture Patterns](#architecture-patterns)
- [Decorators Reference](#decorators-reference)
- [Request Pipeline](#request-pipeline)
- [Dependency Injection](#dependency-injection)
- [Common Implementation Patterns](#common-implementation-patterns)
- [Testing Strategy](#testing-strategy)

## Framework Overview

### What is This Framework?

This is a custom web framework built on top of Hono that provides:

- **Decorator-based routing** (similar to NestJS)
- **Dependency injection** via `tsyringe`
- **Request-scoped context** using `AsyncLocalStorage`
- **Extensible enhancers** (Guards, Pipes, Interceptors, Filters)
- **Type-safe validation** with Zod
- **Lifecycle hooks** for startup/shutdown management

### Key Framework Packages

| Package                | Purpose                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `@tsuki/framework`  | Core framework with decorators, DI, HTTP context, logger, etc. |
| `@afilmory/db`         | Drizzle ORM schema and migrations                              |
| `@afilmory/env`        | Runtime environment validation                                 |
| `@afilmory/redis`      | Redis client factory with strong typing                        |
| `@afilmory/task-queue` | Task queue implementation with in-memory and Redis drivers     |
| `@afilmory/websocket`  | WebSocket gateway with Redis pub/sub                           |

## Core Concepts

### 1. Modules

Modules are the fundamental building blocks that organize your application into cohesive feature sets.

**Module Structure:**

```typescript
import { Module } from '@tsuki/framework'

@Module({
  imports: [OtherModule], // Import other modules
  controllers: [UserController], // HTTP endpoints
  providers: [UserService], // Injectable services
})
export class UserModule {}
```

**Key Points:**

- Modules are **singletons** - only instantiated once
- `imports` - Include other modules to access their exported providers
- `controllers` - Define HTTP route handlers
- `providers` - Services, repositories, utilities available for DI
- Use `forwardRef(() => Module)` for circular dependencies

### 2. Controllers

Controllers handle HTTP requests and define routes using decorators.

**Basic Controller:**

```typescript
import { Controller, Get, Post, Body, Param, Query } from '@tsuki/framework'

@Controller('users') // Base path: /users
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('/')
  async findAll(@Query('limit') limit?: string) {
    return this.userService.findAll(Number(limit) || 10)
  }

  @Get('/:id')
  async findOne(@Param('id') id: string) {
    return this.userService.findById(id)
  }

  @Post('/')
  async create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto)
  }
}
```

**Key Points:**

- Controllers **must** have `@Controller(prefix)` decorator
- The `prefix` is the base path for all routes in the controller
- Route methods use HTTP decorators: `@Get()`, `@Post()`, `@Put()`, `@Patch()`, `@Delete()`
- Constructor injection automatically resolves dependencies

### 3. Providers (Services)

Providers are injectable classes that contain business logic.

```typescript
import { injectable } from 'tsyringe'

@injectable()
export class UserService {
  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly redis: RedisAccessor,
  ) {}

  async findById(id: string) {
    const db = this.dbAccessor.get()
    return db.query.users.findFirst({
      where: eq(schema.users.id, id),
    })
  }

  async create(data: CreateUserInput) {
    const db = this.dbAccessor.get()
    const [user] = await db.insert(schema.users).values(data).returning()
    return user
  }
}
```

**Key Points:**

- Providers **must** have `@injectable()` decorator from `tsyringe`
- Registered in module's `providers` array
- Use constructor injection for dependencies
- Should contain reusable business logic

### 4. Request Context (HttpContext)

The framework provides a request-scoped context using Node's `AsyncLocalStorage`.

**Accessing Context:**

```typescript
import { HttpContext } from '@tsuki/framework'

// In any service, guard, interceptor, or pipe
@injectable()
export class AuditService {
  logRequest() {
    const honoContext = HttpContext.getValue('hono')
    const path = honoContext.req.path
    const method = honoContext.req.method
    console.log(`Request: ${method} ${path}`)
  }
}

// Or get the entire context
const context = HttpContext.get()
const honoContext = context.hono
```

**Setting Custom Values:**

```typescript
// Extend the context type
declare module '@tsuki/framework' {
  interface HttpContextValues {
    userId?: string
    requestId?: string
  }
}

// In a guard or interceptor
HttpContext.setValue('userId', '123')
HttpContext.assign({ userId: '123', requestId: 'abc' })
```

**Key Points:**

- Context is **automatically** managed per request
- Available in guards, pipes, interceptors, filters, and services
- Use `HttpContext.getValue('hono')` to access Hono's `Context`
- Can be extended with custom properties via module augmentation

## Architecture Patterns

### Application Bootstrap

**Standard Bootstrap Pattern:**

```typescript
import 'reflect-metadata'
import { serve } from '@hono/node-server'
import { createApplication } from '@tsuki/framework'

async function bootstrap() {
  // Create the application
  const app = await createApplication(AppModule, {
    globalPrefix: '/api', // Optional: all routes prefixed with /api
  })

  // Register global enhancers
  app.useGlobalPipes(ValidationPipe)
  app.useGlobalGuards(AuthGuard)
  app.useGlobalInterceptors(LoggingInterceptor)
  app.useGlobalFilters(AllExceptionsFilter)

  // Get the underlying Hono instance
  const hono = app.getInstance()

  // Start the server
  serve({
    fetch: hono.fetch,
    port: 3000,
    hostname: '0.0.0.0',
  })
}

bootstrap()
```

**Key Points:**

- `reflect-metadata` **must** be imported at the top
- `createApplication` is async and returns `HonoHttpApplication`
- Global enhancers apply to **all** routes
- Access Hono instance via `app.getInstance()` for middleware

### Module Organization

**Root Module Pattern:**

```typescript
import { Module } from '@tsuki/framework'
import { DatabaseModule } from './database/database.module'
import { RedisModule } from './redis/redis.module'
import { UserModule } from './modules/user/user.module'
import { AuthModule } from './modules/auth/auth.module'

@Module({
  imports: [
    DatabaseModule, // Infrastructure modules first
    RedisModule,
    UserModule, // Feature modules
    AuthModule,
  ],
})
export class AppModule {}
```

**Key Points:**

- Root module typically has no controllers/providers
- Import infrastructure modules (DB, Redis) first
- Feature modules come after infrastructure
- Each feature should be self-contained

### Infrastructure Modules (Database & Redis)

**Database Module Pattern:**

```typescript
import { Module } from '@tsuki/framework'
import { DbAccessor } from './database.provider'

@Module({
  providers: [DbAccessor],
})
export class DatabaseModule {}

// Provider
@injectable()
export class DbAccessor {
  private db: ReturnType<typeof drizzle> | null = null

  constructor() {
    // Initialize connection pool
    const pool = new Pool({ connectionString: env.DATABASE_URL })
    this.db = drizzle(pool, { schema })
  }

  get() {
    if (!this.db) {
      throw new Error('Database not initialized')
    }
    return this.db
  }
}
```

**Redis Module Pattern:**

```typescript
import { Module } from '@tsuki/framework'
import { RedisAccessor } from './redis.provider'

@Module({
  providers: [RedisAccessor],
})
export class RedisModule {}

// Provider
@injectable()
export class RedisAccessor {
  private client: Redis

  constructor() {
    this.client = new Redis(env.REDIS_URL)
  }

  get(): Redis {
    return this.client
  }
}
```

**Key Points:**

- Infrastructure providers use **accessor pattern** with `.get()` method
- There aren't `exports` in module, this is different from NestJS
- Initialize connections in constructor
- Implement lifecycle hooks (`OnModuleDestroy`) for cleanup

## Decorators Reference

### Module Decorators

```typescript
// Define a module
@Module({
  imports: [FeatureModule], // Other modules to import
  controllers: [MyController], // HTTP endpoints
  providers: [MyService], // Injectable services
})
export class MyModule {}

// Forward reference for circular dependencies
@Module({
  imports: [forwardRef(() => CircularModule)],
})
export class MyModule {}
```

### Controller & Route Decorators

```typescript
// Controller base path
@Controller('api/v1/users')
export class UserController {}

// HTTP method decorators
@Get('/path')      // GET request
@Post('/path')     // POST request
@Put('/path')      // PUT request
@Patch('/path')    // PATCH request
@Delete('/path')   // DELETE request
@Options('/path')  // OPTIONS request
@Head('/path')     // HEAD request
```

### Parameter Decorators

```typescript
class MyController {
  @Get('/:id')
  async handler(
    @Param('id') id: string, // Route parameter
    @Query('search') search?: string, // Query string parameter
    @Body() body: CreateDto, // Request body (auto-parsed JSON)
    @Headers('authorization') auth?: string, // Specific header
    @Headers() allHeaders: Headers, // All headers
    @Req() request: HonoRequest, // Hono request object
    @ContextParam() context: Context, // Hono context
    context: Context, // Inferred context (if no decorator)
  ) {
    // Handler logic
  }
}
```

**Parameter with Pipes:**

```typescript
// Apply pipe to specific parameter
@Get('/:id')
async findOne(@Param('id', ParseIntPipe) id: number) {
  // id is now a number (transformed by pipe)
}

// Multiple pipes
@Post('/')
async create(@Body(ValidationPipe, TransformPipe) data: CreateDto) {
  // data is validated then transformed
}
```

### Enhancer Decorators

```typescript
// Guards - Authorization/Authentication
@UseGuards(AuthGuard, RolesGuard)
@Get('/protected')
async protectedRoute() {}

// Pipes - Validation/Transformation
@UsePipes(ValidationPipe, TransformPipe)
@Post('/data')
async create() {}

// Interceptors - Modify request/response
@UseInterceptors(LoggingInterceptor, CacheInterceptor)
@Get('/data')
async getData() {}

// Exception Filters - Error handling
@UseFilters(HttpExceptionFilter, ValidationExceptionFilter)
@Post('/risky')
async riskyOperation() {}
```

**Scope:**

- **Method level**: Apply to specific route handler
- **Controller level**: Apply to all routes in controller
- **Global level**: Apply to all routes in application (via `app.useGlobal*()`)

### Validation Decorators (Zod)

```typescript
import { z } from 'zod'
import { createZodSchemaDto } from '@tsuki/framework'

// Define schema
const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  age: z.number().int().positive().optional(),
})

// Create DTO class
class CreateUserDto extends createZodSchemaDto(CreateUserSchema) {}

// Use in controller
@Controller('users')
export class UserController {
  @Post('/')
  async create(@Body() data: CreateUserDto) {
    // data is validated and typed
  }
}
```

## Request Pipeline

### Execution Order

When a request hits an endpoint, the framework processes it through these phases:

```
Request
  ↓
1. HttpContext.run() - Establish request scope
  ↓
2. Guards - Check permissions (global → controller → method)
  ↓
3. Interceptors (before) - Pre-processing (global → controller → method)
  ↓
4. Pipes - Parameter validation/transformation
  ↓
5. Controller Handler - Your business logic
  ↓
6. Interceptors (after) - Post-processing (reverse order)
  ↓
7. Exception Filters - Error handling (if error thrown)
  ↓
Response
```

### 1. Guards

Guards determine whether a request should be handled by the route.

**Guard Implementation:**

```typescript
import { injectable } from 'tsyringe'
import { CanActivate, ExecutionContext, UnauthorizedException, HttpContext } from '@tsuki/framework'

@injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const httpContext = context.switchToHttp().getContext()
    const honoContext = httpContext.hono

    const token = honoContext.req.header('authorization')

    if (!token) {
      throw new UnauthorizedException('Missing authorization token')
    }

    // Validate token
    const user = await this.validateToken(token)

    if (!user) {
      return false // Returns 403 Forbidden
    }

    // Store user in context for later use
    HttpContext.assign({ user })

    return true
  }

  private async validateToken(token: string) {
    // Token validation logic
  }
}
```

**Usage:**

```typescript
@Controller('admin')
@UseGuards(AuthGuard, AdminGuard) // All routes protected
export class AdminController {
  @Get('/dashboard')
  async getDashboard() {
    // Only reached if guards pass
  }

  @Get('/public')
  async getPublic() {
    // Still protected by controller-level guards
  }
}
```

**Key Points:**

- Return `false` → 403 Forbidden (automatic)
- Throw exception → Custom error response
- Guards run in order: global → controller → method
- Use for authentication, authorization, rate limiting

### 2. Pipes

Pipes transform and validate input data.

**Pipe Implementation:**

```typescript
import { injectable } from 'tsyringe'
import { PipeTransform, ArgumentMetadata, BadRequestException } from '@tsuki/framework'

@injectable()
export class ParseIntPipe implements PipeTransform<string, number> {
  transform(value: string, metadata: ArgumentMetadata): number {
    const parsed = Number.parseInt(value, 10)

    if (Number.isNaN(parsed)) {
      throw new BadRequestException(`Validation failed: "${value}" is not an integer`)
    }

    return parsed
  }
}
```

**Built-in Validation Pipe:**

```typescript
import { createZodValidationPipe } from '@tsuki/framework'

// Create configured validation pipe
const ValidationPipe = createZodValidationPipe({
  transform: true, // Transform to DTO class instances
  whitelist: true, // Strip unknown properties
  errorHttpStatusCode: 422, // Status code for validation errors
  forbidUnknownValues: true, // Reject non-objects for body
  stopAtFirstError: false, // Return all validation errors
})

// already registered globally
app.useGlobalPipes(ValidationPipe)
```

**Key Points:**

- Pipes run **after** guards, **before** handler
- Order: global → method → parameter
- Use for validation, transformation, sanitization
- Parameter pipes run **last** (most specific)

### 3. Interceptors

Interceptors wrap the request/response flow and can modify both.

**Interceptor Implementation:**

```typescript
import { injectable } from 'tsyringe'
import { Interceptor, ExecutionContext, CallHandler, FrameworkResponse } from '@tsuki/framework'

@injectable()
export class LoggingInterceptor implements Interceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<FrameworkResponse> {
    const httpContext = context.switchToHttp().getContext()
    const { req } = httpContext.hono

    const start = Date.now()
    console.log(`→ ${req.method} ${req.path}`)

    // Call the handler and subsequent interceptors
    const response = await next.handle()

    const duration = Date.now() - start
    console.log(`← ${req.method} ${req.path} ${duration}ms`)

    return response
  }
}
```

**Response Transform Interceptor:**

```typescript
@injectable()
export class TransformInterceptor implements Interceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<FrameworkResponse> {
    const response = await next.handle()

    // Transform response body
    const data = await response.clone().json()

    return new Response(
      JSON.stringify({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      }),
      {
        status: response.status,
        headers: response.headers,
      },
    )
  }
}
```

**Key Points:**

- Wrap handler execution with `next.handle()`
- Can modify request before handler
- Can modify response after handler
- Run in order: global → controller → method (then reverse)
- Use for logging, caching, response transformation

### 4. Exception Filters

Filters catch and handle exceptions thrown during request processing.

**Filter Implementation:**

```typescript
import { injectable } from 'tsyringe'
import { ExceptionFilter, ArgumentsHost, HttpException } from '@tsuki/framework'

@injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  async catch(exception: Error, host: ArgumentsHost) {
    const httpContext = host.switchToHttp().getContext()
    const { hono } = httpContext

    let status = 500
    let message = 'Internal server error'
    let details: any = {}

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const response = exception.getResponse()

      if (typeof response === 'object') {
        details = response
      } else {
        message = String(response)
      }
    } else {
      message = exception.message
      details.stack = exception.stack
    }

    return new Response(
      JSON.stringify({
        statusCode: status,
        message,
        ...details,
        path: hono.req.path,
        timestamp: new Date().toISOString(),
      }),
      {
        status,
        headers: { 'content-type': 'application/json' },
      },
    )
  }
}
```

**Key Points:**

- Filters run when exception is thrown
- Can return custom Response or undefined
- If filter returns undefined, next filter runs
- Use for error logging, error formatting, monitoring

## Dependency Injection

### Basic DI Usage

**Service Registration:**

```typescript
// In module
@Module({
  providers: [
    UserService, // Singleton by default
    EmailService,
  ],
})
export class UserModule {}
```

**Constructor Injection:**

```typescript
@injectable()
export class UserService {
  constructor(
    private readonly db: DbAccessor,
    private readonly cache: RedisAccessor,
    private readonly logger: Logger,
  ) {}
}
```

### Accessing the Container

```typescript
// In application bootstrap
const app = await createApplication(AppModule)
const container = app.getContainer()

// Manually resolve a provider
const userService = container.resolve(UserService)
```

### Important DI Patterns

**❌ Wrong - Import Type:**

```typescript
// This will cause DI errors!
import type { UserService } from './user.service'

@injectable()
export class OrderService {
  constructor(private readonly userService: UserService) {}
  //                                       ^^^ Type-only import won't work
}
```

**✅ Correct - Import Value:**

```typescript
// Import the actual class
import { UserService } from './user.service'

@injectable()
export class OrderService {
  constructor(private readonly userService: UserService) {}
}
```

## Common Implementation Patterns

### 1. CRUD Controller Pattern

```typescript
import { z } from 'zod'
import { createZodSchemaDto } from '@tsuki/framework'

// DTOs for request validation
const PaginationQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).default('1'),
  limit: z.string().regex(/^\d+$/).transform(Number).default('10'),
})

const UserIdParamSchema = z.object({
  id: z.string().uuid(),
})

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  age: z.number().int().positive().optional(),
})

const UpdateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).max(100).optional(),
  age: z.number().int().positive().optional(),
})

class PaginationQueryDto extends createZodSchemaDto(PaginationQuerySchema) {}
class UserIdParamDto extends createZodSchemaDto(UserIdParamSchema) {}
class CreateUserDto extends createZodSchemaDto(CreateUserSchema) {}
class UpdateUserDto extends createZodSchemaDto(UpdateUserSchema) {}

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('/')
  async findAll(@Query() query: PaginationQueryDto) {
    return this.userService.findAll({
      page: query.page,
      limit: query.limit,
    })
  }

  @Get('/:id')
  async findOne(@Param() params: UserIdParamDto) {
    const user = await this.userService.findById(params.id)
    if (!user) {
      throw new NotFoundException(`User ${params.id} not found`)
    }
    return user
  }

  @Post('/')
  async create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto)
  }

  @Patch('/:id')
  async update(@Param() params: UserIdParamDto, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.update(params.id, updateUserDto)
  }

  @Delete('/:id')
  async remove(@Param() params: UserIdParamDto) {
    await this.userService.remove(params.id)
    return { deleted: true }
  }
}
```

**Key Points:**

- **Query Parameters**: Use `@Query()` without parameter name to get all query params, then validate with DTO
- **Route Parameters**: Use `@Param()` without parameter name to get all params, then validate with DTO
- **Schema Transformation**: Use `.transform()` to convert string query params to numbers
- **Default Values**: Use `.default()` for optional query parameters
- **Validation**: All parameters are validated through Zod schemas before reaching the handler

### 2. Service with Database Pattern

```typescript
@injectable()
export class UserService {
  constructor(private readonly db: DbAccessor) {}

  async findAll(options: { page: number; limit: number }) {
    const db = this.db.get()
    const offset = (options.page - 1) * options.limit

    const users = await db.query.users.findMany({
      limit: options.limit,
      offset,
    })

    return {
      data: users,
      page: options.page,
      limit: options.limit,
    }
  }

  async findById(id: string) {
    const db = this.db.get()
    return db.query.users.findFirst({
      where: eq(schema.users.id, id),
    })
  }

  async create(data: CreateUserInput) {
    const db = this.db.get()
    const [user] = await db.insert(schema.users).values(data).returning()
    return user
  }

  async update(id: string, data: UpdateUserInput) {
    const db = this.db.get()
    const [updated] = await db.update(schema.users).set(data).where(eq(schema.users.id, id)).returning()
    return updated
  }

  async remove(id: string) {
    const db = this.db.get()
    await db.delete(schema.users).where(eq(schema.users.id, id))
  }
}
```

### 3. Lifecycle Hooks Pattern

```typescript
@injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool | null = null

  async onModuleInit() {
    console.log('Initializing database connection...')
    this.pool = new Pool({ connectionString: env.DATABASE_URL })
    await this.pool.query('SELECT 1') // Test connection
    console.log('Database connected')
  }

  async onModuleDestroy() {
    console.log('Closing database connection...')
    await this.pool?.end()
    console.log('Database disconnected')
  }

  getPool(): Pool {
    if (!this.pool) {
      throw new Error('Database not initialized')
    }
    return this.pool
  }
}
```

**Available Lifecycle Hooks:**

```typescript
interface OnModuleInit {
  onModuleInit(): Promise<void> | void
  // Called after module and its imports are registered
}

interface OnApplicationBootstrap {
  onApplicationBootstrap(): Promise<void> | void
  // Called after all modules are initialized
}

interface BeforeApplicationShutdown {
  beforeApplicationShutdown(signal?: string): Promise<void> | void
  // Called before shutdown begins
}

interface OnModuleDestroy {
  onModuleDestroy(): Promise<void> | void
  // Called during teardown
}

interface OnApplicationShutdown {
  onApplicationShutdown(signal?: string): Promise<void> | void
  // Called as final shutdown step
}
```

**Graceful Shutdown:**

```typescript
const app = await createApplication(AppModule)
const hono = app.getInstance()

const server = serve({ fetch: hono.fetch, port: 3000 })

// Handle shutdown signals
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...')
  await app.close('SIGTERM')
  server.close()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...')
  await app.close('SIGINT')
  server.close()
  process.exit(0)
})
```

### 4. Caching Pattern with Redis

```typescript
@injectable()
export class CacheService {
  constructor(private readonly redis: RedisAccessor) {}

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get().get(key)
    return value ? JSON.parse(value) : null
  }

  async set(key: string, value: any, ttlSeconds: number): Promise<void> {
    await this.redis.get().set(key, JSON.stringify(value), 'EX', ttlSeconds)
  }

  async del(key: string): Promise<void> {
    await this.redis.get().del(key)
  }
}
```

### 5. Error Handling Pattern

```typescript
// Business exception
export class BizException extends HttpException {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: any,
  ) {
    super(
      { statusCode: 400, code, message, data },
      400,
      message,
    )
  }
}

// Specific business errors
export const ErrorCodes = {
  USER_NOT_FOUND: 1001,
  INVALID_CREDENTIALS: 1002,
  EMAIL_ALREADY_EXISTS: 1003,
} as const

// Usage in service
@injectable()
export class UserService {
  async findById(id: string) {
    const user = await this.db.query.users.findFirst(...)
    if (!user) {
      throw new BizException(
        ErrorCodes.USER_NOT_FOUND,
        `User ${id} not found`,
      )
    }
    return user
  }
}

// Exception filter
@injectable()
export class BizExceptionFilter implements ExceptionFilter<BizException> {
  async catch(exception: BizException, host: ArgumentsHost) {
    const httpContext = host.switchToHttp().getContext()

    return new Response(
      JSON.stringify({
        success: false,
        code: exception.code,
        message: exception.message,
        data: exception.data,
        timestamp: new Date().toISOString(),
      }),
      {
        status: exception.getStatus(),
        headers: { 'content-type': 'application/json' },
      }
    )
  }
}
```

### 6. WebSocket Pattern

The `@afilmory/websocket` package provides a Redis-backed WebSocket gateway with channel subscriptions, pub/sub fan-out, and automatic heartbeat management.

**WebSocket Module Setup:**

```typescript
import { Module } from '@tsuki/framework'
import { RedisModule } from '../redis/redis.module'
import { WebSocketGatewayProvider } from './websocket.provider'
import { WebSocketService } from './websocket.service'

@Module({
  imports: [RedisModule],
  providers: [WebSocketGatewayProvider, WebSocketService],
})
export class WebSocketModule {}
```

**WebSocket Gateway Provider:**

```typescript
import { injectable } from 'tsyringe'
import { OnModuleInit, OnModuleDestroy, createLogger } from '@tsuki/framework'
import { RedisPubSubBroker, RedisWebSocketGateway } from '@afilmory/websocket'
import { RedisAccessor } from '../redis/redis.provider'

@injectable()
export class WebSocketGatewayProvider implements OnModuleInit, OnModuleDestroy {
  private gateway?: RedisWebSocketGateway
  private broker?: RedisPubSubBroker
  private subscriber?: Redis

  constructor(private readonly redis: RedisAccessor) {}

  async onModuleInit(): Promise<void> {
    const publisher = this.redis.get()
    const subscriber = publisher.duplicate()

    this.subscriber = subscriber
    this.broker = new RedisPubSubBroker({ publisher, subscriber })
  }

  async attachToHttpServer(server: Server): Promise<void> {
    if (!this.broker) {
      throw new Error('Broker not initialized')
    }

    this.gateway = new RedisWebSocketGateway({
      broker: this.broker,
      server,
      path: '/ws',
      heartbeatIntervalMs: 30000,
      allowClientPublish: false, // Disable client-initiated publish
      handshakeValidator: async (request) => {
        // Validate auth token from query params or headers
        const token = new URL(request.url!, 'http://localhost').searchParams.get('token')
        if (!token) {
          throw new Error('Missing authentication token')
        }
        // Validate token here
      },
      identifyClient: async (request) => {
        // Return unique client identifier
        return extractUserIdFromRequest(request)
      },
    })

    await this.gateway.start()
  }

  async onModuleDestroy(): Promise<void> {
    await this.gateway?.stop()
    await this.subscriber?.quit()
  }

  getGateway(): RedisWebSocketGateway {
    if (!this.gateway) {
      throw new Error('Gateway not initialized')
    }
    return this.gateway
  }
}
```

**WebSocket Service:**

```typescript
@injectable()
export class WebSocketService {
  constructor(private readonly gatewayProvider: WebSocketGatewayProvider) {}

  async publishToChannel<T>(channel: string, payload: T): Promise<void> {
    const gateway = this.gatewayProvider.getGateway()
    await gateway.publish({ channel, payload })
  }

  async notifyUser(userId: string, notification: Notification): Promise<void> {
    await this.publishToChannel(`user:${userId}`, {
      type: 'notification',
      data: notification,
    })
  }

  async broadcastToAll(message: string): Promise<void> {
    await this.publishToChannel('broadcast', {
      type: 'announcement',
      message,
    })
  }
}
```

**Bootstrap with WebSocket:**

```typescript
import { serve } from '@hono/node-server'
import { createApplication } from '@tsuki/framework'

async function bootstrap() {
  const app = await createApplication(AppModule)
  const hono = app.getInstance()

  const server = serve({ fetch: hono.fetch, port: 3000 })

  // Attach WebSocket gateway to HTTP server
  const container = app.getContainer()
  const wsProvider = container.resolve(WebSocketGatewayProvider)
  await wsProvider.attachToHttpServer(server)
}

bootstrap()
```

**Client-Side Usage:**

```typescript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:3000/ws?token=YOUR_TOKEN')

ws.onopen = () => {
  // Subscribe to channels
  ws.send(
    JSON.stringify({
      type: 'subscribe',
      channels: ['user:123', 'broadcast'],
    }),
  )
}

ws.onmessage = (event) => {
  const message = JSON.parse(event.data)

  switch (message.type) {
    case 'ack':
      console.log('Subscribed to:', message.channels)
      break
    case 'message':
      console.log('Received:', message.channel, message.payload)
      break
    case 'error':
      console.error('Error:', message.code, message.message)
      break
  }
}

// Unsubscribe from channels
ws.send(
  JSON.stringify({
    type: 'unsubscribe',
    channels: ['broadcast'],
  }),
)

// Ping-pong for keepalive
ws.send(JSON.stringify({ type: 'ping' }))
```

**Key Points:**

- **Redis Pub/Sub**: Uses Redis for message distribution across multiple server instances
- **Channel Subscriptions**: Clients subscribe to channels and receive real-time updates
- **Automatic Heartbeat**: Built-in ping/pong mechanism for connection health
- **Handshake Validation**: Validate authentication before accepting connections
- **Client Identification**: Custom logic to identify connected clients
- **Server-Side Publish**: Services can publish messages through the gateway

### 7. Task Queue Pattern

The `@afilmory/task-queue` package provides a robust task queue system with support for retries, priority, delayed execution, and middleware.

**Task Queue Module Setup:**

```typescript
import { Module } from '@tsuki/framework'
import { TaskQueueModule } from '@afilmory/task-queue'
import { TaskQueueManager } from './task-queue.manager'
import { TaskQueueService } from './task-queue.service'
import { TaskQueueController } from './task-queue.controller'

@Module({
  imports: [TaskQueueModule],
  controllers: [TaskQueueController],
  providers: [TaskQueueManager, TaskQueueService],
})
export class QueueModule {}
```

**Task Queue Worker with Decorators:**

```typescript
import { injectable } from 'tsyringe'
import { OnModuleDestroy, OnModuleInit, createLogger } from '@tsuki/framework'
import { RedisQueueDriver, TaskContext, TaskProcessor, TaskQueue, TaskQueueManager } from '@afilmory/task-queue'
import { RedisAccessor } from '../redis/redis.provider'

@injectable()
export class TaskQueueWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = createLogger('Tasks:worker')
  public queue!: TaskQueue

  constructor(
    private readonly manager: TaskQueueManager,
    private readonly redis: RedisAccessor,
  ) {}

  async onModuleInit(): Promise<void> {
    const driver = new RedisQueueDriver({
      redis: this.redis.get(),
      queueName: 'core:jobs',
      visibilityTimeoutMs: 45_000,
    })

    this.queue = this.manager.createQueue('core-jobs', {
      driver,
      start: false,
      logger: this.logger,
      middlewares: [
        async (context, next) => {
          this.logger.debug('Task started', { taskId: context.taskId, name: context.name })
          const start = Date.now()
          try {
            await next()
          } finally {
            this.logger.debug('Task finished', {
              taskId: context.taskId,
              name: context.name,
              duration: Date.now() - start,
            })
          }
        },
      ],
    })

    await this.queue.start({ pollIntervalMs: 200 })
  }

  @TaskProcessor('send-email', {
    options: {
      maxAttempts: 3,
      backoffStrategy: (attempt) => Math.min(60_000, 2 ** attempt * 1_000),
      retryableFilter: (error) => error instanceof NetworkError,
    },
  })
  async sendEmail(payload: EmailPayload, context: TaskContext<EmailPayload>): Promise<void> {
    context.logger.info('Sending email', { to: payload.to })
    await sendEmail(payload)
  }

  @TaskProcessor('process-image', {
    options: (instance) => ({
      maxAttempts: 5,
      backoffStrategy: (attempt) => attempt * 5_000,
    }),
  })
  async processImage(payload: ImagePayload, context: TaskContext<ImagePayload>): Promise<ImageResult> {
    context.logger.info('Processing image', { imageId: payload.imageId })
    return await processImage(payload)
  }

  @TaskProcessor({ name: 'deliver-webhook', queueProperty: 'queue' })
  async deliverWebhook(payload: WebhookPayload, context: TaskContext<WebhookPayload>): Promise<void> {
    try {
      await fetch(payload.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload.data),
      })
    } catch (error: any) {
      if (error?.status === 429) {
        context.setRetry({ retry: true, delayMs: 60_000 })
      }
      throw error
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.shutdown()
  }
}
```

Handlers are bound automatically after `onModuleInit` finishes, so as long as the queue property is set before the method resolves, the decorator wires everything up. Options may be an object or a factory that receives the instance (helpful for per-environment tuning).

**Task Queue Service:**

```typescript
@injectable()
export class TaskQueueService {
  constructor(private readonly worker: TaskQueueWorker) {}

  async enqueueEmail(email: EmailPayload): Promise<string> {
    const task = await this.worker.queue.enqueue({
      name: 'send-email',
      payload: email,
      priority: 5,
    })

    return task.id
  }

  async enqueueDelayedTask(payload: unknown, delayMs: number): Promise<string> {
    const task = await this.worker.queue.enqueue({
      name: 'deliver-webhook',
      payload,
      runAt: Date.now() + delayMs,
      priority: 0,
    })

    return task.id
  }

  async enqueueBatch(emails: EmailPayload[]): Promise<string[]> {
    return await Promise.all(emails.map((email) => this.enqueueEmail(email)))
  }

  async getQueueStats() {
    return await this.worker.queue.getStats()
  }
}
```

**Task Queue Controller:**

```typescript
@Controller('queue')
export class TaskQueueController {
  constructor(private readonly queueService: TaskQueueService) {}

  @Post('/tasks/email')
  async enqueueEmail(@Body() dto: EmailDto) {
    const taskId = await this.queueService.enqueueEmail({
      to: dto.to,
      subject: dto.subject,
      body: dto.body,
    })

    return {
      taskId,
      status: 'queued',
      message: 'Email task enqueued successfully',
    }
  }

  @Post('/tasks/delayed')
  async enqueueDelayed(@Body() dto: { payload: unknown; delaySeconds: number }) {
    const taskId = await this.queueService.enqueueDelayedTask(dto.payload, dto.delaySeconds * 1000)

    return {
      taskId,
      status: 'scheduled',
      scheduledFor: new Date(Date.now() + dto.delaySeconds * 1000),
    }
  }

  @Get('/stats')
  async getStats() {
    return await this.queueService.getQueueStats()
  }
}
```

**Advanced Task Handler with Custom Retry:**

```typescript
@TaskProcessor('complex-task', {
  options: {
    maxAttempts: 5,
    backoffStrategy: (attempt) => {
      const base = 2 ** attempt * 1_000
      const jitter = Math.random() * 1_000
      return Math.min(300_000, base + jitter)
    },
  },
})
async complexTaskHandler(payload: ComplexPayload, context: TaskContext<ComplexPayload>): Promise<void> {
  try {
    await performComplexOperation(payload)
  } catch (error) {
    if (error instanceof TemporaryError) {
      context.setRetry({ retry: true, delayMs: 30_000 })
      throw error
    }

    if (error instanceof PermanentError) {
      throw new TaskDropError('Permanent failure, cannot retry')
    }

    throw error
  }
}
```

**Task Middleware:**

```typescript
// Logging middleware
const loggingMiddleware: TaskMiddleware = async (context, next) => {
  console.log(`[${context.name}] Starting task ${context.taskId}`)
  const start = Date.now()

  try {
    await next()
    console.log(`[${context.name}] Completed in ${Date.now() - start}ms`)
  } catch (error) {
    console.error(`[${context.name}] Failed:`, error)
    throw error
  }
}

// Metrics middleware
const metricsMiddleware: TaskMiddleware = async (context, next) => {
  const labels = { taskName: context.name }
  tasksTotal.inc(labels)

  const timer = tasksLatency.startTimer(labels)
  try {
    await next()
    tasksSuccess.inc(labels)
  } catch (error) {
    tasksFailure.inc(labels)
    throw error
  } finally {
    timer()
  }
}

// Apply middlewares
const queue = new TaskQueue({
  name: 'main',
  middlewares: [loggingMiddleware, metricsMiddleware],
})
```

**Key Points:**

- **Task Processors**: Annotate methods with `@TaskProcessor()`; registration runs automatically after `onModuleInit`
- **Priority Queue**: Tasks with higher priority are processed first
- **Delayed Execution**: Schedule tasks to run at a specific time
- **Retry Strategies**: Exponential backoff, linear backoff, custom logic via handler options or `context.setRetry`
- **Middleware**: Add cross-cutting concerns like logging, metrics, tracing
- **Driver Support**: In-memory driver for development, Redis driver for production
- **Visibility Timeout**: Prevents tasks from being processed by multiple workers
- **Graceful Shutdown**: Stop processing and wait for in-flight tasks to complete

### 8. OpenAPI & Scalar Docs

Generate synchronized documentation from the existing decorator metadata and surface it through a hosted Scalar UI.

- **Two-dimensional tagging**: Operations carry module-path and controller tags (e.g. `Root / User`, `User`) so clients can cluster endpoints by feature.
- **Schema reuse**: DTO Zod definitions become reusable components referenced by parameters and request bodies.
- **Interactive docs**: The Scalar embed mirrors their recommended CDN usage, so no bundler work is required.
- **Customization**: Use `@ApiTags('Admin')` on controllers or handlers to add business-facing groupings, and `@ApiDoc({ summary, deprecated, tags })` to tweak individual operations inline.

## Testing Strategy

### Framework Testing

The framework itself has 100% test coverage. When implementing features:

**1. Unit Tests for Services:**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { container } from 'tsyringe'

describe('UserService', () => {
  let service: UserService
  let mockDb: DbAccessor

  beforeEach(() => {
    // Setup mocks
    mockDb = {
      get: () => mockDbInstance,
    } as any

    container.register(DbAccessor, { useValue: mockDb })
    service = container.resolve(UserService)
  })

  it('should find user by id', async () => {
    const user = await service.findById('123')
    expect(user).toBeDefined()
  })
})
```

**2. Integration Tests for Controllers:**

```typescript
import { describe, it, expect } from 'vitest'
import { createApplication } from '@tsuki/framework'

describe('UserController', () => {
  let app: HonoHttpApplication

  beforeEach(async () => {
    app = await createApplication(UserModule)
  })

  it('should return user list', async () => {
    const hono = app.getInstance()
    const res = await hono.request('/users')

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
  })

  afterEach(async () => {
    await app.close()
  })
})
```

**3. E2E Tests:**

```typescript
describe('Authentication Flow', () => {
  it('should login and access protected route', async () => {
    // Login
    const loginRes = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'pass' }),
    })
    const { access_token } = await loginRes.json()

    // Access protected route
    const profileRes = await fetch('http://localhost:3000/api/auth/profile', {
      headers: { authorization: `Bearer ${access_token}` },
    })
    expect(profileRes.status).toBe(200)
  })
})
```

## Best Practices for AI Agents

### When Creating New Features

1. **Start with the Module:**
   - Create module file with `@Module()` decorator
   - Define imports, controllers, providers

2. **Create DTOs with Zod:**
   - Define schemas with `z.object()`
   - Create DTO classes with `extend createZodSchemaDto()`

3. **Implement Service:**
   - Add `@injectable()` decorator
   - Use constructor injection for dependencies
   - Implement business logic methods

4. **Implement Controller:**
   - Add `@Controller(prefix)` decorator
   - Use HTTP method decorators
   - Use parameter decorators for input
   - Inject service via constructor

5. **Add Enhancers if Needed:**
   - Guards for authorization
   - Pipes for custom validation
   - Interceptors for cross-cutting concerns
   - Filters for error handling

6. **Register in Root Module:**
   - Add to `imports` array in root module

### Common Pitfalls to Avoid

❌ **Don't:**

- Import types instead of classes for DI
- Forget `@injectable()` decorator on services
- Forget `@Controller()` decorator on controllers
- Use relative imports for cross-module dependencies
- Mutate request/response objects directly

✅ **Do:**

- Import actual classes for DI
- Use decorators consistently
- Use `HttpContext` for request-scoped data
- Follow module boundaries
- Return plain objects (framework handles Response creation)
- Use lifecycle hooks for initialization/cleanup

### Code Organization

```
src/
├── modules/
│   ├── user/
│   │   ├── user.module.ts
│   │   ├── user.controller.ts
│   │   ├── user.service.ts
│   │   ├── dto/
│   │   │   ├── create-user.dto.ts
│   │   │   └── update-user.dto.ts
│   │   └── entities/
│   │       └── user.entity.ts
│   └── auth/
│       ├── auth.module.ts
│       ├── auth.controller.ts
│       ├── auth.service.ts
│       └── guards/
│           └── auth.guard.ts
├── guards/           # Shared guards
├── interceptors/     # Shared interceptors
├── pipes/            # Shared pipes
├── filters/          # Shared filters
├── database/         # Database module
│   ├── database.module.ts
│   └── database.provider.ts
├── redis/            # Redis module
│   ├── redis.module.ts
│   └── redis.provider.ts
├── app.module.ts     # Root module
└── index.ts          # Bootstrap
```

---

## Quick Reference

### Essential Imports

```typescript
// Framework core
import {
  Module,
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  Headers,
  Req,
  ContextParam,
  UseGuards,
  UsePipes,
  UseInterceptors,
  UseFilters,
  HttpContext,
  HttpException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  createApplication,
  createZodValidationPipe,
  createZodSchemaDto,
} from '@tsuki/framework'

// DI
import { injectable } from 'tsyringe'

// Validation
import { z } from 'zod'

// Hono types
import type { Context } from 'hono'
```

### Minimal Working Example

```typescript
// app.module.ts
import { Module } from '@tsuki/framework'
import { AppController } from './app.controller'
import { AppService } from './app.service'

@Module({
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

// app.service.ts
import { injectable } from 'tsyringe'

@injectable()
export class AppService {
  getMessage() {
    return { message: 'Hello World!' }
  }
}

// app.controller.ts
import { Controller, Get } from '@tsuki/framework'
import { AppService } from './app.service'

@Controller('app')
export class AppController {
  constructor(private readonly service: AppService) {}

  @Get('/')
  async getMessage() {
    return this.service.getMessage()
  }
}

// index.ts
import 'reflect-metadata'
import { serve } from '@hono/node-server'
import { createApplication } from '@tsuki/framework'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await createApplication(AppModule)
  const hono = app.getInstance()
  serve({ fetch: hono.fetch, port: 3000 })
}

bootstrap()
```

---

This framework provides a robust foundation for building enterprise-grade HTTP services with TypeScript. Follow the patterns outlined here, and you'll create maintainable, testable, and scalable applications.
