/// <reference types="node" />
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'

import { it } from 'vitest'

import { boxes, one, Reader } from './avif-bmff'
import { extractAVIFGainMap, inspectAVIFGainMap } from './avif-gainmap'
import { gainMapColorTransforms } from './avif-gainmap-color'
import { extractJPEGGainMap, multiplyMatrices } from './jpeg-gainmap'

const fixture = (name = 'gainmap-12') =>
  new Uint8Array(readFileSync(new URL(`./fixtures/${name}.avif`, import.meta.url)))
const buffer = (data: Uint8Array) => data.slice().buffer
const mutate = (type: string, offset: number, value: number) => {
  const data = fixture()
  const index = Buffer.from(data).indexOf(type)
  assert.ok(index >= 0)
  data[index + 4 + offset] = value
  return buffer(data)
}

function mutateMetadata(offset: number, value: number) {
  const data = fixture()
  const meta = boxes(one(boxes(data), 'meta').data.subarray(4))
  const reader = new Reader(one(meta, 'iloc').data)
  // Generated fixtures use iloc v0, 32-bit offsets/lengths, no base offset.
  assert.equal(reader.uint(4), 0)
  assert.equal(reader.uint(2), 0x4400)
  const count = reader.uint(2)
  for (let i = 0; i < count; i++) {
    const id = reader.uint(2)
    assert.equal(reader.uint(2), 0)
    assert.equal(reader.uint(2), 1)
    const start = reader.uint(4)
    reader.uint(4)
    if (id === 2) {
      data[start + offset] = value
      return buffer(data)
    }
  }
  throw new Error('Missing fixture tmap item')
}

for (const primary of [1, 12, 9]) {
  it(`extracts a real synthetic CICP ${primary} gain map without transcoding`, async () => {
    const original = fixture(`gainmap-${primary}`)
    const result = extractAVIFGainMap(buffer(original))
    assert.ok(result)
    const reference = JSON.parse(readFileSync(new URL('./fixtures/metadata-reference.json', import.meta.url), 'utf8'))
    assert.deepEqual(result.metadata, reference[primary])
    assert.ok(result.metadata.capacityMax > result.metadata.capacityMin)
    assert.equal(result.orientation, 1)
    for (const plane of [result.base, result.gain]) {
      const bytes = Buffer.from(await plane.arrayBuffer())
      assert.equal(extractAVIFGainMap(buffer(bytes)), null)
      const start = bytes.indexOf('mdat') + 4
      assert.ok(start > 4)
      assert.ok(Buffer.from(original).includes(bytes.subarray(start)))
    }
  })
  it(`round trips the CICP ${primary} linear color transform`, () => {
    const transforms = gainMapColorTransforms(primary)!
    const result = multiplyMatrices(transforms.toDisplayP3, transforms.toGainSpace)
    result.forEach((value, index) => assert.ok(Math.abs(value - (index % 4 === 0 ? 1 : 0)) < 1e-6))
  })
}

it('does not mistake ordinary AVIF or HEIF for an HDR gain map', () => {
  assert.equal(inspectAVIFGainMap(buffer(fixture('sdr'))).status, 'none')
  const other = fixture()
  for (let i = 0; i < other.length - 4; i++) {
    if (Buffer.from(other.subarray(i, i + 4)).toString() === 'avif') {
      other.set(new TextEncoder().encode('heic'), i)
    }
  }
  assert.equal(inspectAVIFGainMap(buffer(other)).status, 'none')
})

it('distinguishes unsupported features from invalid containers', () => {
  assert.equal(inspectAVIFGainMap(mutate('infe', 0, 1)).status, 'unsupported')
  assert.equal(inspectAVIFGainMap(mutate('ftyp', 0, 0)).status, 'supported') // compatible avif brand remains
  assert.equal(inspectAVIFGainMap(mutate('ispe', 4, 255)).status, 'unsupported')
  const damaged = fixture()
  damaged.set([255, 255, 255, 255], 0)
  assert.equal(inspectAVIFGainMap(buffer(damaged)).status, 'invalid')
})

it('rejects every truncated prefix without returning partial gain-map data', () => {
  const data = fixture()
  for (let size = 0; size < data.length; size++) {
    assert.notEqual(inspectAVIFGainMap(buffer(data.subarray(0, size))).status, 'supported')
  }
})

it('rejects unsupported metadata versions, reserved flags, and zero denominators', () => {
  assert.equal(inspectAVIFGainMap(mutateMetadata(0, 1)).status, 'unsupported')
  assert.equal(inspectAVIFGainMap(mutateMetadata(2, 1)).status, 'unsupported')
  assert.equal(inspectAVIFGainMap(mutateMetadata(5, 1)).status, 'invalid')
  assert.equal(inspectAVIFGainMap(mutateMetadata(13, 0)).status, 'invalid')
  assert.equal(inspectAVIFGainMap(mutateMetadata(6, 1)).status, 'unsupported') // base headroom above alternate
  assert.equal(inspectAVIFGainMap(mutate('pitm', 5, 2)).status, 'unsupported')
})

it('preserves positive SDR base headroom below the HDR alternate', () => {
  const result = extractAVIFGainMap(mutateMetadata(9, 1))
  assert.ok(result)
  assert.equal(result.metadata.capacityMin, 1)
  assert.ok(result.metadata.capacityMax > result.metadata.capacityMin)
})

it('selects base primaries when requested rather than assuming the alternate color space', () => {
  const image = extractAVIFGainMap(mutateMetadata(5, 64))
  assert.ok(image)
  assert.equal(image.metadata.useBaseColorSpace, true)
  const expected = gainMapColorTransforms(12)!
  assert.deepEqual(image.toGainSpace, expected.toGainSpace)
  assert.deepEqual(image.toDisplayP3, expected.toDisplayP3)
})

it('keeps the JPEG decoder isolated from AVIF and retains ordinary JPEG behavior', () => {
  assert.equal(extractJPEGGainMap(buffer(fixture())), null)
  assert.equal(extractJPEGGainMap(new Uint8Array([255, 216, 255, 217]).buffer), null)
  const jpeg = new Uint8Array(readFileSync(new URL('./fixtures/gainmap.jpg', import.meta.url)))
  const result = extractJPEGGainMap(buffer(jpeg))
  assert.ok(result)
  assert.deepEqual(result.metadata.max, [2, 2, 2])
  assert.deepEqual(result.metadata.gamma, [1, 1, 1])
  assert.equal(result.metadata.capacityMax, 2)
})

for (const [depth, flags] of [
  [8, 0x0D],
  [10, 0x4D],
  [12, 0x6D],
]) {
  it(`rejects explicitly sited ${depth}-bit gain chroma instead of assuming centered samples`, () => {
    // Configuration-only mutation tests the parser boundary; actual samples
    // are independently encoded and decoded by the browser corpus.
    const data = fixture('gainmap-color-12')
    const index = Buffer.from(data).lastIndexOf('av1C')
    assert.ok(index >= 0)
    data[index + 5] = ((depth === 12 ? 2 : 0) << 5) | (data[index + 5] & 31)
    data[index + 6] = flags
    const result = inspectAVIFGainMap(buffer(data))
    assert.equal(result.status, 'unsupported')
    if (result.status === 'unsupported') {
      assert.match(result.reason, /sited gain-map/)
    }
  })
}
