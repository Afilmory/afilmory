import 'reflect-metadata'

import { injectable } from 'tsyringe'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  Constructor,
  createApplication,
  EmitEvent,
  EventEmitterService,
  EventModule,
  getModuleMetadata,
  Module,
  OnEvent,
} from '../src'
import { ContainerRef } from '../src/utils/container-ref'

/**
 * A simple in-memory Redis mock compatible with the minimal interface used by the event system.
 */
class FakeRedis {
  public published: Array<{ channel: string; message: string }> = []
  public subscribed: Set<string> = new Set<string>()
  public unsubscribed: Set<string> = new Set<string>()
  public quitCalled = false

  private messageHandler: ((channel: string, message: string) => void) | undefined

  publish(channel: string, message: string): Promise<number> {
    this.published.push({ channel, message })
    return Promise.resolve(1)
  }

  duplicate(): FakeRedis {
    // For our purposes, sharing the same instance is fine
    return this
  }

  async subscribe(channel: string): Promise<number> {
    this.subscribed.add(channel)
    return 1
  }

  async unsubscribe(channel: string): Promise<number> {
    this.unsubscribed.add(channel)
    return 1
  }

  async quit(): Promise<void> {
    this.quitCalled = true
  }

  on(event: string, listener: (...args: any[]) => void) {
    if (event === 'message') {
      this.messageHandler = listener as (channel: string, message: string) => void
    }
  }

  // Test helper to simulate an incoming pub/sub message from Redis
  emit(channel: string, message: string) {
    this.messageHandler?.(channel, message)
  }
}

@injectable()
class RedisAccessor {
  private readonly client = new FakeRedis()
  get(): FakeRedis {
    return this.client
  }
}

// Shared recording arrays
let recordedEvents: Array<{ event: string; payload: any }> = []
let failingHandlerCalls = 0
let secondaryHandlerCalls = 0

@injectable()
class UserEventHandlers {
  @OnEvent('user.registered')
  async onUserRegistered(payload: { userId: string; email: string; name?: string }) {
    recordedEvents.push({ event: 'user.registered', payload })
  }

  @OnEvent('user.updated')
  onUserUpdated(payload: { id: string; name: string }) {
    recordedEvents.push({ event: 'user.updated', payload })
  }

  @OnEvent('test.failing')
  async willFail(_payload: { id: string }) {
    failingHandlerCalls += 1
    throw new Error('intentional failure in handler')
  }

  @OnEvent('test.failing')
  async secondary(_payload: { id: string }) {
    secondaryHandlerCalls += 1
  }
}

@injectable()
class UserActions {
  // Promise-returning method to test async path of EmitEvent
  @EmitEvent('user.registered')
  async registerUser(input: { email: string; name: string }) {
    return { userId: 'u_1', email: input.email, name: input.name }
  }

  // Sync method to test sync path and selector option
  @EmitEvent('user.updated', {
    selector: (args, result) => {
      const [input] = args as [{ id: string; name: string }]
      return { id: input.id, name: result.name }
    },
  })
  updateUser(input: { id: string; name: string }) {
    return { id: input.id, name: input.name }
  }

  // Throwing method should NOT emit
  @EmitEvent('user.registered')
  async failFlow() {
    throw new Error('boom')
  }
}

@Module({
  imports: [
    EventModule.forRootAsync({
      useFactory: async (redis: RedisAccessor) => {
        return {
          redisClient: redis.get(),
          channel: 'test:events',
        }
      },
      inject: [RedisAccessor],
    }),
  ],
  providers: [RedisAccessor, UserEventHandlers, UserActions],
})
class EventTestModule {}

