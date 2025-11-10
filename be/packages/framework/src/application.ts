import 'reflect-metadata'

import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import colors from 'picocolors'
import type { ClassProvider, DependencyContainer, InjectionToken, TokenProvider, ValueProvider } from 'tsyringe'
import { container as rootContainer } from 'tsyringe'

import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_MIDDLEWARE, APP_PIPE, isDebugEnabled } from './constants'
import {
  HTTP_CONTEXT_INITIALIZATION_MIDDLEWARE,
  HTTP_CONTEXT_MIDDLEWARE_PRIORITY,
  HttpContext,
} from './context/http-context'
import { getControllerMetadata } from './decorators/controller'
import { getRoutesMetadata } from './decorators/http-methods'
import { getMiddlewareMetadata } from './decorators/middleware'
import { getModuleMetadata, resolveModuleImports } from './decorators/module'
import { getRouteArgsMetadata } from './decorators/params'
import { BadRequestException, ForbiddenException, HttpException } from './http-exception'
import type {
  ArgumentMetadata,
  BeforeApplicationShutdown,
  CallHandler,
  CanActivate,
  Constructor,
  ExceptionFilter,
  ExistingProvider,
  FrameworkResponse,
  GlobalEnhancerRegistry,
  HttpMiddleware,
  Interceptor,
  MiddlewareDefinition,
  MiddlewareMetadata,
  MiddlewarePath,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleDestroy,
  OnModuleInit,
  PipeTransform,
  RouteParamMetadataItem,
} from './interfaces'
import { RouteParamtypes } from './interfaces'
import type { PrettyLogger } from './logger'
import { createLogger } from './logger'
import { ContainerRef } from './utils/container-ref'
import { createExecutionContext } from './utils/execution-context'
import { collectFilters, collectGuards, collectInterceptors, collectPipes } from './utils/metadata'

type ProviderConfig =
  | Constructor
  | ClassProvider<any>
  | ValueProvider<any>
  | TokenProvider<any>
  | ExistingProvider<any>
  | {
      provide: InjectionToken
      useFactory: (...args: any[]) => unknown
      inject?: InjectionToken[]
      singleton?: boolean
    }

const GENERATED_RESPONSE = Symbol.for('hono.framework.generatedResponse')

export interface ApplicationOptions {
  container?: DependencyContainer
  globalPrefix?: string
  logger?: PrettyLogger
}

function createDefaultRegistry(): GlobalEnhancerRegistry {
  return {
    guards: [],
    pipes: [],
    interceptors: [],
    filters: [],
    middlewares: [],
  }
}

type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD'

function isOnModuleInitHook(value: unknown): value is OnModuleInit {
  return typeof value === 'object' && value !== null && typeof (value as OnModuleInit).onModuleInit === 'function'
}

function isOnModuleDestroyHook(value: unknown): value is OnModuleDestroy {
  return typeof value === 'object' && value !== null && typeof (value as OnModuleDestroy).onModuleDestroy === 'function'
}

function isOnApplicationBootstrapHook(value: unknown): value is OnApplicationBootstrap {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as OnApplicationBootstrap).onApplicationBootstrap === 'function'
  )
}

function isBeforeApplicationShutdownHook(value: unknown): value is BeforeApplicationShutdown {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as BeforeApplicationShutdown).beforeApplicationShutdown === 'function'
  )
}

function isOnApplicationShutdownHook(value: unknown): value is OnApplicationShutdown {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as OnApplicationShutdown).onApplicationShutdown === 'function'
  )
}

export class HonoHttpApplication {
  private readonly app = new Hono()
  private readonly container: DependencyContainer
  private readonly globalEnhancers: GlobalEnhancerRegistry = createDefaultRegistry()
  private readonly registeredModules = new Set<Constructor>()
  private readonly logger: PrettyLogger
  private readonly diLogger: PrettyLogger
  private readonly routerLogger: PrettyLogger
  private readonly middlewareLogger: PrettyLogger
  private readonly moduleName: string
  private readonly instances = new Map<Constructor, unknown>()
  private readonly moduleInitCalled = new Set<Constructor>()
  private readonly moduleDestroyHooks: OnModuleDestroy[] = []
  private readonly applicationBootstrapHooks: OnApplicationBootstrap[] = []
  private readonly beforeApplicationShutdownHooks: BeforeApplicationShutdown[] = []
  private readonly applicationShutdownHooks: OnApplicationShutdown[] = []
  private applicationBootstrapInvoked = false
  private isInitialized = false
  private isClosing = false
  private readonly pendingControllers: Constructor[] = []
  private readonly pendingLifecycleTokens: Constructor[] = []
  private readonly pendingGlobalGuardResolvers: Array<() => CanActivate> = []
  private readonly pendingGlobalPipeResolvers: Array<() => PipeTransform> = []
  private readonly pendingGlobalInterceptorResolvers: Array<() => Interceptor> = []
  private readonly pendingGlobalFilterResolvers: Array<() => ExceptionFilter> = []
  private readonly pendingGlobalMiddlewareResolvers: Array<() => MiddlewareDefinition> = []
  private httpContextMiddlewareRegistered = false

