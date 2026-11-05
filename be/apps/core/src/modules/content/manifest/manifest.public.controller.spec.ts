import type { Context } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { ManifestPublicController, SearchPhotosSchema } from './manifest.public.controller'
import { computeManifestETag, computeRevisionETag, MANIFEST_SEARCH_MAX_LIMIT, ManifestService } from './manifest.service'

function createContext(headers: Record<string, string> = {}): Context {
  const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))
  return {
    req: {
      header: (name: string) => normalized.get(name.toLowerCase()),
    },
  } as unknown as Context
}

function createController(revision: number, manifest: unknown) {
  const manifestService = {
    getManifestRevision: vi.fn(async () => revision),
    getManifestETag: vi.fn(async () => computeRevisionETag(revision)),
    getManifest: vi.fn(async () => manifest),
  } as unknown as ManifestService

  const controller = new ManifestPublicController(
    manifestService,
    { listChanges: vi.fn() } as never,
    { on: vi.fn(), off: vi.fn() } as never,
  )

  return { controller, manifestService }
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

describe('computeRevisionETag', () => {
  it('uses a revision token instead of a content hash', () => {
    expect(computeRevisionETag(8)).toBe('"rev-8"')
  })
})

describe('manifestPublicController#getManifest', () => {
  it('returns 304 with an empty body when If-None-Match matches the current etag', async () => {
    const { controller, manifestService } = createController(4, {
      version: '1',
      data: [],
      cameras: [],
      lenses: [],
    })

    const response = await controller.getManifest(createContext({ 'if-none-match': '"rev-4"' }))

    expect(response.status).toBe(304)
    expect(response.headers.get('etag')).toBe('"rev-4"')
    expect(response.headers.get('x-manifest-revision')).toBe('4')
    expect(await response.text()).toBe('')
    expect(manifestService.getManifest).not.toHaveBeenCalled()
  })

  it('returns 200 with the manifest body and etag when If-None-Match is stale', async () => {
    const manifest = { version: '1', data: [{ id: 'a' }], cameras: [], lenses: [] }
    const { controller, manifestService } = createController(5, manifest)

    const response = await controller.getManifest(createContext({ 'if-none-match': '"rev-1"' }))

    expect(response.status).toBe(200)
    expect(response.headers.get('etag')).toBe('"rev-5"')
    expect(response.headers.get('x-manifest-revision')).toBe('5')
    expect(await response.json()).toEqual(manifest)
    expect(manifestService.getManifest).toHaveBeenCalledOnce()
  })

  it('returns 200 with the manifest body when no If-None-Match header is present', async () => {
    const manifest = { version: '1', data: [], cameras: [], lenses: [] }
    const { controller, manifestService } = createController(0, manifest)

    const response = await controller.getManifest(createContext())

    expect(response.status).toBe(200)
    expect(response.headers.get('etag')).toBe('"rev-0"')
    expect(await response.json()).toEqual(manifest)
    expect(manifestService.getManifest).toHaveBeenCalledOnce()
  })
})

describe('manifest photo search pagination', () => {
  const photos = Array.from({ length: 250 }, (_, index) => ({ id: `photo-${index}` }))

  function createService() {
    const service = new ManifestService({} as never, {} as never)
    vi.spyOn(service, 'getManifest').mockResolvedValue({ data: photos } as never)
    return service
  }

  it('accepts page sizes up to the maximum and rejects larger ones', () => {
    expect(SearchPhotosSchema.safeParse({}).success).toBe(true)
    expect(SearchPhotosSchema.safeParse({ limit: 1 }).success).toBe(true)
    expect(SearchPhotosSchema.safeParse({ limit: MANIFEST_SEARCH_MAX_LIMIT }).success).toBe(true)
    expect(SearchPhotosSchema.safeParse({ limit: MANIFEST_SEARCH_MAX_LIMIT + 1 }).success).toBe(false)
    expect(SearchPhotosSchema.safeParse({ limit: 0 }).success).toBe(false)
    expect(SearchPhotosSchema.safeParse({ offset: -1 }).success).toBe(false)
  })

  it('returns one maximum-size page and the full total when limit is omitted', async () => {
    const result = await createService().searchPhotos({})

    expect(MANIFEST_SEARCH_MAX_LIMIT).toBe(100)
    expect(result.total).toBe(250)
    expect(result.data).toHaveLength(MANIFEST_SEARCH_MAX_LIMIT)
    expect(result.data[0]?.id).toBe('photo-0')
  })

  it('pages through the full result set with offset', async () => {
    const service = createService()

    const small = await service.searchPhotos({ limit: 6 })
    const last = await service.searchPhotos({ limit: MANIFEST_SEARCH_MAX_LIMIT, offset: 200 })
    const beyond = await service.searchPhotos({ limit: 10, offset: 250 })

    expect(small.data.map(photo => photo.id)).toEqual(photos.slice(0, 6).map(photo => photo.id))
    expect(last.data).toHaveLength(50)
    expect(last.data[0]?.id).toBe('photo-200')
    expect(last.total).toBe(250)
    expect(beyond).toEqual({ data: [], total: 250 })
  })
})
