import type { CameraState, ScaleLimits } from './camera'
import {
  clampToBounds,
  decayVelocity,
  fitRect,
  screenToWorld,
  springToward,
  visibleWorldRect,
  worldRectToScreen,
  zoomAt,
} from './camera'
import type { GroupedLayout, Island } from './layouts/grouped'
import { createGroupedLayout } from './layouts/grouped'
import { availableArrangements, groupPhotos } from './layouts/grouping'
import type { WallLayout } from './layouts/wall'
import { createWallLayout, wallInstances } from './layouts/wall'
import { maxScale } from './textures/tiers'
import type { TransitionPlan } from './transition'
import { interpolateRect, planTransition } from './transition'
import type { Arrangement, CanvasPhoto, Instance, Point, Rect, Size } from './types'

export const WALL_COLUMN_WIDTH = 248
export const WALL_GAP = 14
export const ISLAND_COLUMN_WIDTH = 220
export const ISLAND_GAP = 12
export const ISLAND_SPACING = 260
export const ISLAND_LABEL_HEIGHT = 56

const WALL_MIN_SCALE = 0.2
const GROUPED_ZOOM_OUT_ALLOWANCE = 0.85
const TRANSITION_MS = 400
const FADE_MS = 200
const FIT_PADDING = 96
const VISIBLE_MARGIN = 240
const ZOOM_STEP = 1.3
const WALL_TOP_INSET = 64
const REFERENCE_VIEWPORT: Size = { width: 1920, height: 1200 }
const STOP_SPEED = 0.01
const FAST_SPEED = 1.5

export interface DrawInstance extends Instance {
  id: string
  alpha: number
}

export interface FrameState {
  camera: CameraState
  viewport: Size
  dpr: number
  instances: DrawInstance[]
  version: number
  cameraVersion: number
  islands: Island[]
  bounds: Rect | null
  arrangement: Arrangement
  moving: boolean
  transitioning: boolean
  limits: ScaleLimits
}

export interface CanvasCoreOptions {
  viewport: Size
  dpr: number
  reducedMotion: boolean
}

interface ActiveTransition {
  plan: TransitionPlan
  fromIds: string[]
  fromCamera: CameraState
  toCamera: CameraState
  progress: number
  velocity: number
  elapsed: number
}

const mixCamera = (from: CameraState, to: CameraState, t: number): CameraState => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
  scale: from.scale * (to.scale / from.scale) ** t,
})

const sameLayoutInput = (a: CanvasPhoto[], b: CanvasPhoto[]) =>
  a.length === b.length
  && a.every((photo, index) => {
    const other = b[index]
    return (
      photo.id === other.id
      && photo.aspectRatio === other.aspectRatio
      && photo.dateTaken === other.dateTaken
      && photo.camera === other.camera
      && photo.place === other.place
      && photo.tags.length === other.tags.length
      && photo.tags.every((tag, tagIndex) => tag === other.tags[tagIndex])
    )
  })

export class CanvasCore {
  private viewport: Size
  private dpr: number
  private readonly reducedMotion: boolean
  private photos: CanvasPhoto[] = []
  private arrangement: Arrangement = 'wall'
  private camera: CameraState = { x: 0, y: 0, scale: 1 }
  private wall: WallLayout | null = null
  private grouped: GroupedLayout | null = null
  private groupedDraw: DrawInstance[] = []
  private limits: ScaleLimits = { min: WALL_MIN_SCALE, max: 2 }
  private velocity: Point = { x: 0, y: 0 }
  private flight: { target: CameraState, velocity: CameraState } | null = null
  private transition: ActiveTransition | null = null
  private current: DrawInstance[] = []
  private dirty = true
  private cameraVersion = 0
  private version = 0
  private pannedSinceTick = 0
  private speed = 0

  constructor(options: CanvasCoreOptions) {
    this.viewport = options.viewport
    this.dpr = options.dpr
    this.reducedMotion = options.reducedMotion
  }

  setPhotos(photos: CanvasPhoto[]) {
    if (sameLayoutInput(this.photos, photos)) {
      this.photos = photos
      return
    }
    const hadPhotos = this.photos.length > 0
    this.relayout(photos, this.arrangement, hadPhotos)
  }