  constructor(
    private readonly rootModule: Constructor,
    private readonly options: ApplicationOptions = {},
  ) {
    this.logger = options.logger ?? createLogger('Framework')
    this.diLogger = this.logger.extend('DI')
    this.routerLogger = this.logger.extend('Router')
    this.middlewareLogger = this.logger.extend('Middleware')
    const rawModuleName = (this.rootModule as Function).name
    this.moduleName = rawModuleName && rawModuleName.trim().length > 0 ? rawModuleName : 'AnonymousModule'
    this.container = options.container ?? rootContainer.createChildContainer()
    ContainerRef.set(this.container)
    this.ensureHttpContextMiddleware()
    this.logger.info(
      `Initialized application container for module ${this.moduleName}`,
      colors.green(`+${performance.now().toFixed(2)}ms`),
    )
  }

  async init(): Promise<void> {
    this.logger.verbose(`Bootstrapping application for module ${this.moduleName}`)
    await this.registerModule(this.rootModule)

    // First, instantiate providers that participate in lifecycle hooks
    if (this.pendingLifecycleTokens.length > 0) {
      await this.invokeModuleInit(this.pendingLifecycleTokens)
    }

    // Materialize global enhancers provided via APP_* tokens
    if (this.pendingGlobalGuardResolvers.length > 0) {
      this.useGlobalGuards(...this.pendingGlobalGuardResolvers.map((r) => r()))
    }
    if (this.pendingGlobalPipeResolvers.length > 0) {
      this.useGlobalPipes(...this.pendingGlobalPipeResolvers.map((r) => r()))
    }
    if (this.pendingGlobalInterceptorResolvers.length > 0) {
      this.useGlobalInterceptors(...this.pendingGlobalInterceptorResolvers.map((r) => r()))
    }
    if (this.pendingGlobalFilterResolvers.length > 0) {
      this.useGlobalFilters(...this.pendingGlobalFilterResolvers.map((r) => r()))
    }
    if (this.pendingGlobalMiddlewareResolvers.length > 0) {
      const middlewares = this.pendingGlobalMiddlewareResolvers.map((r) => r())
      this.useGlobalMiddlewares(...middlewares)
    }

    // Then, register controllers (instantiates them and maps routes)
    for (const controller of this.pendingControllers) {
      this.registerController(controller)
    }

    await this.callApplicationBootstrapHooks()
    this.isInitialized = true
    this.logger.info(
      `Application initialization complete for module ${this.moduleName}`,
      colors.green(`+${performance.now().toFixed(2)}ms`),
    )
  }

  getInitialized(): boolean {
    return this.isInitialized
  }

  getInstance(): Hono {
    return this.app
  }

  getRouter(): Hono['router'] {
    return this.app.router
  }

  getRoutes(): Hono['routes'] {
    return this.app.routes
  }

  getContainer(): DependencyContainer {
    return this.container
  }

  async close(signal?: string): Promise<void> {
    if (this.isClosing) {
      return
    }

    this.isClosing = true
    await this.callBeforeApplicationShutdownHooks(signal)
    await this.callModuleDestroyHooks()
    await this.callApplicationShutdownHooks(signal)
  }

  private getProviderInstance<T>(token: Constructor<T>): T {
    if (!token) {
      throw new ReferenceError('Cannot resolve provider for undefined token')
    }

    if (!this.instances.has(token)) {
      let instance: T
      try {
        instance = this.resolveInstance(token)
      } catch (error) {
        if (error instanceof Error) {
          const tokenName = this.formatTokenName(token)
          error.message = `Failed to resolve provider ${tokenName}: ${error.message}`
        }
        throw error
      }
      this.instances.set(token, instance)
      this.registerLifecycleHandlers(instance)
    }

    return this.instances.get(token) as T
  }

  private formatTokenName(token: Constructor | InjectionToken<unknown> | undefined): string {
    if (typeof token === 'function') {
      if (token.name && token.name.length > 0) {
        return token.name
      }
      return token.toString()
    }

    return String(token ?? 'AnonymousProvider')
  }

  private isConstructorToken(token: unknown): token is Constructor {
    return typeof token === 'function'
  }

  /**
   * Register a provider (Constructor or provider configuration object)
   */
  private registerProvider(provider: ProviderConfig, scopedTokens: Constructor[]): void {
    // Simple case: Constructor as provider
    if (this.isConstructorToken(provider)) {
      this.registerSingleton(provider as Constructor)
      scopedTokens.push(provider as Constructor)
      return
    }

    // Complex case: Provider configuration object
    const config = provider as any

    if (!config || typeof config !== 'object' || !('provide' in config)) {
      throw new Error(
        `Invalid provider configuration: missing 'provide' token. ` +
          `Expected format: { provide: Token, useClass/useValue/useFactory/useExisting: ... }`,
      )
    }

    const provideToken = config.provide as InjectionToken

    // Handle global enhancers (APP_GUARD, APP_PIPE, etc.)
    if (this.isGlobalEnhancerToken(provideToken)) {
      this.registerGlobalEnhancer(config, scopedTokens)
      return
    }

    // Handle regular providers
    this.registerRegularProvider(config, scopedTokens)
  }

