import assert from 'node:assert/strict'

import { it } from 'vitest'

import type { PhotoManifest } from '../../../types/photo'
import { toCanvasPhoto } from './to-canvas-photo'

const manifest = (patch: Record<string, unknown> = {}) =>
  ({
    id: 'DSCF2851',
    aspectRatio: 1.5,
    thumbnailUrl: '/thumbnails/DSCF2851.jpg',
    thumbHash: '5e08060d',
    dateTaken: '2025-05-10T08:00:00.000Z',
    tags: ['flower'],
    exif: { Make: ' FUJIFILM ', Model: 'X-T5 ' },
    location: null,
    ...patch,
  }) as unknown as PhotoManifest

it('carries id, aspect ratio, thumbnail, date and tags across', () => {
  const photo = toCanvasPhoto(manifest())
  assert.equal(photo.id, 'DSCF2851')
  assert.equal(photo.aspectRatio, 1.5)
  assert.equal(photo.thumbnailUrl, '/thumbnails/DSCF2851.jpg')
  assert.equal(photo.dateTaken, '2025-05-10T08:00:00.000Z')
  assert.deepEqual(photo.tags, ['flower'])
})

it('names the camera the same way the camera filter does', () => {
  assert.equal(toCanvasPhoto(manifest()).camera, 'FUJIFILM X-T5')
})

it('has no camera when make or model is missing', () => {
  assert.equal(toCanvasPhoto(manifest({ exif: { Model: 'X-T5' } })).camera, null)
  assert.equal(toCanvasPhoto(manifest({ exif: null })).camera, null)
})

it('uses the city as the place and falls back to the country', () => {
  const tokyo = { latitude: 0, longitude: 0, city: 'Tokyo', country: 'Japan' }
  assert.equal(toCanvasPhoto(manifest({ location: tokyo })).place, 'Tokyo')
  assert.equal(toCanvasPhoto(manifest({ location: { ...tokyo, city: undefined } })).place, 'Japan')
  assert.equal(toCanvasPhoto(manifest({ location: null })).place, null)
})

it('decodes the hex thumbhash into bytes', () => {
  assert.deepEqual([...toCanvasPhoto(manifest()).thumbHash!], [0x5E, 0x08, 0x06, 0x0D])
})

it('has no thumbhash when the manifest has none', () => {
  assert.equal(toCanvasPhoto(manifest({ thumbHash: null })).thumbHash, null)
})
