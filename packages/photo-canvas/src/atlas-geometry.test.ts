import assert from 'node:assert/strict'

import { it } from 'vitest'

import { atlasCell, atlasGeometry } from './atlas-geometry'

it('a small gallery gets a small single-page atlas', () => {
  assert.deepEqual(atlasGeometry(18), { size: 256, cellSize: 32, perRow: 8, perPage: 64, pages: 1 })
})

it('an empty gallery still gets one page', () => {
  assert.equal(atlasGeometry(0).pages, 1)
})

it('ten thousand photos fit one 4096 page', () => {
  const geometry = atlasGeometry(10_000)
  assert.equal(geometry.size, 4096)
  assert.equal(geometry.pages, 1)
})

it('more photos than one maximum page holds spill onto more pages', () => {
  const geometry = atlasGeometry(40_000)
  assert.equal(geometry.size, 4096)
  assert.equal(geometry.perPage, 16_384)
  assert.equal(geometry.pages, 3)
})

it('cells fill rows left to right and never overlap', () => {
  const geometry = atlasGeometry(18)
  assert.deepEqual(atlasCell(0, geometry), { x: 0, y: 0, layer: 0 })
  assert.deepEqual(atlasCell(7, geometry), { x: 224, y: 0, layer: 0 })
  assert.deepEqual(atlasCell(8, geometry), { x: 0, y: 32, layer: 0 })
  const seen = new Set<string>()
  for (let index = 0; index < 64; index++) {
    const cell = atlasCell(index, geometry)
    seen.add(`${cell.x},${cell.y},${cell.layer}`)
  }
  assert.equal(seen.size, 64)
})

it('the first cell past a full page starts the next layer', () => {
  const geometry = atlasGeometry(40_000)
  assert.deepEqual(atlasCell(16_384, geometry), { x: 0, y: 0, layer: 1 })
})
