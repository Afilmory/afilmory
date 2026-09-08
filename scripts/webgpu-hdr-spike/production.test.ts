import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// eslint-disable-next-line test/no-import-node-test -- Runs with the standalone Node test command.
import { it } from 'node:test'

import { extractJPEGGainMap, parseISOGainMap, parseXMPGainMap } from '../../packages/webgl-viewer/src/jpeg-gainmap'
import { getVisibleTileRequests, TILE_GUTTER } from '../../packages/webgl-viewer/src/webgpu-tiles'

const xmp = (fields: string) =>
  `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/" ${fields}/></rdf:RDF></x:xmpmeta>`
it('parses XMP gain reconstruction parameters accept scalars and reject invalid gamma/headroom', () => {
  const metadata = parseXMPGainMap(xmp('hdrgm:GainMapMax="2.32193" hdrgm:HDRCapacityMax="2.32193"'))!
  assert.ok(Math.abs(2 ** metadata.max[0] - 5) < 0.001)
  assert.deepEqual(metadata.gamma, [1, 1, 1])
  assert.throws(() => parseXMPGainMap(xmp('hdrgm:GainMapMax="2" hdrgm:Gamma="0"')))
  assert.throws(() => parseXMPGainMap(xmp('hdrgm:GainMapMax="2" hdrgm:HDRCapacityMax="NaN"')))
  assert.equal(parseXMPGainMap('<description/>'), null)
  const rgb = parseXMPGainMap(
    xmp('').replace(
      '/></rdf:RDF>',
      '><hdrgm:GainMapMax><rdf:Seq><rdf:li>1</rdf:li><rdf:li>2</rdf:li><rdf:li>3</rdf:li></rdf:Seq></hdrgm:GainMapMax></rdf:Description></rdf:RDF>',
    ),
  )!
  assert.deepEqual(rgb.max, [1, 2, 3])
})
it('parses ISO common-denominator metadata and truncated/zero denominators', () => {
  const bytes = new Uint8Array(37)
  const view = new DataView(bytes.buffer)
  bytes[4] = 64 | 8
  ;[100, 0, 200, 0, 200, 100, 0, 0].forEach((n, i) => view.setUint32(5 + i * 4, n))
  assert.deepEqual(parseISOGainMap(bytes).max, [2, 2, 2])
  assert.throws(() => parseISOGainMap(bytes.slice(0, 12)))
  view.setUint32(5, 0)
  assert.throws(() => parseISOGainMap(bytes), /denominator/)
})
it('actual Xiaomi HDR JPEG splits into independently bounded JPEG planes', async () => {
  const file = readFileSync(new URL('../../photos/IMG_20251111_002156.jpg', import.meta.url))
  const extracted = extractJPEGGainMap(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))!
  assert.ok(extracted)
  assert.ok(extracted.base.size > extracted.gain.size)
  assert.ok(Math.abs(2 ** extracted.metadata.max[0] - 5) < 0.001)
  for (const plane of [extracted.base, extracted.gain]) {
    const bytes = new Uint8Array(await plane.arrayBuffer())
    assert.deepEqual([...bytes.slice(0, 2)], [255, 216])
    assert.deepEqual([...bytes.slice(-2)], [255, 217])
    assert.equal(extractJPEGGainMap(bytes.buffer), null)
  }
  assert.throws(() => extractJPEGGainMap(file.buffer.slice(file.byteOffset, file.byteOffset + 30)))
})
it('visible LOD covers a panned 201MP photo and coarsens to fit its byte budget', () => {
  const viewport = {
    imageWidth: 12288,
    imageHeight: 16384,
    containerWidth: 1200,
    containerHeight: 928,
    scale: 0.5,
    translateX: 311,
    translateY: -217,
    relativeScale: 8.8,
    fitToScreenScale: 928 / 16384,
  }
  const requests = getVisibleTileRequests(viewport, 2, 3, 128 * 1024 ** 2, 8)
  assert.ok(requests.length > 0)
  assert.equal(requests[0].level, 0)
  const left = (1200 - 12288 * viewport.scale) / 2 + viewport.translateX
  const top = (928 - 16384 * viewport.scale) / 2 + viewport.translateY
  for (let sy = 0; sy < 928; sy += 79) {
    for (let sx = 0; sx < 1200; sx += 89) {
      const x = (sx - left) / viewport.scale
      const y = (sy - top) / viewport.scale
      assert.ok(requests.some(({ rect: [tx, ty, w, h] }) => x >= tx && x < tx + w && y >= ty && y < ty + h))
    }
  }
  const budget = 20 * 1024 ** 2
  const coarse = getVisibleTileRequests(viewport, 2, 3, budget, 8)
  assert.ok(coarse.length > 0 && coarse[0].level > 0)
  const bytes = coarse.reduce(
    (sum, t) =>
      sum +
      (Math.ceil(t.rect[2] / 2 ** t.level) + TILE_GUTTER * 2) *
        (Math.ceil(t.rect[3] / 2 ** t.level) + TILE_GUTTER * 2) *
        8,
    0,
  )
  assert.ok(bytes <= budget)
  assert.deepEqual(getVisibleTileRequests({ ...viewport, scale: 0 }, 2, 3, budget, 8), [])
  assert.deepEqual(getVisibleTileRequests({ ...viewport, translateX: 1e9 }, 2, 3, budget, 8), [])
})