  /**
   * Check if token is a global enhancer token (APP_GUARD, APP_PIPE, etc.)
   */
  private isGlobalEnhancerToken(token: InjectionToken): boolean {
    return (
      token === (APP_GUARD as unknown as InjectionToken) ||
      token === (APP_PIPE as unknown as InjectionToken) ||
      token === (APP_INTERCEPTOR as unknown as InjectionToken) ||
      token === (APP_FILTER as unknown as InjectionToken) ||
      token === (APP_MIDDLEWARE as unknown as InjectionToken)
    )
  }

  /**
   * Register a global enhancer (APP_GUARD, APP_PIPE, etc.)
   */
  private registerGlobalEnhancer(config: any, scopedTokens: Constructor[]): void {
    const provideToken = config.provide as InjectionToken
    const enhancerType = this.getEnhancerType(provideToken)

    if ('useClass' in config && config.useClass) {
      const useClass = config.useClass as Constructor
      this.registerSingleton(useClass)
      scopedTokens.push(useClass)
      const resolver = () => {
        const instance = this.getProviderInstance(useClass)
        if (enhancerType === 'middleware') {
          return this.resolveMiddlewareDefinition(instance, useClass)
        }
        return instance
      }
      this.addGlobalEnhancerResolver(enhancerType, resolver)
      return
    }

    if ('useExisting' in config && config.useExisting) {
      const resolver = () => {
        const existing = this.container.resolve(config.useExisting as any)
        if (enhancerType === 'middleware') {
          return this.resolveMiddlewareDefinition(existing)
        }
        return existing
      }
      this.addGlobalEnhancerResolver(enhancerType, resolver)
      return
    }

    if ('useValue' in config) {
      if (enhancerType === 'middleware') {
        const lifecycleTarget = this.extractMiddlewareLifecycleTarget(config.useValue)
        if (lifecycleTarget) {
          this.registerLifecycleHandlers(lifecycleTarget)
        }
        const valueResolver = () => this.resolveMiddlewareDefinition(config.useValue)
        this.addGlobalEnhancerResolver('middleware', valueResolver)
        return
      }

      const valueResolver = () => config.useValue as unknown
      this.registerLifecycleHandlers(config.useValue)
      this.addGlobalEnhancerResolver(enhancerType, valueResolver)
      return
    }

    if ('useFactory' in config && config.useFactory) {
      if (enhancerType === 'middleware') {
        const factoryResolver = () => {
          const deps = (config.inject ?? []).map((t) => this.container.resolve(t as any))
          const result = (config.useFactory as (...args: any[]) => unknown)(...deps)
          return this.resolveMiddlewareDefinition(result)
        }
        this.addGlobalEnhancerResolver('middleware', factoryResolver)
        return
      }

      const factoryResolver = () => {
        const deps = (config.inject ?? []).map((t) => this.container.resolve(t as any))
        return (config.useFactory as (...args: any[]) => unknown)(...deps)
      }
      this.addGlobalEnhancerResolver(enhancerType, factoryResolver)
      return
    }

    throw new Error(
      `Invalid global enhancer configuration for ${String(provideToken)}: ` +
        `must specify useClass, useExisting, useValue, or useFactory`,
    )
  }

  /**
   * Get enhancer type from token
   */
  private getEnhancerType(token: InjectionToken): 'guard' | 'pipe' | 'interceptor' | 'filter' | 'middleware' {
    if (token === (APP_GUARD as unknown as InjectionToken)) return 'guard'
    if (token === (APP_PIPE as unknown as InjectionToken)) return 'pipe'
    if (token === (APP_INTERCEPTOR as unknown as InjectionToken)) return 'interceptor'
    if (token === (APP_FILTER as unknown as InjectionToken)) return 'filter'
    if (token === (APP_MIDDLEWARE as unknown as InjectionToken)) return 'middleware'
    throw new Error(`Unknown enhancer token: ${String(token)}`)
  }

  /**
   * Add a global enhancer resolver
   */
  private addGlobalEnhancerResolver(
    type: 'guard' | 'pipe' | 'interceptor' | 'filter' | 'middleware',
    resolver: () => unknown,
  ): void {
    switch (type) {
      case 'guard': {
        this.pendingGlobalGuardResolvers.push(resolver as () => CanActivate)
        break
      }
      case 'pipe': {
        this.pendingGlobalPipeResolvers.push(resolver as () => PipeTransform)
        break
      }
      case 'interceptor': {
        this.pendingGlobalInterceptorResolvers.push(resolver as () => Interceptor)
        break
      }
      case 'filter': {
        this.pendingGlobalFilterResolvers.push(resolver as () => ExceptionFilter)
        break
      }
      case 'middleware': {
        this.pendingGlobalMiddlewareResolvers.push(resolver as () => MiddlewareDefinition)
        break
      }
    }
  }

  private isHttpMiddleware(value: unknown): value is HttpMiddleware {
    return typeof value === 'object' && value !== null && typeof (value as HttpMiddleware).use === 'function'
  }

  private isMiddlewareDefinition(value: unknown): value is MiddlewareDefinition {
    return (
      typeof value === 'object' &&
      value !== null &&
      'handler' in (value as Record<PropertyKey, unknown>) &&
      this.isHttpMiddleware((value as MiddlewareDefinition).handler)
    )
  }

  private extractMiddlewareLifecycleTarget(value: unknown): unknown | undefined {
    if (this.isMiddlewareDefinition(value)) {
      return value.handler
    }

    if (this.isHttpMiddleware(value)) {
      return value
    }

    return undefined
  }