describe('Redis Event System', () => {
  beforeEach(() => {
    // Keep global listener registry across tests

    // Reset shared state
    recordedEvents = []
    failingHandlerCalls = 0
    secondaryHandlerCalls = 0
  })

  it('returns original descriptor when decorating non-function members with EmitEvent', () => {
    const descriptor: PropertyDescriptor = { value: 123 }
    const decorator = EmitEvent('noop.event')
    const result = decorator({} as any, 'value', descriptor)
    expect(result).toBe(descriptor)
  })

  it('ignores off calls when no listeners are registered', () => {
    const emitter = new EventEmitterService()
    emitter.off('missing.event' as any, (() => {}) as any)
  })

  it('binds @OnEvent handlers; @EmitEvent emits locally and publishes to redis; remote messages dispatch locally', async () => {
    const app = await createApplication(EventTestModule)

    const container = app.getContainer()
    const actions = container.resolve(UserActions)
    const emitter = container.resolve(EventEmitterService)
    const redis = container.resolve(RedisAccessor).get()

    // 1) Local dispatch via @EmitEvent (async method)
    await actions.registerUser({ email: 'a@b.com', name: 'A' })
    expect(recordedEvents).toHaveLength(1)
    expect(recordedEvents[0]).toEqual({
      event: 'user.registered',
      payload: { userId: 'u_1', email: 'a@b.com', name: 'A' },
    })

    // Verify Redis publish side-effect
    expect(redis.published).toHaveLength(1)
    const firstPub = redis.published[0]
    expect(firstPub.channel).toBe('test:events')
    const envelope = JSON.parse(firstPub.message)
    expect(envelope.event).toBe('user.registered')
    expect(envelope.payload).toEqual({ userId: 'u_1', email: 'a@b.com', name: 'A' })

    // 2) Remote dispatch: simulate cross-instance via pub/sub "message"
    redis.emit(
      'test:events',
      JSON.stringify({
        event: 'user.registered',
        payload: { userId: 'u_2', email: 'c@d.com', name: 'C' },
        emittedAt: new Date().toISOString(),
      }),
    )

    expect(recordedEvents).toHaveLength(2)
    expect(recordedEvents[1]).toEqual({
      event: 'user.registered',
      payload: { userId: 'u_2', email: 'c@d.com', name: 'C' },
    })

    // 3) Sync method + selector path
    actions.updateUser({ id: 'u_1', name: 'Alex' })
    // Wait a macrotask to allow microtask emission and any internal async publish to complete reliably
    await new Promise((r) => setTimeout(r, 0))
    const updatedMsg = redis.published
      .map((r) => JSON.parse(r.message))
      .find((m) => m.event === 'user.updated' && m.payload?.id === 'u_1' && m.payload?.name === 'Alex')
    expect(updatedMsg?.event).toBe('user.updated')
    expect(updatedMsg?.payload).toEqual({ id: 'u_1', name: 'Alex' })

    // 4) Throwing method should not emit
    await expect(actions.failFlow()).rejects.toThrow('boom')
    // Publish count unchanged
    expect(redis.published).toHaveLength(2)

    // Sanity check: manual emit also works
    await emitter.emit('user.registered', { userId: 'u_3', email: 'z@z.com' })
    expect(recordedEvents.at(-1)!.payload.userId).toBe('u_3')

    await app.close()
  })

  it('supports manual on/off proxying via EventEmitterService', async () => {
    const app = await createApplication(EventTestModule)
    const container = app.getContainer()
    const emitter = container.resolve(EventEmitterService)

    const calls: any[] = []
    const handler = (payload: any) => {
      calls.push(payload)
    }

    emitter.on('custom.event', handler)
    await emitter.emit('custom.event', { n: 1 })
    expect(calls).toEqual([{ n: 1 }])

    emitter.off('custom.event', handler)
    await emitter.emit('custom.event', { n: 2 })
    expect(calls).toEqual([{ n: 1 }]) // unchanged

    await app.close()
  })

  it('throws when emitting before the service has started', async () => {
    const emitter = new EventEmitterService()
    await expect(emitter.emit('not.started' as any, { ok: true })).rejects.toThrow(/has not been started/)
  })

  it('isolates handler errors and continues processing remaining listeners', async () => {
    const app = await createApplication(EventTestModule)
    const container = app.getContainer()
    const emitter = container.resolve(EventEmitterService)

    await emitter.emit('test.failing', { id: 'X' })

    // One failing handler + one successful
    expect(failingHandlerCalls).toBe(1)
    expect(secondaryHandlerCalls).toBe(1)

    await app.close()
  })

  it('handles malformed or incomplete envelopes in subscriber without throwing', async () => {
    const app = await createApplication(EventTestModule)
    const container = app.getContainer()
    const redis = container.resolve(RedisAccessor).get()

    // Malformed JSON
    redis.emit('test:events', 'not-json')

    // Missing event field
    redis.emit(
      'test:events',
      JSON.stringify({
        payload: { a: 1 },
        emittedAt: new Date().toISOString(),
      }),
    )

    // Should not throw and no new recordedEvents added
    expect(recordedEvents).toHaveLength(0)

    await app.close()
  })

  it('invokes start/stop lifecycle, subscribes/unsubscribes, and swallows publish errors', async () => {
    const app = await createApplication(EventTestModule)
    const container = app.getContainer()
    const emitter = container.resolve(EventEmitterService)
    const redis = container.resolve(RedisAccessor).get()

    // Normal publish path
    await emitter.emit('noop.event', { ok: true })
    expect(redis.published.length).toBeGreaterThan(0)

    // When publisher is missing, emit should still work locally (no throw)
    const originalPublisher = (emitter as any).publisher
    ;(emitter as any).publisher = undefined
    await emitter.emit('local.only', { ok: 'yes' })
    ;(emitter as any).publisher = originalPublisher

    // When publish throws, it should be swallowed
    ;(emitter as any).publisher = {
      publish: () => {
        throw new Error('publish failed')
      },
    }
    await emitter.emit('publish.fails', { n: 1 })
    ;(emitter as any).publisher = originalPublisher

    // Close triggers unsubscribe and quit
    await app.close()
    expect(redis.unsubscribed.has('test:events')).toBe(true)
    expect(redis.quitCalled).toBe(true)

    // Double close should not throw and exercise guards
    await app.close()
  })

  it('handles emit decorator when container is unavailable', async () => {
    ContainerRef.reset()

    class LooseEmitter {
      @EmitEvent('loose.sync')
      fire() {
        return 'done'
      }
    }

    const instance = new LooseEmitter()
    expect(instance.fire()).toBe('done')
  })

  it('handles async emit decorator failures gracefully when container is missing', async () => {
    ContainerRef.reset()

    class AsyncLooseEmitter {
      @EmitEvent('loose.async')
      async fire() {
        return 'done'
      }
    }

    const instance = new AsyncLooseEmitter()
    expect(await instance.fire()).toBe('done')
  })

  it('handles sync emit decorator rejections when emitter emit fails', async () => {
    const emitter = {
      emit: () => Promise.reject('emit failure'),
    }

    ContainerRef.set({
      resolve(token: unknown) {
        if (token === EventEmitterService) {
          return emitter
        }
        throw new Error(`Unexpected token ${String(token)}`)
      },
      isRegistered() {
        return true
      },
    } as any)

    class SyncLooseEmitter {
      @EmitEvent('loose.sync.failure')
      fire() {
        return 'done'
      }
    }

    const instance = new SyncLooseEmitter()
    expect(instance.fire()).toBe('done')
    await new Promise((resolve) => setTimeout(resolve, 0))

    ContainerRef.reset()
  })

  it('uses selector option for async emit decorator results', async () => {
    const emitter = {
      emit: vi.fn().mockResolvedValue(),
    }

    ContainerRef.set({
      registrations: new Map([[EventEmitterService, {}]]),
      resolve(token: unknown) {
        if (token === EventEmitterService) {
          return emitter
        }
        throw new Error(`Unexpected token ${String(token)}`)
      },
      isRegistered() {
        return true
      },
    } as any)

    class AsyncSelectorEmitter {
      @EmitEvent('selector.async', {
        selector: (args, result) => ({ original: args[0], doubled: result }),
      })
      async run(input: number) {
        return input * 2
      }
    }

    const instance = new AsyncSelectorEmitter()
    const result = await instance.run(21)
    expect(result).toBe(42)
    expect(emitter.emit).toHaveBeenCalledWith('selector.async', { original: 21, doubled: 42 })

    ContainerRef.reset()
  })

  it('uses selector option for sync emit decorator results', async () => {
    const emitter = {
      emit: vi.fn().mockResolvedValue(),
    }

    ContainerRef.set({
      registrations: new Map([[EventEmitterService, {}]]),
      resolve(token: unknown) {
        if (token === EventEmitterService) {
          return emitter
        }
        throw new Error(`Unexpected token ${String(token)}`)
      },
      isRegistered() {
        return true
      },
    } as any)

    class SyncSelectorEmitter {
      @EmitEvent('selector.sync', {
        selector: (args, result) => ({ args, sum: result }),
      })
      run(a: number, b: number) {
        return a + b
      }
    }

    const instance = new SyncSelectorEmitter()
    const output = instance.run(5, 7)
    expect(output).toBe(12)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(emitter.emit).toHaveBeenCalledWith('selector.sync', { args: [5, 7], sum: 12 })

    ContainerRef.reset()
  })

  it('does not restart the event service when start is invoked twice', async () => {
    const emitter = new EventEmitterService()
    const redis = new FakeRedis()
    const subscribeSpy = vi.spyOn(redis, 'subscribe')

    const container = {
      registrations: new Map([[EventEmitterService, {}]]),
      resolve(token: unknown) {
        if (token === EventEmitterService) {
          return emitter
        }
        return new (token as Constructor)()
      },
      isRegistered() {
        return true
      },
    }

    ContainerRef.set(container as any)
    await emitter.start({ redisClient: redis as any, channel: 'idempotent' })
    await emitter.start({ redisClient: redis as any, channel: 'idempotent' })
    expect(subscribeSpy).toHaveBeenCalledTimes(1)
    await emitter.stop()
    ContainerRef.reset()
  })

  it('binds listeners from legacy registry map implementations', async () => {
    ContainerRef.reset()

    const hits: string[] = []

    @injectable()
    class LegacyListener {
      @OnEvent('legacy.hit')
      handle(payload: { label: string }) {
        hits.push(payload.label)
      }
    }

    const emitter = new EventEmitterService()
    const redis = new FakeRedis()
    const legacyInstance = new LegacyListener()

    const container = {
      registrations: undefined,
      _registry: undefined,
      _registryMap: new Map([[LegacyListener, {}]]),
      resolve(token: unknown) {
        if (token === EventEmitterService) {
          return emitter
        }
        if (token === LegacyListener) {
          return legacyInstance
        }
        if (typeof token === 'function') {
          return new (token as Constructor)()
        }
        throw new Error(`Unexpected token ${String(token)}`)
      },
      isRegistered() {
        return true
      },
    }

    ContainerRef.set(container as any)
    await emitter.start({ redisClient: redis as any, channel: 'legacy' })
    await emitter.emit('legacy.hit', { label: 'ok' })
    expect(hits).toEqual(['ok'])
    await emitter.stop()
    ContainerRef.reset()
  })

  it('binds listeners from legacy _registry implementations', async () => {
    ContainerRef.reset()

    const hits: string[] = []

    @injectable()
    class RegistryListener {
      @OnEvent('registry.hit')
      handle(payload: { label: string }) {
        hits.push(payload.label)
      }
    }

    const emitter = new EventEmitterService()
    const redis = new FakeRedis()
    const registryInstance = new RegistryListener()

    const container = {
      registrations: undefined,
      _registry: new Map([[RegistryListener, {}]]),
      _registryMap: undefined,
      resolve(token: unknown) {
        if (token === EventEmitterService) {
          return emitter
        }
        if (token === RegistryListener) {
          return registryInstance
        }
        if (typeof token === 'function') {
          return new (token as Constructor)()
        }
        throw new Error(`Unexpected token ${String(token)}`)
      },
      isRegistered() {
        return true
      },
    }

    ContainerRef.set(container as any)
    await emitter.start({ redisClient: redis as any, channel: 'legacy-registry' })
    await emitter.emit('registry.hit', { label: 'legacy' })
    expect(hits).toEqual(['legacy'])
    await emitter.stop()
    ContainerRef.reset()
  })

  it('binds listeners from resolver map implementations', async () => {
    ContainerRef.reset()

    const hits: string[] = []

    @injectable()
    class ResolverListener {
      @OnEvent('resolver.hit')
      handle() {
        hits.push('resolver')
      }
    }

    const emitter = new EventEmitterService()
    const redis = new FakeRedis()
    const listener = new ResolverListener()

    const container = {
      registrations: undefined,
      _registry: undefined,
      _registryMap: undefined,
      _resolvers: new Map([[ResolverListener, {}]]),
      resolve(token: unknown) {
        if (token === EventEmitterService) {
          return emitter
        }
        if (token === ResolverListener) {
          return listener
        }
        if (typeof token === 'function') {
          return new (token as Constructor)()
        }
        throw new Error(`Unexpected token ${String(token)}`)
      },
      isRegistered() {
        return true
      },
    }

    ContainerRef.set(container as any)
    await emitter.start({ redisClient: redis as any, channel: 'resolver' })
    await emitter.emit('resolver.hit', {})
    expect(hits).toEqual(['resolver'])
    await emitter.stop()
    ContainerRef.reset()
  })

  it('uses the default channel when options omit a channel', async () => {
    const emitter = new EventEmitterService()
    const redis = new FakeRedis()

    const container = {
      registrations: new Map([[EventEmitterService, {}]]),
      resolve(token: unknown) {
        if (token === EventEmitterService) {
          return emitter
        }
        if (typeof token === 'function') {
          return new (token as Constructor)()
        }
        throw new Error(`Unexpected token ${String(token)}`)
      },
      isRegistered() {
        return true
      },
    }

    ContainerRef.set(container as any)
    await emitter.start({ redisClient: redis as any })
    expect((emitter as any).channel).toBe('afilmory:events')
    await emitter.stop()
    ContainerRef.reset()
  })

  it('binds listeners when container registry structures are absent', async () => {
    recordedEvents = []
    const emitter = new EventEmitterService()
    const redis = new FakeRedis()

    const resolvedHandlers = new UserEventHandlers()

    const container = {
      resolve(token: unknown) {
        if (token === EventEmitterService) {
          return emitter
        }
        if (token === UserEventHandlers) {
          return resolvedHandlers
        }
        if (typeof token === 'function') {
          return new (token as Constructor)()
        }
        throw new Error(`Unexpected token ${String(token)}`)
      },
      isRegistered() {
        return true
      },
    }

    ContainerRef.set(container as any)
    await emitter.start({ redisClient: redis as any, channel: 'absent-registry' })
    await emitter.emit('user.updated', { id: '42', name: 'Neo' })
    expect(recordedEvents.some((entry) => entry.event === 'user.updated')).toBe(true)
    await emitter.stop()
    ContainerRef.reset()
  })

  it('warns with constructor string when listener name is unavailable', async () => {
    ContainerRef.reset()

    const emitter = new EventEmitterService()
    const redis = new FakeRedis()

    const AnonymousListener = eval('(class {})') as Constructor
    const metadataKey = Symbol.for('events.listener')
    AnonymousListener.prototype.handle = () => {}
    Reflect.defineMetadata(metadataKey, [{ method: 'handle', event: 'anonymous.warning' }], AnonymousListener)

    const container = {
      registrations: new Map([[AnonymousListener, {}]]),
      resolve(token: unknown) {
        if (token === EventEmitterService) {
          return emitter
        }
        if (token === AnonymousListener) {
          throw new Error('missing listener')
        }
        throw new Error(`Unexpected token ${String(token)}`)
      },
      isRegistered() {
        return true
      },
    }

    const warnSpy = vi.spyOn((emitter as any).logger, 'warn')

    ContainerRef.set(container as any)
    await emitter.start({ redisClient: redis as any, channel: 'anonymous-warning' })
    const warningCall = warnSpy.mock.calls.find(
      (args): args is [string] => typeof args[0] === 'string' && args[0].includes('class {}'),
    )?.[0]
    expect(warningCall).toBeDefined()
    expect(warningCall!).toContain('class {}')

    warnSpy.mockRestore()
    await emitter.stop()
    ContainerRef.reset()
  })

  it('guards repeated lifecycle calls in EventModule bootstrapper', async () => {
    const redis = new FakeRedis()
    const emitter = {
      start: vi.fn().mockResolvedValue(),
      stop: vi.fn().mockResolvedValue(),
    }

    const DynamicModule = EventModule.forRootAsync({
      useFactory: async () => ({ redisClient: redis as any, channel: 'bootstrapper' }),
    })

    const metadata = getModuleMetadata(DynamicModule)
    const BootstrapperCtor = metadata.providers?.find((provider) => provider !== EventEmitterService) as Constructor
    const bootstrapper = new BootstrapperCtor()

    ContainerRef.set({
      registrations: new Map([[EventEmitterService, {}]]),
      resolve(token: unknown) {
        if (token === EventEmitterService) {
          return emitter
        }
        throw new Error(`Unexpected token ${String(token)}`)
      },
      isRegistered() {
        return true
      },
    } as any)

    await bootstrapper.onModuleInit()
    await bootstrapper.onModuleInit()
    expect(emitter.start).toHaveBeenCalledTimes(1)

    await bootstrapper.onModuleDestroy()
    await bootstrapper.onModuleDestroy()
    expect(emitter.stop).toHaveBeenCalledTimes(1)

    ContainerRef.reset()
  })

  it('swallows redis teardown errors during stop', async () => {
    class FlakyRedis extends FakeRedis {
      public unsubscribeAttempts = 0
      public quitAttempts = 0

      async unsubscribe(channel: string): Promise<number> {
        this.unsubscribeAttempts += 1
        throw new Error(`unsubscribe failure for ${channel}`)
      }

      async quit(): Promise<void> {
        this.quitAttempts += 1
        throw new Error('quit failure')
      }
    }

    @injectable()
    class FlakyRedisAccessor {
      private readonly client = new FlakyRedis()

      get(): FlakyRedis {
        return this.client
      }
    }

    @Module({
      imports: [
        EventModule.forRootAsync({
          useFactory: async (redis: FlakyRedisAccessor) => ({
            redisClient: redis.get(),
            channel: 'flaky:test',
          }),
          inject: [FlakyRedisAccessor],
        }),
      ],
      providers: [FlakyRedisAccessor],
    })
    class FlakyModule {}

    const app = await createApplication(FlakyModule)
    const container = app.getContainer()
    const emitter = container.resolve(EventEmitterService)
    const redis = container.resolve(FlakyRedisAccessor).get()

    await emitter.emit('noop.event', { ok: true })
    await app.close('flaky-stop')

    expect(redis.unsubscribeAttempts).toBeGreaterThan(0)
    expect(redis.quitAttempts).toBeGreaterThan(0)
  })

  it('discovers decorated listeners from container registrations', async () => {
    ContainerRef.reset()

    @injectable()
    class ScannedListener {
      public hits = 0

      @OnEvent('scanned.event')
      handle() {
        this.hits += 1
      }
    }

    @injectable()
    class NonFunctionListener {
      @OnEvent('non-function.event')
      handler() {}
    }

    @injectable()
    class RemovedMetadataListener {
      @OnEvent('removed.metadata')
      noop() {}
    }

    // Force metadata edge cases
    NonFunctionListener.prototype.handler = 'not a function' as any
    const listenerMetadataKey = Symbol.for('events.listener')
    Reflect.deleteMetadata(listenerMetadataKey, RemovedMetadataListener)

    const listenerInstance = new ScannedListener()
    const nonFunctionInstance = new NonFunctionListener()
    const removedMetadataInstance = new RemovedMetadataListener()
    const redis = new FakeRedis()
    const emitter = new EventEmitterService()

    const fakeContainer = {
      registrations: new Map<unknown, unknown>([
        [ScannedListener, {}],
        [NonFunctionListener, {}],
        [RemovedMetadataListener, {}],
      ]),
      resolve(token: unknown) {
        if (token === EventEmitterService) {
          return emitter
        }
        if (token === ScannedListener) {
          return listenerInstance
        }
        if (token === NonFunctionListener) {
          return nonFunctionInstance
        }
        if (token === RemovedMetadataListener) {
          return removedMetadataInstance
        }
        throw new Error(`Unexpected token ${String(token)}`)
      },
      isRegistered() {
        return true
      },
    }

    ContainerRef.set(fakeContainer as any)
    await emitter.start({ redisClient: redis as any, channel: 'scan:test' })
    await emitter.emit('scanned.event', {})
    expect(listenerInstance.hits).toBe(1)
    // Rebind to cover cached handlers path
    await (emitter as any).bindAllListeners()
    await emitter.stop()
    ContainerRef.reset()
  })

  it('scans object-based container registries for listeners', async () => {
    ContainerRef.reset()

    @injectable()
    class ObjectRegistryListener {
      public count = 0

      @OnEvent('object.registry')
      fire() {
        this.count += 1
      }
    }

    const instance = new ObjectRegistryListener()
    const redis = new FakeRedis()
    const emitter = new EventEmitterService()

    const container = {
      _registry: { placeholder: {} },
      resolve(token: unknown) {
        if (token === EventEmitterService) {
          return emitter
        }
        if (token === ObjectRegistryListener) {
          return instance
        }
        throw new Error(`Unexpected token ${String(token)}`)
      },
      isRegistered() {
        return true
      },
    }

    ContainerRef.set(container as any)
    await emitter.start({ redisClient: redis as any, channel: 'object:test' })
    await emitter.emit('object.registry', {})
    expect(instance.count).toBe(1)
    await emitter.stop()
    ContainerRef.reset()
  })

  it('continues binding when a listener cannot be resolved', async () => {
    const captured: string[] = []

    @injectable()
    class ProvidedListener {
      @OnEvent('provided.bound')
      record(payload: { value: string }) {
        captured.push(payload.value)
      }
    }

    @injectable()
    class TriggerService {
      constructor(private readonly emitter: EventEmitterService) {}

      async trigger() {
        await this.emitter.emit('provided.bound', { value: 'ok' })
      }
    }

    @injectable()
    class MinimalRedisAccessor {
      private readonly client = new FakeRedis()

      get(): FakeRedis {
        return this.client
      }
    }

    @injectable()
    class MissingListener {
      @OnEvent('missing.bound')
      handle(): void {
        // intentionally unused
      }
    }
    void MissingListener

    @Module({
      imports: [
        EventModule.forRootAsync({
          useFactory: async (redis: MinimalRedisAccessor) => ({
            redisClient: redis.get(),
            channel: 'partial:test',
          }),
          inject: [MinimalRedisAccessor],
        }),
      ],
      providers: [MinimalRedisAccessor, ProvidedListener, TriggerService],
    })
    class PartialModule {}

    const app = await createApplication(PartialModule)
    const container = app.getContainer()
    const trigger = container.resolve(TriggerService)

    await trigger.trigger()
    expect(captured).toEqual(['ok'])

    await app.close('partial-module')
  })
})
