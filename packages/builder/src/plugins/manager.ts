import type { AfilmoryBuilder } from '../builder/builder.js'
import { logger } from '../logger/index.js'
import { loadPlugins } from './loader.js'
import type {
  BuilderPluginConfigEntry,
  BuilderPluginEvent,
  BuilderPluginEventPayloads,
  BuilderPluginHookContext,
} from './types.js'

export type PluginRunState = Map<string, Map<string, unknown>>

export class PluginManager {
  private readonly entries: BuilderPluginConfigEntry[]
  private readonly baseDir: string
  private plugins: Awaited<ReturnType<typeof loadPlugins>> = []
  private loadPromise: Promise<void> | null = null

  constructor(entries: BuilderPluginConfigEntry[] = [], options: { baseDir?: string } = {}) {
    this.entries = entries
    this.baseDir = options.baseDir ?? process.cwd()
  }

  hasPlugins(): boolean {
    return this.entries.length > 0
  }

  createRunState(): PluginRunState {
    return new Map()
  }

  async ensureLoaded(builder: AfilmoryBuilder): Promise<void> {
    if (this.plugins.length > 0 || this.loadPromise) {
      await this.loadPromise
      return
    }

    if (this.entries.length === 0) {
      this.plugins = []
      return
    }

    this.loadPromise = (async () => {
      this.plugins = await loadPlugins(this.entries, {
        baseDir: this.baseDir,
      })

      for (const plugin of this.plugins) {
        const initHook = plugin.hooks.onInit
        if (!initHook) continue

        try {
          await initHook({
            builder,
            config: builder.getConfig(),
            logger,
            registerStorageProvider: builder.registerStorageProvider.bind(builder),
            pluginOptions: plugin.pluginOptions,
          })
        } catch (error) {
          logger.main.error(`[Builder Plugin] 初始化插件 "${plugin.name}" 失败`, error)
          throw error
        }
      }
    })()

    await this.loadPromise
  }

  async emit<TEvent extends BuilderPluginEvent>(
    builder: AfilmoryBuilder,
    runState: PluginRunState,
    event: TEvent,
    payload: BuilderPluginEventPayloads[TEvent],
  ): Promise<void> {
    if (this.plugins.length === 0) return

    for (const plugin of this.plugins) {
      const hook = plugin.hooks[event] as
        | ((context: BuilderPluginHookContext<TEvent>) => void | Promise<void>)
        | undefined
      if (!hook) continue

      const sharedKey = plugin.name
      let shared = runState.get(sharedKey)
      if (!shared) {
        shared = new Map()
        runState.set(sharedKey, shared)
      }

      const context: BuilderPluginHookContext<TEvent> = {
        builder,
        config: builder.getConfig(),
        logger,
        registerStorageProvider: builder.registerStorageProvider.bind(builder),
        options: payload.options,
        pluginName: plugin.name,
        pluginOptions: plugin.pluginOptions,
        runShared: shared,
        event,
        payload,
      }

      try {
        await hook(context)
      } catch (error) {
        logger.main.error(`[Builder Plugin] 插件 "${plugin.name}" 在 ${event} 钩子中抛出错误`, error)
        throw error
      }
    }
  }
}