  private extractMiddlewareMetadata(source?: Constructor | MiddlewareMetadata): MiddlewareMetadata {
    if (!source) {
      return {}
    }

    if (typeof source === 'function') {
      return getMiddlewareMetadata(source)
    }

    return source
  }

  private mergeMiddlewareMetadata(primary?: MiddlewareMetadata, fallback?: MiddlewareMetadata): MiddlewareMetadata {
    return {
      path: primary?.path ?? fallback?.path,
      priority: primary?.priority ?? fallback?.priority,
    }
  }

  private resolveMiddlewareDefinition(
    value: unknown,
    metadataSource?: Constructor | MiddlewareMetadata,
  ): MiddlewareDefinition {
    if (this.isMiddlewareDefinition(value)) {
      const decoratorMetadata = this.extractMiddlewareMetadata(
        metadataSource ?? (value.handler as unknown as Constructor),
      )
      const mergedMetadata = this.mergeMiddlewareMetadata(value, decoratorMetadata)
      this.registerLifecycleHandlers(value.handler)
      return this.normalizeMiddlewareDefinition({
        handler: value.handler,
        path: mergedMetadata.path,
        priority: mergedMetadata.priority,
      })
    }

    if (this.isHttpMiddleware(value)) {
      const decoratorMetadata = this.extractMiddlewareMetadata(
        metadataSource ?? ((value as HttpMiddleware).constructor as Constructor),
      )
      this.registerLifecycleHandlers(value)
      return this.normalizeMiddlewareDefinition({
        handler: value,
        path: decoratorMetadata.path,
        priority: decoratorMetadata.priority,
      })
    }

    throw new ReferenceError('Invalid middleware configuration: expected Middleware or MiddlewareDefinition instance')
  }

  private normalizeMiddlewareDefinition(definition: MiddlewareDefinition): MiddlewareDefinition {
    const priority = definition.priority ?? 0
    const path = definition.path ?? '/*'
    return {
      handler: definition.handler,
      path,
      priority,
    }
  }

  private describeMiddlewarePath(path: MiddlewarePath | undefined): string {
    if (path == null) {
      return 'Global'
    }
    if (Array.isArray(path)) {
      return path.map((entry) => (typeof entry === 'string' ? entry : entry.toString())).join(', ')
    }
    return typeof path === 'string' ? path : path.toString()
  }

  useGlobalMiddlewares(...middlewares: MiddlewareDefinition[]): void {
    this.registerMiddlewareDefinitions(middlewares)
  }

  /**
   * Register a regular (non-enhancer) provider
   */
  private registerRegularProvider(config: any, scopedTokens: Constructor[]): void {
    const provideToken = config.provide as InjectionToken

    if ('useClass' in config && config.useClass) {
      const useClass = config.useClass as Constructor
      const isSingleton = config.singleton !== false // default true
      this.registerClassProvider(provideToken, useClass, isSingleton, scopedTokens)
      return
    }

    if ('useExisting' in config && config.useExisting) {
      this.registerExistingProvider(provideToken, config.useExisting)
      return
    }

    if ('useValue' in config) {
      this.registerValueProvider(provideToken, config.useValue)
      return
    }

    if ('useFactory' in config && config.useFactory) {
      const isSingleton = config.singleton !== false // default true
      this.registerFactoryProvider(provideToken, config.useFactory, config.inject ?? [], isSingleton)
      return
    }

    throw new Error(
      `Invalid provider configuration for ${String(provideToken)}: ` +
        `must specify useClass, useExisting, useValue, or useFactory`,
    )
  }

  private ensureHttpContextMiddleware(): void {
    if (this.httpContextMiddlewareRegistered) {
      return
    }

    this.httpContextMiddlewareRegistered = true
    this.registerMiddlewareDefinitions([
      {
        handler: HTTP_CONTEXT_INITIALIZATION_MIDDLEWARE,
        path: '/*',
        priority: HTTP_CONTEXT_MIDDLEWARE_PRIORITY,
      },
    ])
  }

  private registerMiddlewareDefinitions(definitions: MiddlewareDefinition[]): void {
    if (definitions.length === 0) {
      return
    }

    let normalized = definitions.map((definition) => this.normalizeMiddlewareDefinition(definition))
    normalized = normalized.toSorted((a, b) => (a.priority ?? 0) - (b.priority ?? 0))

    for (const definition of normalized) {
      this.globalEnhancers.middlewares.push(definition)
      let { path } = definition
      if (path == null) {
        path = '/*'
        definition.path = path
      }
      const handlerName = definition.handler.constructor.name || 'AnonymousMiddleware'
      const middlewareFn = async (context: Context, next: Next) => {
        return await definition.handler.use(context, next)
      }

      if (Array.isArray(path)) {
        for (const entry of path) {
          this.app.use(entry as any, middlewareFn)
        }
      } else {
        this.app.use(path as any, middlewareFn)
      }

      this.middlewareLogger.verbose(
        `Registered middleware ${handlerName} on ${this.describeMiddlewarePath(path)}`,
        colors.green(`+${performance.now().toFixed(2)}ms`),
      )
    }
  }

