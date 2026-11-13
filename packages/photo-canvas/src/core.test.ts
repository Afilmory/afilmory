import assert from 'node:assert/strict'

import { it } from 'vitest'

import { CanvasCore } from './core'
import type { CanvasPhoto } from './types'

const RATIOS = [0.667, 1.5, 1.333, 0.75]
const makePhotos = (count: number, prefix = 'p'): CanvasPhoto[] => {
  const photos: CanvasPhoto[] = []
  for (let index = 0; index < count; index++) {
    const month = String((index % 3) + 1).padStart(2, '0')
    photos.push({
      id: `${prefix}${index}`,
      aspectRatio: RATIOS[index % RATIOS.length],
      thumbnailUrl: `/thumbnails/${prefix}${index}.jpg`,
      thumbHash: null,
      dateTaken: `2025-${month}-10T00:00:00Z`,
      camera: null,
      tags: [],
      place: null,
    })
  }
  return photos
}

const viewport = { width: 1280, height: 800 }
const makeCore = (reducedMotion = false) => new CanvasCore({ viewport, dpr: 2, reducedMotion })
const settle = (core: CanvasCore, ms = 1200) => {
  for (let elapsed = 0; elapsed < ms; elapsed += 16) {
    core.tick(16)
  }
}

const coversViewport = (core: CanvasCore) => {
  const { camera, instances } = core.frame()
  for (const point of [
    { x: 5, y: 5 },
    { x: 1275, y: 5 },
    { x: 5, y: 795 },
    { x: 1275, y: 795 },
    { x: 640, y: 400 },
  ]) {
    const wx = camera.x + (point.x - 640) / camera.scale
    const wy = camera.y + (point.y - 400) / camera.scale
    const near = instances.some(i => wx >= i.x - 14 && wx <= i.x + i.w + 14 && wy >= i.y - 14 && wy <= i.y + i.h + 14)
    assert.ok(near, `nothing drawn near screen point ${point.x},${point.y}`)
  }
}

it('the wall still covers the viewport after panning a million pixels each way', () => {
  for (const [dx, dy] of [
    [1e6, 0],
    [-1e6, 0],
    [0, 1e6],
    [0, -1e6],
  ]) {
    const core = makeCore()
    core.setPhotos(makePhotos(18))
    core.panBy(dx, dy)
    coversViewport(core)
  }
})

it('dragging right moves the content right, so the camera moves left', () => {
  const core = makeCore()
  core.setPhotos(makePhotos(18))
  const before = core.frame().camera.x
  core.panBy(100, 0)
  assert.equal(core.frame().camera.x, before - 100)
})

it('the wall cannot zoom out past 20%', () => {
  const core = makeCore()
  core.setPhotos(makePhotos(18))
  core.zoomAt({ x: 640, y: 400 }, 0.01)
  assert.equal(core.frame().camera.scale, 0.2)
  assert.equal(core.zoomLimits().min, 0.2)
})

it('a grouped arrangement opens fitted to all islands', () => {
  const core = makeCore(true)
  core.setPhotos(makePhotos(300))
  core.setArrangement('month')
  settle(core)
  const { camera, bounds, islands } = core.frame()
  assert.equal(islands.length, 3)
  assert.ok(bounds)
  assert.ok(Math.abs(camera.x - (bounds.x + bounds.w / 2)) < 1e-6)
  assert.ok(bounds.w * camera.scale <= 1280 && bounds.h * camera.scale <= 800)
})

it('a grouped arrangement can zoom out only 15% past the fitted view', () => {
  const core = makeCore(true)
  core.setPhotos(makePhotos(300))
  core.setArrangement('month')
  settle(core)
  const fitted = core.frame().camera.scale
  core.zoomAt({ x: 640, y: 400 }, 0.001)
  assert.ok(Math.abs(core.frame().camera.scale - fitted * 0.85) < 1e-9)
})