  setArrangement(arrangement: Arrangement) {
    if (arrangement === this.arrangement) {
      return
    }
    this.relayout(this.photos, arrangement, this.photos.length > 0)
  }

  resize(viewport: Size, dpr: number) {
    this.viewport = viewport
    this.dpr = dpr
    this.limits = this.computeLimits()
    this.camera = this.constrain(this.camera)
    this.dirty = true
  }

  panBy(dxPx: number, dyPx: number) {
    this.flight = null
    this.velocity = { x: 0, y: 0 }
    this.camera = this.constrain({
      ...this.camera,
      x: this.camera.x - dxPx / this.camera.scale,
      y: this.camera.y - dyPx / this.camera.scale,
    })
    this.pannedSinceTick += Math.hypot(dxPx, dyPx)
    this.dirty = true
  }

  release(vxPxPerMs: number, vyPxPerMs: number) {
    if (this.reducedMotion) {
      return
    }
    this.velocity = { x: -vxPxPerMs / this.camera.scale, y: -vyPxPerMs / this.camera.scale }
  }

  zoomAt(point: Point, factor: number) {
    this.flight = null
    this.camera = this.constrain(zoomAt(this.camera, this.viewport, point, factor, this.limits))
    this.dirty = true
  }

  zoomStep(direction: 1 | -1) {
    const center = { x: this.viewport.width / 2, y: this.viewport.height / 2 }
    const factor = direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP
    this.flyTo(zoomAt(this.flight?.target ?? this.camera, this.viewport, center, factor, this.limits))
  }

  reset() {
    this.flyTo(this.homeCamera())
  }

  flyToIsland(key: string) {
    const island = this.grouped?.islands.find(candidate => candidate.key === key)
    if (!island) {
      return
    }
    const fitted = fitRect(island.rect, this.viewport, FIT_PADDING)
    this.flyTo({ ...fitted, scale: Math.min(Math.max(fitted.scale, this.limits.min), this.limits.max) })
  }

  flyToWorld(point: Point) {
    this.flyTo({ ...this.camera, x: point.x, y: point.y })
  }

  tick(dtMs: number): boolean {
    let active = false
    let travelled = this.pannedSinceTick
    this.pannedSinceTick = 0

    if (this.transition) {
      active = true
      this.advanceTransition(dtMs)
    }
    else if (this.flight) {
      active = true
      travelled += this.advanceFlight(dtMs)
    }
    else if (this.velocity.x !== 0 || this.velocity.y !== 0) {
      const before = this.camera
      this.camera = this.constrain({
        ...before,
        x: before.x + this.velocity.x * dtMs,
        y: before.y + this.velocity.y * dtMs,
      })
      travelled += Math.hypot(this.camera.x - before.x, this.camera.y - before.y) * before.scale
      this.velocity = { x: decayVelocity(this.velocity.x, dtMs), y: decayVelocity(this.velocity.y, dtMs) }
      if (Math.hypot(this.velocity.x, this.velocity.y) * this.camera.scale < STOP_SPEED) {
        this.velocity = { x: 0, y: 0 }
      }
      else {
        active = true
      }
      this.dirty = true
    }

    this.speed = dtMs > 0 ? travelled / dtMs : 0
    return active
  }

  frame(): FrameState {
    if (this.dirty) {
      const next = this.computeInstances()
      if (next !== this.current) {
        this.current = next
        this.version += 1
      }
      this.cameraVersion += 1
      this.dirty = false
    }
    return {
      camera: this.camera,
      viewport: this.viewport,
      dpr: this.dpr,
      instances: this.current,
      version: this.version,
      cameraVersion: this.cameraVersion,
      islands: this.grouped?.islands ?? [],
      bounds: this.grouped?.bounds ?? null,
      arrangement: this.arrangement,
      moving: this.transition !== null || this.speed > FAST_SPEED,
      transitioning: this.transition !== null,
      limits: this.limits,
    }
  }

  hitTest(point: Point): DrawInstance | null {
    if (this.transition) {
      return null
    }
    const world = screenToWorld(this.camera, this.viewport, point)
    const { instances } = this.frame()
    for (let i = instances.length - 1; i >= 0; i--) {
      const instance = instances[i]
      if (
        world.x >= instance.x
        && world.x <= instance.x + instance.w
        && world.y >= instance.y
        && world.y <= instance.y + instance.h
      ) {
        return instance
      }
    }
    return null
  }