  /**
   * Register a class provider
   */
  private registerClassProvider(
    token: InjectionToken,
    useClass: Constructor,
    isSingleton: boolean,
    scopedTokens: Constructor[],
  ): void {
    if (isSingleton) {
      this.container.registerSingleton(token, useClass)
    } else {
      this.container.register(token, { useClass } as any)
    }
    const name = this.formatTokenName(useClass)
    this.diLogger.debug(
      'Registered class provider',
      colors.yellow(name),
      colors.green(`+${performance.now().toFixed(2)}ms`),
    )
    scopedTokens.push(useClass)
  }

  /**
   * Register an existing provider (alias)
   */
  private registerExistingProvider(token: InjectionToken, useExisting: InjectionToken): void {
    this.container.register(token, { useToken: useExisting } as any)
    this.diLogger.debug(
      'Registered existing provider alias',
      colors.yellow(String(token)),
      colors.green(`+${performance.now().toFixed(2)}ms`),
    )
  }

  /**
   * Register a value provider
   */
  private registerValueProvider(token: InjectionToken, useValue: unknown): void {
    this.container.register(token, { useValue } as any)
    this.registerLifecycleHandlers(useValue)
    const name = this.formatTokenName(token as unknown as Constructor)
    this.diLogger.debug(
      'Registered value provider',
      colors.yellow(name),
      colors.green(`+${performance.now().toFixed(2)}ms`),
    )
  }

  /**
   * Register a factory provider
   */
  private registerFactoryProvider(
    token: InjectionToken,
    useFactory: (...args: any[]) => unknown,
    inject: InjectionToken[],
    isSingleton: boolean,
  ): void {
    const factory = (c: DependencyContainer) => {
      const deps = inject.map((t) => c.resolve(t as any))
      return useFactory(...deps)
    }

    if (isSingleton) {
      // tsyringe doesn't have registerSingleton+factory; emulate via register with cache
      let cached: unknown
      let created = false
      this.container.register(token, {
        useFactory: () => {
          if (!created) {
            cached = factory(this.container)
            this.registerLifecycleHandlers(cached)
            created = true
          }
          return cached
        },
      } as any)
    } else {
      this.container.register(token, { useFactory: factory } as any)
    }

    this.diLogger.debug(
      'Registered factory provider',
      colors.yellow(String(token)),
      colors.green(`+${performance.now().toFixed(2)}ms`),
    )
  }

  private registerLifecycleHandlers(instance: unknown): void {
    if (isOnModuleDestroyHook(instance)) {
      this.registerLifecycleInstance(this.moduleDestroyHooks, instance)
    }

    if (isOnApplicationBootstrapHook(instance)) {
      this.registerLifecycleInstance(this.applicationBootstrapHooks, instance)
    }

    if (isBeforeApplicationShutdownHook(instance)) {
      this.registerLifecycleInstance(this.beforeApplicationShutdownHooks, instance)
    }

    if (isOnApplicationShutdownHook(instance)) {
      this.registerLifecycleInstance(this.applicationShutdownHooks, instance)
    }
  }

  private registerLifecycleInstance<T>(collection: T[], instance: T): void {
    if (!collection.includes(instance)) {
      collection.push(instance)
    }
  }

  private resolveInstance<T>(token: Constructor<T>): T {
    try {
      return this.container.resolve(token as unknown as InjectionToken<T>)
    } catch (error) {
      /* c8 ignore start */
      if (error instanceof Error && error.message.includes('Cannot inject the dependency ')) {
        // Cannot inject the dependency "appService" at position #0 of "AppController" constructor.
        const regexp = /Cannot inject the dependency "([^"]+)" at position #(\d+) of "([^"]+)" constructor\./
        const match = error.message.match(regexp)
        if (match) {
          const [, dependency, position, constructor] = match
          const baseMessage = `Cannot inject the dependency ${colors.yellow(dependency)} at position #${position} of "${colors.yellow(constructor)}" constructor.`
          const guidance =
            `\nPlease ensure ${colors.yellow(dependency)} (and its own dependencies) are registered as providers or the module that declares them is imported.` +
            `\nIf you are importing only the TypeScript type, switch to a runtime import:` +
            `\n${colors.red(`- import type { ${dependency} } from "./service";`)}\n${colors.green(
              `+ import { ${dependency} } from "./service";`,
            )}`
          const rootCause = this.formatInjectionRootCause(error)
          const detailedMessage =
            baseMessage +
            guidance +
            (rootCause ? `\n\n${colors.bold('Container details:')}\n${colors.gray(rootCause)}` : '')

          throw new ReferenceError(detailedMessage, { cause: error })
        }
      }
      throw error
      /* c8 ignore end */
    }
  }

  private formatInjectionRootCause(error: Error): string {
    const message = error.message ?? ''
    if (!message) {
      return ''
    }
    return message
      .split('\n')
      .map((line) => line.trim())
      .filter((line, index, arr) => line.length > 0 && (index === 0 || line !== arr[index - 1]))
      .join('\n')
  }

  private registerSingleton<T>(token: Constructor<T>): void {
    const injectionToken = token as unknown as InjectionToken<T>
    if (!this.container.isRegistered(injectionToken, true)) {
      this.container.registerSingleton(injectionToken, token)
      const providerName = token.name && token.name.length > 0 ? token.name : token.toString()
      this.diLogger.debug(
        'Registered singleton provider',
        colors.yellow(providerName),
        colors.green(`+${performance.now().toFixed(2)}ms`),
      )
    }
  }

