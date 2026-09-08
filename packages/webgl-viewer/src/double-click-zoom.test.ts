/// <reference types="node" />
import assert from 'node:assert/strict'

import { it } from 'vitest'

import {
  computeFillScale,
  computeFitScale,
  resolveDoubleClickZoomStages,
  resolveNextDoubleClickScale,
} from './double-click-zoom'

const VIEWPORT = { canvasWidth: 393, canvasHeight: 852 }

function stagesFor(imageWidth: number, imageHeight: number) {
  const input = { ...VIEWPORT, imageWidth, imageHeight }
  return resolveDoubleClickZoomStages({
    fitScale: computeFitScale(input),
    fillScale: computeFillScale(input),
    originalScale: 1,
  })
}

it('cycles fit -> fill -> 100% -> fit when the photo is larger than the viewport', () => {
  const stages = stagesFor(6000, 4000)
  const [fit, fill, original] = stages

  assert.equal(stages.length, 3)
  assert.equal(fit, 393 / 6000)
  assert.equal(fill, 852 / 4000)
  assert.equal(original, 1)

  assert.equal(resolveNextDoubleClickScale(fit, stages), fill)
  assert.equal(resolveNextDoubleClickScale(fill, stages), original)
  assert.equal(resolveNextDoubleClickScale(original, stages), fit)
})

it('skips the fill stage and goes straight to 100% when the photo is smaller than the viewport', () => {
  const stages = stagesFor(300, 200)

  assert.deepEqual(stages, [393 / 300, 1])
  assert.equal(resolveNextDoubleClickScale(stages[0], stages), 1)
  assert.equal(resolveNextDoubleClickScale(1, stages), stages[0])
})

it('drops the fill stage when it would upscale beyond 100%, as with a panorama', () => {
  const stages = stagesFor(8000, 500)

  assert.deepEqual(stages, [393 / 8000, 1])
})

it('keeps only fit and 100% when the photo aspect ratio matches the viewport', () => {
  const stages = stagesFor(1179, 2556)

  assert.deepEqual(stages, [393 / 1179, 1])
})

it('collapses to a single stage when the photo is exactly viewport-sized', () => {
  const stages = stagesFor(393, 852)

  assert.deepEqual(stages, [1])
  assert.equal(resolveNextDoubleClickScale(1, stages), 1)
})

it('after free zooming, advances to the next larger stage or back to fit', () => {
  const stages = stagesFor(6000, 4000)
  const [fit, fill] = stages

  assert.equal(resolveNextDoubleClickScale(fill / 2, stages), fill)
  assert.equal(resolveNextDoubleClickScale(fit / 2, stages), fit)
  assert.equal(resolveNextDoubleClickScale(2, stages), fit)
})
