import assert from 'node:assert/strict'

import { it } from 'vitest'

import type { CanvasPhoto } from '../types'
import {
  FILM_FRAME,
  FILM_SCALE,
  FILM_START_SCALE,
  filmFrameRect,
  filmOffsetBounds,
  filmOrder,
  filmPhotoRect,
  filmProgress,
} from './film'

const viewport = { width: 1280, height: 800 }
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`)

const photo = (id: string, dateTaken: string): CanvasPhoto => ({
  id,
  aspectRatio: 1.5,
  thumbnailUrl: `/${id}.jpg`,
  thumbHash: null,
  dateTaken,
  camera: null,
  tags: [],
  place: null,
})

it('the wall is untouched at and above the start scale and fully rolled up at the film scale', () => {
  assert.equal(filmProgress(1), 0)
  assert.equal(filmProgress(FILM_START_SCALE), 0)
  assert.equal(filmProgress(FILM_SCALE), 1)
  assert.equal(filmProgress(FILM_SCALE / 2), 1)
})

it('rolling up advances steadily as the camera zooms out', () => {
  let previous = 0
  for (let scale = FILM_START_SCALE * 0.99; scale > FILM_SCALE; scale *= 0.99) {
    const progress = filmProgress(scale)
    assert.ok(progress > previous)
    previous = progress
  }
  near(filmProgress(Math.sqrt(FILM_START_SCALE * FILM_SCALE)), 0.5)
})

it('frames run oldest to newest, keeping the given order for photos taken at the same time', () => {
  const photos = [
    photo('c', '2025-05-10T10:00:00Z'),
    photo('a', '2024-01-12T08:00:00Z'),
    photo('d', '2026-07-25T00:00:00Z'),
    photo('b', '2025-05-10T10:00:00Z'),
  ]
  assert.deepEqual(filmOrder(photos), [1, 0, 3, 2])
})

it('the focus frame sits in the middle of the viewport and its neighbours one frame apart', () => {
  const focus = filmFrameRect(4, 4, 0, viewport)
  near(focus.x + focus.w / 2, viewport.width / 2)
  near(focus.y + focus.h / 2, viewport.height / 2)
  assert.equal(focus.w, FILM_FRAME.width)
  assert.equal(focus.h, FILM_FRAME.height)
  const next = filmFrameRect(5, 4, 0, viewport)
  near(next.x - focus.x, FILM_FRAME.width + FILM_FRAME.gap)
  near(filmFrameRect(4, 4, 120, viewport).x - focus.x, 120)
})

it('a photo sits inside its frame without cropping', () => {
  const frame = { x: 100, y: 50, w: 300, h: 200 }
  assert.deepEqual(filmPhotoRect(2, frame), { x: 100, y: 75, w: 300, h: 150 })
  assert.deepEqual(filmPhotoRect(0.5, frame), { x: 200, y: 50, w: 100, h: 200 })
})

it('scrolling the strip stops once the first or last frame reaches the middle', () => {
  const step = FILM_FRAME.width + FILM_FRAME.gap
  const { min, max } = filmOffsetBounds(10, 3)
  assert.equal(max, 3 * step)
  assert.equal(min, -6 * step)
  near(filmFrameRect(0, 3, max, viewport).x + FILM_FRAME.width / 2, viewport.width / 2)
  near(filmFrameRect(9, 3, min, viewport).x + FILM_FRAME.width / 2, viewport.width / 2)
})