  useGlobalGuards(...guards: CanActivate[]): void {
    this.globalEnhancers.guards.push(...guards)
  }

  useGlobalPipes(...pipes: PipeTransform[]): void {
    this.globalEnhancers.pipes.push(...pipes)
  }

  useGlobalInterceptors(...interceptors: Interceptor[]): void {
    this.globalEnhancers.interceptors.push(...interceptors)
  }

  useGlobalFilters(...filters: ExceptionFilter[]): void {
    this.globalEnhancers.filters.push(...filters)
  }

  private async registerModule(moduleClass: Constructor): Promise<void> {
    if (this.registeredModules.has(moduleClass)) {
      return
    }

    this.registeredModules.add(moduleClass)
    this.logger.debug('Registering module', moduleClass.name)

    const metadata = getModuleMetadata(moduleClass)
    const scopedTokens: Constructor[] = []

    for (const importedModule of resolveModuleImports(metadata.imports)) {
      await this.registerModule(importedModule)
    }

    for (const provider of metadata.providers ?? []) {
      this.registerProvider(provider as any, scopedTokens)
    }

    for (const controller of metadata.controllers ?? []) {
      this.registerSingleton(controller as Constructor)
      scopedTokens.push(controller as Constructor)
      // Defer controller instantiation until all modules are registered
      this.pendingControllers.push(controller as Constructor)
    }

    // Defer lifecycle instantiation until all modules are registered
    this.pendingLifecycleTokens.push(...scopedTokens)

    this.logger.debug(
      'Module registration complete',
      colors.yellow(moduleClass.name),
      colors.green(`+${performance.now().toFixed(2)}ms`),
    )
  }

  private async invokeModuleInit(tokens: Constructor[]): Promise<void> {
    const hasLifecycle = (ctor: Constructor | undefined): boolean => {
      if (!ctor) return false
      const proto = (ctor as any).prototype
      if (!proto) return false
      return (
        typeof proto.onModuleInit === 'function' ||
        typeof proto.onModuleDestroy === 'function' ||
        typeof proto.onApplicationBootstrap === 'function' ||
        typeof proto.beforeApplicationShutdown === 'function' ||
        typeof proto.onApplicationShutdown === 'function'
      )
    }

    for (const token of tokens) {
      if (!token) continue
      if (this.moduleInitCalled.has(token)) continue

      // Only instantiate providers that participate in lifecycle hooks.
      // Controllers are instantiated when routes are registered.
      if (!hasLifecycle(token)) continue

      const instance = this.getProviderInstance(token)
      this.moduleInitCalled.add(token)

      if (isOnModuleInitHook(instance)) {
        await instance.onModuleInit()
      }
    }
  }

  private async callApplicationBootstrapHooks(): Promise<void> {
    if (this.applicationBootstrapInvoked) {
      return
    }

    this.applicationBootstrapInvoked = true
    for (const instance of this.applicationBootstrapHooks) {
      await instance.onApplicationBootstrap()
    }
  }

  private async callBeforeApplicationShutdownHooks(signal?: string): Promise<void> {
    for (const instance of [...this.beforeApplicationShutdownHooks].reverse()) {
      await instance.beforeApplicationShutdown(signal)
    }
  }

  private async callModuleDestroyHooks(): Promise<void> {
    for (const instance of [...this.moduleDestroyHooks].reverse()) {
      await instance.onModuleDestroy()
    }
  }

  private async callApplicationShutdownHooks(signal?: string): Promise<void> {
    for (const instance of [...this.applicationShutdownHooks].reverse()) {
      await instance.onApplicationShutdown(signal)
    }
  }

  private registerController(controller: Constructor): void {
    const controllerInstance = this.getProviderInstance(controller)
    const controllerMetadata = getControllerMetadata(controller)
    const routes = getRoutesMetadata(controller)

    for (const route of routes) {
      const method = route.method.toUpperCase() as HTTPMethod
      const fullPath = this.buildPath(controllerMetadata, route.path)

      this.app.on(method, fullPath, async (context: Context) => {
        const handler = Reflect.get(controllerInstance, route.handlerName) as (...args: any[]) => any
        const executionContext = createExecutionContext(this.container, controller, handler)

        try {
          await this.executeGuards(controller, route.handlerName, executionContext)

          const response = await this.executeInterceptors(controller, route.handlerName, executionContext, async () => {
            const args = await this.resolveArguments(controller, route.handlerName, handler, context, executionContext)
            const result = await handler.apply(controllerInstance, args)
            return this.transformResult(context, result)
          })

          return response
        } catch (error) {
          return await this.handleException(controller, route.handlerName, error, executionContext, context)
        }
      })

      this.routerLogger.verbose(
        `Mapped route ${method} ${fullPath} -> ${controller.name}.${String(route.handlerName)}`,

        colors.green(`+${performance.now().toFixed(2)}ms`),
      )
    }
  }