  screenRectOfInstance(instance: Rect): Rect {
    return worldRectToScreen(this.camera, this.viewport, instance)
  }

  screenRectOf(photoId: string, near?: Point): Rect | null {
    const anchor = near ?? { x: this.viewport.width / 2, y: this.viewport.height / 2 }
    let best: Rect | null = null
    let bestDistance = Infinity
    for (const instance of this.frame().instances) {
      if (instance.id !== photoId) {
        continue
      }
      const rect = this.screenRectOfInstance(instance)
      const onScreen
        = rect.x < this.viewport.width && rect.x + rect.w > 0 && rect.y < this.viewport.height && rect.y + rect.h > 0
      if (!onScreen) {
        continue
      }
      const distance = Math.hypot(rect.x + rect.w / 2 - anchor.x, rect.y + rect.h / 2 - anchor.y)
      if (distance < bestDistance) {
        best = rect
        bestDistance = distance
      }
    }
    return best
  }

  islandAt(point: Point): Island | null {
    const world = screenToWorld(this.camera, this.viewport, point)
    return (
      this.grouped?.islands.find(
        ({ rect }) =>
          world.x >= rect.x && world.x <= rect.x + rect.w && world.y >= rect.y && world.y <= rect.y + rect.h,
      ) ?? null
    )
  }

  zoomLimits(): ScaleLimits {
    return this.limits
  }

  arrangements(): Arrangement[] {
    return availableArrangements(this.photos)
  }

  private relayout(photos: CanvasPhoto[], arrangement: Arrangement, animate: boolean) {
    const fromInstances = animate ? this.settledInstances() : []
    const fromIds = this.photos.map(photo => photo.id)
    const fromCamera = this.camera

    this.photos = photos
    this.arrangement = arrangement
    this.transition = null
    this.flight = null
    this.velocity = { x: 0, y: 0 }
    this.buildLayout()
    this.limits = this.computeLimits()
    const toCamera = this.homeCamera()
    this.camera = toCamera
    this.dirty = true

    if (!animate || photos.length === 0) {
      return
    }
    const toInstances = this.settledInstances()
    const center = (camera: CameraState) => ({ x: camera.x, y: camera.y })
    const plan = planTransition({
      from: this.reducedMotion ? [] : fromInstances,
      to: toInstances,
      fromIds,
      toIds: photos.map(photo => photo.id),
      fromCenter: center(fromCamera),
      toCenter: center(toCamera),
    })
    this.transition = {
      plan,
      fromIds,
      fromCamera: this.reducedMotion ? toCamera : fromCamera,
      toCamera,
      progress: 0,
      velocity: 0,
      elapsed: 0,
    }
    this.camera = this.transition.fromCamera
  }

  private buildLayout() {
    this.wall = null
    this.grouped = null
    this.groupedDraw = []
    if (this.arrangement === 'wall') {
      this.wall = createWallLayout(this.photos, {
        columnWidth: WALL_COLUMN_WIDTH,
        gap: WALL_GAP,
        minPeriod: {
          width: (Math.max(this.viewport.width, REFERENCE_VIEWPORT.width) * 2) / WALL_MIN_SCALE,
          height: (Math.max(this.viewport.height, REFERENCE_VIEWPORT.height) * 2) / WALL_MIN_SCALE,
        },
      })
      return
    }
    this.grouped = createGroupedLayout(groupPhotos(this.photos, this.arrangement), this.photos, {
      columnWidth: ISLAND_COLUMN_WIDTH,
      gap: ISLAND_GAP,
      islandGap: ISLAND_SPACING,
      labelHeight: ISLAND_LABEL_HEIGHT,
      aspect: this.viewport.width / Math.max(1, this.viewport.height),
    })
    this.groupedDraw = this.decorate(this.grouped.instances, this.photos)
  }

