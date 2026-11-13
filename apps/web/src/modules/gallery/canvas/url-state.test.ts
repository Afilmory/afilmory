import assert from 'node:assert/strict'

import { it } from 'vitest'

import { parseCanvasUrl, resolveViewMode, writeCanvasUrl } from './url-state'

it('reads the canvas view and its arrangement from the query', () => {
  assert.deepEqual(parseCanvasUrl(new URLSearchParams('view=canvas&arrange=month')), {
    view: 'canvas',
    arrange: 'month',
  })
})

it('a canvas link without an arrangement opens the wall', () => {
  assert.deepEqual(parseCanvasUrl(new URLSearchParams('view=canvas')), { view: 'canvas', arrange: 'wall' })
})

it('an unknown arrangement falls back to the wall', () => {
  assert.equal(parseCanvasUrl(new URLSearchParams('view=canvas&arrange=galaxy')).arrange, 'wall')
})

it('any other view value is not the canvas', () => {
  assert.equal(parseCanvasUrl(new URLSearchParams('view=list')).view, null)
  assert.equal(parseCanvasUrl(new URLSearchParams('')).view, null)
})

it('writing the canvas view keeps unrelated params', () => {
  const next = writeCanvasUrl(new URLSearchParams('tags=bird'), { view: 'canvas', arrange: 'camera' })
  assert.equal(next.toString(), 'tags=bird&view=canvas&arrange=camera')
})

it('the wall arrangement is left out of the query', () => {
  const next = writeCanvasUrl(new URLSearchParams('view=canvas&arrange=tag'), { view: 'canvas', arrange: 'wall' })
  assert.equal(next.toString(), 'view=canvas')
})

it('leaving the canvas removes both params and keeps the rest', () => {
  const next = writeCanvasUrl(new URLSearchParams('view=canvas&arrange=tag&tags=bird'), { view: null, arrange: 'tag' })
  assert.equal(next.toString(), 'tags=bird')
})

it('writing does not mutate the params it was given', () => {
  const original = new URLSearchParams('tags=bird')
  writeCanvasUrl(original, { view: 'canvas', arrange: 'month' })
  assert.equal(original.toString(), 'tags=bird')
})

it('canvas falls back to masonry on a small screen or without WebGL2', () => {
  assert.equal(resolveViewMode({ requested: 'canvas', supported: true, isLargeScreen: true }), 'canvas')
  assert.equal(resolveViewMode({ requested: 'canvas', supported: false, isLargeScreen: true }), 'masonry')
  assert.equal(resolveViewMode({ requested: 'canvas', supported: true, isLargeScreen: false }), 'masonry')
})

it('other view modes are never changed', () => {
  assert.equal(resolveViewMode({ requested: 'list', supported: false, isLargeScreen: false }), 'list')
  assert.equal(resolveViewMode({ requested: 'masonry', supported: true, isLargeScreen: true }), 'masonry')
})