it('panning a grouped arrangement stops at its bounds', () => {
  const core = makeCore(true)
  core.setPhotos(makePhotos(300))
  core.setArrangement('month')
  settle(core)
  core.panBy(-1e7, -1e7)
  const { camera, bounds } = core.frame()
  assert.equal(camera.x, bounds!.x + bounds!.w)
  assert.equal(camera.y, bounds!.y + bounds!.h)
})

it('hitTest returns the photo under the pointer and nothing in a gap', () => {
  const core = makeCore()
  core.setPhotos(makePhotos(18))
  const { camera, instances } = core.frame()
  const target = instances.find(
    i => i.x > camera.x - 400 && i.x < camera.x && i.y > camera.y - 200 && i.y < camera.y,
  )!
  const sx = (target.x + target.w / 2 - camera.x) * camera.scale + 640
  const sy = (target.y + target.h / 2 - camera.y) * camera.scale + 400
  assert.equal(core.hitTest({ x: sx, y: sy })?.id, target.id)
  const gapX = (target.x + target.w + 7 - camera.x) * camera.scale + 640
  assert.equal(core.hitTest({ x: gapX, y: sy }), null)
})

it('screenRectOf gives the on-screen rectangle of a visible photo', () => {
  const core = makeCore()
  core.setPhotos(makePhotos(18))
  const { camera, instances } = core.frame()
  const visible = instances.find(
    i => i.x > camera.x - 400 && i.x < camera.x && i.y > camera.y - 200 && i.y < camera.y,
  )!
  const rect = core.screenRectOf(visible.id)
  assert.ok(rect)
  assert.equal(rect.w, 248)
  assert.ok(rect.x < 1280 && rect.x + rect.w > 0 && rect.y < 800 && rect.y + rect.h > 0)
})

it('screenRectOf is null for a photo that is off screen', () => {
  const core = makeCore(true)
  core.setPhotos(makePhotos(300))
  core.setArrangement('month')
  settle(core)
  core.zoomAt({ x: 640, y: 400 }, 1000)
  core.panBy(1e7, 1e7)
  const { instances } = core.frame()
  const far = instances.at(-1)!
  assert.equal(core.screenRectOf(far.id), null)
})

it('switching arrangement starts from the old positions and lands on the new layout', () => {
  const core = makeCore()
  core.setPhotos(makePhotos(18))
  const before = core.frame()
  const sample = before.instances.find(i => core.screenRectOf(i.id))!
  core.setArrangement('month')
  const first = core.frame()
  assert.equal(first.transitioning, true)
  const moving = first.instances.find(i => i.id === sample.id && i.alpha === 1)!
  assert.ok(Math.abs(moving.w - 248) < 1e-6, 'photo starts at its wall size')
  assert.equal(core.tick(16), true)
  settle(core)
  const done = core.frame()
  assert.equal(done.transitioning, false)
  assert.equal(done.instances.length, 18)
  assert.ok(done.instances.every(i => i.alpha === 1 && i.w === 220))
  assert.equal(core.tick(16), false)
})

it('with reduced motion photos fade in at their new positions without flying', () => {
  const core = makeCore(true)
  core.setPhotos(makePhotos(18))
  core.setArrangement('month')
  const first = core.frame()
  assert.ok(first.instances.length > 0)
  assert.ok(first.instances.every(i => i.w === 220 && i.alpha < 1))
  settle(core)
  assert.ok(core.frame().instances.every(i => i.alpha === 1))
})

it('releasing a drag keeps the wall gliding and then it stops', () => {
  const core = makeCore()
  core.setPhotos(makePhotos(18))
  const start = core.frame().camera.x
  core.release(2, 0)
  assert.equal(core.tick(16), true)
  const afterOne = core.frame().camera.x
  assert.ok(afterOne < start)
  settle(core, 4000)
  assert.equal(core.tick(16), false)
  assert.ok(core.frame().camera.x < afterOne)
})

it('with reduced motion releasing a drag does not glide', () => {
  const core = makeCore(true)
  core.setPhotos(makePhotos(18))
  core.release(2, 0)
  assert.equal(core.tick(16), false)
})