  private computeLimits(): ScaleLimits {
    if (!this.grouped) {
      return { min: WALL_MIN_SCALE, max: Math.max(WALL_MIN_SCALE, maxScale(WALL_COLUMN_WIDTH, this.dpr)) }
    }
    const max = maxScale(ISLAND_COLUMN_WIDTH, this.dpr)
    const fitted = Math.min(fitRect(this.grouped.bounds, this.viewport, FIT_PADDING).scale, max)
    return { min: fitted * GROUPED_ZOOM_OUT_ALLOWANCE, max }
  }

  private homeCamera(): CameraState {
    if (!this.grouped) {
      return { x: this.viewport.width / 2, y: this.viewport.height / 2 - WALL_TOP_INSET, scale: 1 }
    }
    const fitted = fitRect(this.grouped.bounds, this.viewport, FIT_PADDING)
    return { ...fitted, scale: Math.min(fitted.scale, this.limits.max) }
  }

  private constrain(camera: CameraState): CameraState {
    return this.grouped ? clampToBounds(camera, this.grouped.bounds) : camera
  }

  private decorate(instances: Instance[], photos: CanvasPhoto[], alpha = 1): DrawInstance[] {
    return instances.map(instance => ({ ...instance, id: photos[instance.photoIndex].id, alpha }))
  }

  private settledInstances(): DrawInstance[] {
    if (this.grouped) {
      return this.groupedDraw
    }
    if (!this.wall) {
      return []
    }
    const rect = visibleWorldRect(this.camera, this.viewport, VISIBLE_MARGIN)
    return this.decorate(wallInstances(this.wall, rect), this.photos)
  }

  private computeInstances(): DrawInstance[] {
    const transition = this.transition
    if (!transition) {
      return this.settledInstances()
    }
    const { plan, progress } = transition
    const fade = Math.min(1, transition.elapsed / FADE_MS)
    const out: DrawInstance[] = []
    for (const instance of plan.fadeOut) {
      out.push({ ...instance, id: transition.fromIds[instance.photoIndex], alpha: 1 - fade })
    }
    for (const instance of plan.fadeIn) {
      out.push({ ...instance, id: this.photos[instance.photoIndex].id, alpha: fade })
    }
    for (const move of plan.moves) {
      out.push({ ...move.to, ...interpolateRect(move.from, move.to, progress), id: move.id, alpha: 1 })
    }
    return out
  }

  private advanceTransition(dtMs: number) {
    const transition = this.transition!
    transition.elapsed += dtMs
    const next = springToward(transition.progress, 1, transition.velocity, dtMs, TRANSITION_MS)
    transition.progress = Math.min(1, next.value)
    transition.velocity = next.velocity
    this.camera = mixCamera(transition.fromCamera, transition.toCamera, transition.progress)
    if (transition.elapsed >= TRANSITION_MS && 1 - transition.progress < 0.002) {
      this.camera = transition.toCamera
      this.transition = null
    }
    this.dirty = true
  }

  private advanceFlight(dtMs: number) {
    const flight = this.flight!
    const before = this.camera
    const x = springToward(before.x, flight.target.x, flight.velocity.x, dtMs, TRANSITION_MS)
    const y = springToward(before.y, flight.target.y, flight.velocity.y, dtMs, TRANSITION_MS)
    const scale = springToward(
      Math.log(before.scale),
      Math.log(flight.target.scale),
      flight.velocity.scale,
      dtMs,
      TRANSITION_MS,
    )
    flight.velocity = { x: x.velocity, y: y.velocity, scale: scale.velocity }
    this.camera = { x: x.value, y: y.value, scale: Math.exp(scale.value) }
    const remaining = Math.hypot(flight.target.x - this.camera.x, flight.target.y - this.camera.y) * this.camera.scale
    if (remaining < 0.5 && Math.abs(flight.target.scale / this.camera.scale - 1) < 0.001) {
      this.camera = flight.target
      this.flight = null
    }
    this.dirty = true
    return Math.hypot(this.camera.x - before.x, this.camera.y - before.y) * before.scale
  }

  private flyTo(target: CameraState) {
    const constrained = this.constrain(target)
    this.velocity = { x: 0, y: 0 }
    if (this.reducedMotion) {
      this.camera = constrained
      this.flight = null
      this.dirty = true
      return
    }
    this.flight = { target: constrained, velocity: { x: 0, y: 0, scale: 0 } }
  }
}