  private buildPath(controller: ReturnType<typeof getControllerMetadata>, routePath: string): string {
    const globalPrefix = this.options.globalPrefix ?? ''
    const pieces = [routePath]
    if (controller.prefix) {
      pieces.unshift(controller.prefix)
    }
    if (!controller.bypassGlobalPrefix && globalPrefix) {
      pieces.unshift(globalPrefix)
    }

    if (pieces.length === 0) {
      return '/'
    }

    const normalized = pieces
      .map((segment) => segment?.trim())
      .filter(Boolean)
      .map((segment) => (segment!.startsWith('/') ? segment : `/${segment}`))

    const joined = normalized.join('').replaceAll(/[\\/]+/g, '/')
    if (joined.length > 1 && joined.endsWith('/')) {
      return joined.slice(0, -1)
    }

    return joined || '/'
  }

  private async executeGuards(
    controller: Constructor,
    handlerName: string | symbol,
    context: ReturnType<typeof createExecutionContext>,
  ): Promise<void> {
    const guards = [
      ...this.globalEnhancers.guards,
      ...collectGuards(controller, handlerName).map((ctor) => {
        this.registerSingleton(ctor)
        return this.getProviderInstance(ctor)
      }),
    ]

    for (const guard of guards) {
      if (!guard) {
        continue
      }
      const canActivate = await guard.canActivate(context)
      if (!canActivate) {
        this.logger.warn(`Guard blocked ${controller.name}.${String(handlerName)} execution`)
        throw new ForbiddenException()
      }
    }
  }

  private async executeInterceptors(
    controller: Constructor,
    handlerName: string | symbol,
    executionContext: ReturnType<typeof createExecutionContext>,
    finalHandler: () => Promise<unknown>,
  ): Promise<Response> {
    const interceptorInstances = [
      ...this.globalEnhancers.interceptors,
      ...collectInterceptors(controller, handlerName).map((ctor) => {
        this.registerSingleton(ctor)
        return this.getProviderInstance(ctor)
      }),
    ]

    const honoContext = HttpContext.getValue('hono')

    const callHandler: CallHandler = {
      handle: async (): Promise<FrameworkResponse> => this.ensureResponse(honoContext, await finalHandler()),
    }

    const interceptors = interceptorInstances.filter(Boolean).reverse()

    const dispatch: CallHandler = interceptors.reduce(
      (next, interceptor): CallHandler => ({
        handle: () => Promise.resolve(interceptor.intercept(executionContext, next)),
      }),
      callHandler,
    )

    const result = await dispatch.handle()
    return this.ensureResponse(honoContext, result)
  }

