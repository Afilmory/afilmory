/// <reference types="node" />
import { describe, expect, it } from 'vitest'

import ogImagePlugin from './index'

/**
 * The plugin writes cards as `<id>.jpg` but the skipped-photo path only derives
 * a URL — it never verifies the object exists. A manifest from a previous
 * format therefore has to force a re-render, otherwise those photos would be
 * handed a URL for a key that was never uploaded.
 */

const storageManager = {
  async uploadFile(key: string) {
    return { key }
  },
  async generatePublicUrl(key: string) {
    return `https://cdn.example.com/${key}`
  },
  addExcludePrefix() {},
}

const builder = {
  getStorageConfig: () => ({ provider: 's3', bucket: 'b', region: 'r', accessKeyId: 'k', secretAccessKey: 's' }),
  getStorageManager: () => storageManager,
}

const logger = {
  main: { info: () => {}, warn: () => {}, error: () => {} },
  thumbnail: { warn: () => {}, debug: () => {} },
}

function createPlugin() {
  return ogImagePlugin({ enable: true })
}

async function loadManifest(plugin: ReturnType<typeof createPlugin>, ogImageUrl: string | null | undefined) {
  const runShared = new Map<string, unknown>()

  await plugin.hooks!.onInit!({ builder, config: { user: {} }, logger } as never)
  await plugin.hooks!.afterManifestLoad!({
    runShared,
    logger,
    payload: {
      options: {},
      manifest: { version: 'v10', data: [{ id: 'PIC1', ogImageUrl }] },
      manifestMap: new Map(),
    },
  } as never)

  return runShared
}

/** Load a manifest with several photos, each carrying its own recorded card URL. */
async function loadManifestEntries(
  plugin: ReturnType<typeof createPlugin>,
  entries: Array<{ id: string; ogImageUrl: string | null }>,
) {
  const runShared = new Map<string, unknown>()

  await plugin.hooks!.onInit!({ builder, config: { user: {} }, logger } as never)
  await plugin.hooks!.afterManifestLoad!({
    runShared,
    logger,
    payload: { options: {}, manifest: { version: 'v10', data: entries }, manifestMap: new Map() },
  } as never)

  return runShared
}

/** Returns how many uploads the skipped-photo path performed. */
async function processSkippedPhoto(
  plugin: ReturnType<typeof createPlugin>,
  runShared: Map<string, unknown>,
  id = 'PIC1',
) {
  let uploads = 0
  const countingStorage = {
    ...storageManager,
    async uploadFile(key: string) {
      uploads++
      return { key }
    },
  }

  const item: Record<string, unknown> = { id, title: 'T', tags: [] }

  await plugin.hooks!.afterPhotoProcess!({
    builder: { ...builder, getStorageManager: () => countingStorage },
    logger,
    runShared,
    payload: {
      result: { item, type: 'skipped' },
      options: { isForceMode: false, isForceManifest: false },
      context: { pluginData: {} },
    },
  } as never)

  return { uploads, item }
}

describe('og image format migration', () => {
  it('re-renders skipped photos when the manifest holds cards from a previous format', async () => {
    const plugin = createPlugin()
    const runShared = await loadManifest(plugin, 'https://cdn.example.com/.afilmory/og-images/PIC1.png')

    const { uploads, item } = await processSkippedPhoto(plugin, runShared)

    expect(uploads).toBe(1)
    expect(item.ogImageUrl).toBe('https://cdn.example.com/.afilmory/og-images/PIC1.jpg')
  })

  it('reuses the existing key when the manifest is already on the current format', async () => {
    const plugin = createPlugin()
    const runShared = await loadManifest(plugin, 'https://cdn.example.com/.afilmory/og-images/PIC1.jpg')

    const { uploads, item } = await processSkippedPhoto(plugin, runShared)

    expect(uploads).toBe(0)
    expect(item.ogImageUrl).toBe('https://cdn.example.com/.afilmory/og-images/PIC1.jpg')
  })

  it('does not re-render on a fresh install with no recorded card', async () => {
    const plugin = createPlugin()
    const runShared = await loadManifest(plugin, null)

    const { uploads } = await processSkippedPhoto(plugin, runShared)

    expect(uploads).toBe(0)
  })

  // Anything that is not exactly the current extension is treated as stale.
  // Over-eager re-rendering is safe; under-detecting hands out dead URLs.
  it.each([
    ['a .png card', 'https://c.com/o/P.png', true],
    ['a .jpeg synonym', 'https://c.com/o/P.jpeg', true],
    ['a card with a query string', 'https://c.com/o/P.png?v=2', true],
    ['an uppercase current extension', 'https://c.com/o/P.JPG', false],
    ['a path with no extension', 'https://c.com/o/P', false],
    ['an empty value', '', false],
    ['undefined', undefined, false],
  ])('classifies %s as legacy=%s', async (_label, ogImageUrl, isLegacy) => {
    const plugin = createPlugin()
    const runShared = await loadManifest(plugin, ogImageUrl as string | undefined)
    const state = runShared.get('state') as { legacyFormatPhotoIds?: Set<string> } | undefined

    expect(state?.legacyFormatPhotoIds?.has('PIC1') ?? false).toBe(isLegacy)
  })

  // A library part-way through migration must converge: only the photos still on
  // the old format get re-rendered, so repeated runs settle instead of
  // re-rendering everything forever.
  it('re-renders only the photos still on the old format', async () => {
    const plugin = createPlugin()
    const runShared = await loadManifestEntries(plugin, [
      { id: 'OLD', ogImageUrl: 'https://c.com/o/OLD.png' },
      { id: 'NEW', ogImageUrl: 'https://c.com/o/NEW.jpg' },
    ])

    const state = runShared.get('state') as { legacyFormatPhotoIds?: Set<string> }
    expect([...(state.legacyFormatPhotoIds ?? [])]).toEqual(['OLD'])

    const oldResult = await processSkippedPhoto(plugin, runShared, 'OLD')
    const newResult = await processSkippedPhoto(plugin, runShared, 'NEW')

    expect(oldResult.uploads).toBe(1)
    expect(newResult.uploads).toBe(0)
  })
})
