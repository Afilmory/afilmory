import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type {
  BuilderPlugin,
  BuilderPluginConfigEntry,
  BuilderPluginESMImporter,
  BuilderPluginHooks,
  BuilderPluginReference,
} from './types.js'
import { isPluginESMImporter } from './types.js'

const requireResolver = createRequire(import.meta.url)

export interface LoadedPluginDefinition {
  name: string
  hooks: BuilderPluginHooks
  pluginOptions: unknown
}

interface NormalizedDescriptor {
  specifier: string
  name?: string
  options?: unknown
}

function normalizeDescriptor(ref: string): NormalizedDescriptor
function normalizeDescriptor(ref: BuilderPluginReference): NormalizedDescriptor | BuilderPluginESMImporter
function normalizeDescriptor(ref: BuilderPluginReference): NormalizedDescriptor | BuilderPluginESMImporter {
  if (typeof ref === 'string') {
    return { specifier: ref }
  }

  return ref
}

function resolveSpecifier(specifier: string, baseDir: string): { resolvedPath: string } {
  const isLocal = specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('file:')

  if (isLocal) {
    const resolvedPath = specifier.startsWith('file:') ? specifier : path.resolve(baseDir, specifier)
    return { resolvedPath }
  }

  const resolvedPath = requireResolver.resolve(specifier, {
    paths: [baseDir],
  })

  return { resolvedPath }
}

async function importModule(resolvedPath: string): Promise<unknown> {
  if (resolvedPath.startsWith('file:')) {
    return await import(resolvedPath)
  }

  const url = pathToFileURL(resolvedPath).href
  return await import(url)
}

async function instantiatePlugin(exportedValue: unknown, options?: unknown): Promise<BuilderPlugin> {
  const picked = [
    (exportedValue as { default?: unknown })?.default,
    (exportedValue as { plugin?: unknown }).plugin,
    (exportedValue as { createPlugin?: unknown }).createPlugin,
    exportedValue,
  ].find(Boolean)

  if (typeof picked === 'function') {
    const result = await Promise.resolve((picked as Function)(options))
    if (!result || typeof result !== 'object') {
      throw new Error('Plugin factory must return an object')
    }
    return result as BuilderPlugin
  }

  if (!picked || typeof picked !== 'object') {
    throw new Error('Unsupported plugin export format')
  }

  return picked as BuilderPlugin
}

function normalizeHooks(plugin: BuilderPlugin): BuilderPluginHooks {
  const hooks: BuilderPluginHooks = {}

  if (plugin.hooks && typeof plugin.hooks === 'object') {
    Object.assign(hooks, plugin.hooks)
  }

  const candidates = Object.entries(plugin).filter(([key]) => key !== 'name' && key !== 'hooks') as Array<
    [string, unknown]
  >

  for (const [key, value] of candidates) {
    if (typeof value === 'function' && !(key in hooks)) {
      ;(hooks as Record<string, unknown>)[key] = value
    }
  }

  return hooks
}

export async function loadPlugins(
  entries: BuilderPluginConfigEntry[] = [],
  options: { baseDir: string },
): Promise<LoadedPluginDefinition[]> {
  if (entries.length === 0) return []

  const { baseDir } = options

  const results: LoadedPluginDefinition[] = []

  for (const entry of entries) {
    if (isPluginESMImporter(entry)) {
      const { default: pluginFactoryOrPlugin } = await entry()
      const plugin = await instantiatePlugin(pluginFactoryOrPlugin)
      const hooks = normalizeHooks(plugin)
      const name = plugin.name || `lazy-loaded-plugin-${results.length}`

      results.push({
        name,
        hooks,
        pluginOptions: undefined,
      })
      continue
    }

    if (typeof entry === 'string') {
      const descriptor = normalizeDescriptor(entry)

      const { resolvedPath } = resolveSpecifier(descriptor.specifier, baseDir)

      const mod = await importModule(resolvedPath)
      const plugin = await instantiatePlugin(mod, descriptor.options)
      const hooks = normalizeHooks(plugin)

      const name =
        plugin.name ||
        descriptor.name ||
        (descriptor.specifier.startsWith('.') ? path.basename(descriptor.specifier) : descriptor.specifier)

      results.push({
        name,
        hooks,
        pluginOptions: descriptor.options,
      })
      continue
    }

    const plugin = await instantiatePlugin(entry)
    const hooks = normalizeHooks(plugin)
    const name = plugin.name || `inline-plugin-${results.length}`

    results.push({
      name,
      hooks,
      pluginOptions: undefined,
    })
  }

  return results
}
