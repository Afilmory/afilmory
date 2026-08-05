import type { Context } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { ManifestPublicController } from './manifest.public.controller'
import type { ManifestService } from './manifest.service'
import { computeManifestETag } from './manifest.service'

function createContext(headers: Record<string, string> = {}): Context {
  const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))
  return {
    req: {
      header: (name: string) => normalized.get(name.toLowerCase()),
    },
  } as unknown as Context
}

function createController(etag: string, manifest: unknown) {
  const manifestService = {
    getManifestETag: vi.fn(async () => etag),
    getManifest: vi.fn(async () => manifest),
  } as unknown as ManifestService

  return { controller: new ManifestPublicController(manifestService), manifestService }
}

describe('computeManifestETag', () => {
  it('produces the same etag for identical fingerprint inputs', () => {
    const etagA = computeManifestETag('2026-08-06T00:00:00.000Z', 12)
    const etagB = computeManifestETag('2026-08-06T00:00:00.000Z', 12)

    expect(etagA).toBe(etagB)
  })

  it('produces a different etag when the max updatedAt changes', () => {
    const original = computeManifestETag('2026-08-06T00:00:00.000Z', 12)
    const afterUpdate = computeManifestETag('2026-08-06T00:05:00.000Z', 12)

    expect(afterUpdate).not.toBe(original)
  })

  it('produces a different etag when the photo count changes', () => {
    const original = computeManifestETag('2026-08-06T00:00:00.000Z', 12)
    const afterInsert = computeManifestETag('2026-08-06T00:00:00.000Z', 13)

    expect(afterInsert).not.toBe(original)
  })

  it('returns a strong etag with no weak-validator prefix', () => {
    const etag = computeManifestETag(null, 0)

    expect(etag.startsWith('W/')).toBe(false)
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/)
  })
})

describe('manifestPublicController#getManifest', () => {
  it('returns 304 with an empty body when If-None-Match matches the current etag', async () => {
    const etag = '"current-etag"'
    const { controller, manifestService } = createController(etag, {
      version: '1',
      data: [],
      cameras: [],
      lenses: [],
    })

    const response = await controller.getManifest(createContext({ 'if-none-match': etag }))

    expect(response.status).toBe(304)
    expect(response.headers.get('etag')).toBe(etag)
    expect(await response.text()).toBe('')
    expect(manifestService.getManifest).not.toHaveBeenCalled()
  })

  it('returns 200 with the manifest body and etag when If-None-Match is stale', async () => {
    const currentEtag = '"current-etag"'
    const manifest = { version: '1', data: [{ id: 'a' }], cameras: [], lenses: [] }
    const { controller, manifestService } = createController(currentEtag, manifest)

    const response = await controller.getManifest(createContext({ 'if-none-match': '"stale-etag"' }))

    expect(response.status).toBe(200)
    expect(response.headers.get('etag')).toBe(currentEtag)
    expect(await response.json()).toEqual(manifest)
    expect(manifestService.getManifest).toHaveBeenCalledOnce()
  })

  it('returns 200 with the manifest body when no If-None-Match header is present', async () => {
    const currentEtag = '"current-etag"'
    const manifest = { version: '1', data: [], cameras: [], lenses: [] }
    const { controller, manifestService } = createController(currentEtag, manifest)

    const response = await controller.getManifest(createContext())

    expect(response.status).toBe(200)
    expect(response.headers.get('etag')).toBe(currentEtag)
    expect(manifestService.getManifest).toHaveBeenCalledOnce()
  })
})