it('a new photo list keeps the arrangement and transitions to it', () => {
  const core = makeCore()
  core.setPhotos(makePhotos(300))
  core.setArrangement('month')
  settle(core)
  core.setPhotos(makePhotos(300).filter((_, index) => index % 3 === 0))
  assert.equal(core.frame().transitioning, true)
  settle(core)
  const frame = core.frame()
  assert.equal(frame.arrangement, 'month')
  assert.equal(frame.islands.length, 1)
  assert.equal(frame.instances.length, 100)
})

it('flyToIsland ends with that island filling the view', () => {
  const core = makeCore()
  core.setPhotos(makePhotos(300))
  core.setArrangement('month')
  settle(core)
  const island = core.frame().islands[1]
  core.flyToIsland(island.key)
  settle(core)
  const { camera } = core.frame()
  assert.ok(Math.abs(camera.x - (island.rect.x + island.rect.w / 2)) < 1)
  assert.ok(Math.abs(camera.y - (island.rect.y + island.rect.h / 2)) < 1)
})

it('reports fast movement so thumbnail requests can wait', () => {
  const core = makeCore()
  core.setPhotos(makePhotos(18))
  assert.equal(core.frame().moving, false)
  core.release(5, 0)
  core.tick(16)
  assert.equal(core.frame().moving, true)
})

it('lists only arrangements the photos have data for', () => {
  const core = makeCore()
  core.setPhotos(makePhotos(18))
  assert.deepEqual(core.arrangements(), ['wall', 'month'])
})

it('an empty photo list draws nothing', () => {
  const core = makeCore()
  core.setPhotos([])
  assert.deepEqual(core.frame().instances, [])
  assert.equal(core.hitTest({ x: 10, y: 10 }), null)
})

it('receiving the same photo list again mid-flight does not restart the flight off screen', () => {
  const core = makeCore()
  core.setPhotos(makePhotos(18))
  core.panBy(-4200, 3100)
  core.release(0, 0)
  settle(core, 200)
  core.setArrangement('month')
  core.tick(16)
  core.setPhotos(makePhotos(18))
  for (let elapsed = 0; elapsed < 400; elapsed += 16) {
    core.tick(16)
    const { camera, instances } = core.frame()
    const halfWidth = viewport.width / 2 / camera.scale
    const halfHeight = viewport.height / 2 / camera.scale
    const visible = instances.filter(
      i =>
        i.alpha > 0.5
        && i.x < camera.x + halfWidth
        && i.x + i.w > camera.x - halfWidth
        && i.y < camera.y + halfHeight
        && i.y + i.h > camera.y - halfHeight,
    )
    assert.ok(visible.length >= 6, `only ${visible.length} photos in view ${elapsed}ms into the flight`)
  }
})

it('screenRectOf picks the copy of a repeated photo nearest to the given point', () => {
  const core = makeCore()
  core.setPhotos(makePhotos(18))
  core.zoomAt({ x: 640, y: 400 }, 0.01)
  settle(core)
  const { instances } = core.frame()
  const copies = instances
    .filter(i => i.id === 'p3')
    .map(i => core.screenRectOfInstance(i))
    .filter(r => r.x > 0 && r.y > 0 && r.x + r.w < 1280 && r.y + r.h < 800)
  assert.ok(copies.length >= 2, 'the photo repeats on screen')
  for (const copy of copies) {
    assert.deepEqual(core.screenRectOf('p3', { x: copy.x + copy.w / 2, y: copy.y + copy.h / 2 }), copy)
  }
})

it('panning and zooming a grouped arrangement moves the camera without changing the instance list', () => {
  const core = makeCore()
  core.setPhotos(makePhotos(300))
  core.setArrangement('month')
  settle(core)
  const before = core.frame()
  core.zoomAt({ x: 640, y: 400 }, 3)
  settle(core)
  core.panBy(-40, 25)
  const after = core.frame()
  assert.equal(after.version, before.version)
  assert.equal(after.instances, before.instances)
  assert.notEqual(after.cameraVersion, before.cameraVersion)
  assert.notDeepEqual(after.camera, before.camera)
})