  private async handleException(
    controller: Constructor,
    handlerName: string | symbol,
    error: unknown,
    executionContext: ReturnType<typeof createExecutionContext>,
    context: Context,
  ): Promise<Response> {
    const filters = [
      ...this.globalEnhancers.filters,
      ...collectFilters(controller, handlerName).map((ctor) => {
        this.registerSingleton(ctor)
        return this.getProviderInstance(ctor)
      }),
    ]
    for (const filter of filters) {
      if (!filter) {
        continue
      }
      const maybeResponse = await filter.catch(error as Error, executionContext)
      if (maybeResponse) {
        return this.ensureResponse(context, maybeResponse)
      }
    }

    if (error instanceof HttpException) {
      return this.json(context, error.getResponse(), error.getStatus())
    }

    const message =
      error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}`.trim() : String(error)
    this.logger.error(`Unhandled error ${message}`)
    const response = {
      statusCode: 500,
      message: 'Internal server error',
    }

    return this.json(context, response, 500)
  }

  private transformResult(context: Context, result: unknown): unknown {
    if (result === undefined) {
      return context.res
    }

    return result
  }

  private ensureResponse(context: Context, payload: unknown): Response {
    if (payload instanceof Response) {
      return payload
    }

    if (payload === context.res) {
      return context.res
    }

    if (payload === undefined) {
      return context.res
    }

    if (typeof payload === 'string') {
      return this.markGeneratedResponse(new Response(payload as BodyInit))
    }

    if (payload instanceof ArrayBuffer) {
      return this.markGeneratedResponse(new Response(payload as BodyInit))
    }

    if (ArrayBuffer.isView(payload)) {
      return this.markGeneratedResponse(new Response(payload as BodyInit))
    }

    if (payload instanceof ReadableStream) {
      return this.markGeneratedResponse(new Response(payload))
    }

    return this.markGeneratedResponse(context.json(payload))
  }

  private json(context: Context, payload: unknown, status: number): Response {
    const normalizedPayload = payload === undefined ? null : payload
    return new Response(JSON.stringify(normalizedPayload), {
      status,
      headers: {
        'content-type': 'application/json',
      },
    })
  }

  private markGeneratedResponse(response: Response): Response {
    Reflect.set(response as unknown as Record<PropertyKey, unknown>, GENERATED_RESPONSE, true)
    return response
  }

  private getGlobalAndHandlerPipes(controller: Constructor, handlerName: string | symbol): PipeTransform[] {
    const handlerPipeInstances = collectPipes(controller, handlerName).map((ctor) => {
      this.registerSingleton(ctor)
      return this.getProviderInstance(ctor)
    })
    return [...this.globalEnhancers.pipes, ...handlerPipeInstances].filter(Boolean)
  }

  private async resolveArguments(
    controller: Constructor,
    handlerName: string | symbol,
    handler: Function,
    context: Context,
    executionContext: ReturnType<typeof createExecutionContext>,
  ): Promise<unknown[]> {
    const paramsMetadata = this.getParametersMetadata(controller, handlerName, handler, context)
    if (isDebugEnabled()) {
      this.logger.debug('Resolved params metadata', {
        controller: controller.name,
        handler: handlerName.toString(),
        paramsMetadata,
      })
    }
    const maxIndex = paramsMetadata.length > 0 ? Math.max(...paramsMetadata.map((item) => item.index)) : -1
    const args: unknown[] = Array.from({ length: maxIndex + 1 })
    const sharedPipes = this.getGlobalAndHandlerPipes(controller, handlerName)

    // console.debug('Params metadata', controller.name, handlerName, paramsMetadata);
    for (const metadata of paramsMetadata) {
      const value = await this.resolveParameterValue(metadata, context, executionContext)
      const transformed = await this.applyPipes(value, metadata, sharedPipes)
      args[metadata.index] = transformed
    }

    return args.length > 0 ? args : [context]
  }

  /* c8 ignore start */
  private getParametersMetadata(
    controller: Constructor,
    handlerName: string | symbol,
    handler: Function,
    context: Context,
  ): RouteParamMetadataItem[] {
    const controllerMetadata = getRouteArgsMetadata(controller.prototype, handlerName)
    const paramTypes: Constructor[] = (Reflect.getMetadata('design:paramtypes', controller.prototype, handlerName) ||
      []) as Constructor[]
    const handlerParamLength = handler.length

    const indexed = new Map<number, RouteParamMetadataItem>()

    for (const metadata of controllerMetadata) {
      indexed.set(metadata.index, {
        ...metadata,
        metatype: metadata.metatype ?? paramTypes[metadata.index],
      })
    }

    const potentialIndexes = [...indexed.keys(), paramTypes.length - 1, handlerParamLength - 1, -1]

    let maxIndex = -1
    for (const value of potentialIndexes) {
      if (value > maxIndex) {
        maxIndex = value
      }
    }

    const items: RouteParamMetadataItem[] = []

    if (maxIndex < 0) {
      return items
    }

    for (let index = 0; index <= maxIndex; index += 1) {
      const existing = indexed.get(index)
      if (existing) {
        items.push(existing)
      } else {
        const shouldInferContext = index < Math.max(paramTypes.length, handlerParamLength) && handlerParamLength > 0
        if (isDebugEnabled()) {
          this.logger.debug('Inferred context parameter', {
            controller: controller.name,
            handler: handlerName.toString(),
            index,
            paramTypesLength: paramTypes.length,
            handlerParamLength,
          })
        }
        if (shouldInferContext) {
          items.push({
            index,
            type: RouteParamtypes.CONTEXT,
            metatype: paramTypes[index] ?? context.constructor,
          })
        }
      }
    }

    return items.sort((a, b) => a.index - b.index)
  }
  /* c8 ignore end */

  private async resolveParameterValue(
    metadata: RouteParamMetadataItem,
    context: Context,
    executionContext: ReturnType<typeof createExecutionContext>,
  ): Promise<unknown> {
    if (metadata.factory) {
      return metadata.factory(context, executionContext)
    }

    switch (metadata.type) {
      case RouteParamtypes.REQUEST: {
        return context.req
      }
      case RouteParamtypes.BODY: {
        return await this.readBody(context)
      }
      case RouteParamtypes.QUERY: {
        return metadata.data ? context.req.query(metadata.data) : context.req.query()
      }
      case RouteParamtypes.PARAM: {
        return metadata.data ? context.req.param(metadata.data) : context.req.param()
      }
      case RouteParamtypes.HEADERS: {
        if (metadata.data) {
          return context.req.header(metadata.data)
        }
        return context.req.raw.headers
      }

      default: {
        return context
      }
    }
  }

  private async applyPipes(
    value: unknown,
    metadata: RouteParamMetadataItem,
    sharedPipes: PipeTransform[],
  ): Promise<unknown> {
    const paramPipes = (metadata.pipes || []).filter(Boolean).map((ctor) => {
      this.registerSingleton(ctor)
      return this.getProviderInstance(ctor)
    })
    const pipes = [...sharedPipes, ...paramPipes]

    if (pipes.length === 0) {
      return value
    }

    const argumentMetadata: ArgumentMetadata = {
      type: metadata.type,
      data: metadata.data,
      metatype: metadata.metatype,
    } as ArgumentMetadata

    let currentValue = value
    for (const pipe of pipes) {
      currentValue = await pipe.transform(currentValue, argumentMetadata)
    }

    return currentValue
  }

  private async readBody(context: Context): Promise<unknown> {
    const cacheKey = '__framework_cached_body__'
    if (context.get(cacheKey) !== undefined) {
      return context.get(cacheKey)
    }

    const contentType = context.req.header('content-type') ?? ''

    if (!contentType.includes('application/json')) {
      context.set(cacheKey, null)
      return null
    }

    try {
      const body = await context.req.json<unknown>()
      context.set(cacheKey, body)
      return body
    } catch (error) {
      throw new BadRequestException(
        {
          statusCode: 400,
          message: 'Invalid JSON payload',
        },
        'Invalid JSON payload',
        { cause: error },
      )
    }
  }
}

export async function createApplication(
  rootModule: Constructor,
  options: ApplicationOptions = {},
): Promise<HonoHttpApplication> {
  const app = new HonoHttpApplication(rootModule, options)
  await app.init()
  return app
}
