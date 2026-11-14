import type { ActiveTransition } from './arrange-transition'
import { arrangeTransitionInstances, stepArrangeTransition } from './arrange-transition'
import type { AttractBasis, AttractionState } from './attraction'
import { applyAttraction, planAttraction, stepAttraction } from './attraction'
import type { CameraState, Flight, ScaleLimits } from './camera'
import {
  clampToBounds,
  containsPoint,
  decayVelocity,
  fitRect,
  nearestOnScreen,
  screenToWorld,
  stepFlight,
  visibleWorldRect,
  worldRectToScreen,
  zoomAt,
} from './camera'
import type { PhotoColor } from './color'
import { createColorCache } from './color'
import type { FilmState } from './film-stage'
import { FilmRoll } from './film-stage'
import { sameLayoutInput } from './layout-input'
import { FILM_START_SCALE, filmOrder, filmProgress } from './layouts/film'
import type { GroupedLayout, Island } from './layouts/grouped'
import { availableArrangements } from './layouts/grouping'
import type { WallLayout } from './layouts/wall'
import { nearestWallCopy, wallInstances } from './layouts/wall'
import { buildScene, FIT_PADDING, sceneHome, sceneLimits } from './scene'
import { planTransition } from './transition'
import type { Arrangement, CanvasPhoto, Instance, Point, Rect, Size } from './types'

export {
  ISLAND_COLUMN_WIDTH,
  ISLAND_GAP,
  ISLAND_LABEL_HEIGHT,
  ISLAND_SPACING,
  WALL_COLUMN_WIDTH,
  WALL_GAP,
} from './scene'

const TRANSITION_MS = 400
const VISIBLE_MARGIN = 240
const ZOOM_STEP = 1.3
const STOP_SPEED = 0.01
const FAST_SPEED = 1.5
const FILM_SCROLL_AT = 0.5

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
  film: FilmState | null
}

export interface CanvasCoreOptions {
  viewport: Size
  dpr: number
  reducedMotion: boolean
}

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
  private limits: ScaleLimits = { min: 0, max: 2 }
  private velocity: Point = { x: 0, y: 0 }
  private flight: Flight | null = null
  private transition: ActiveTransition | null = null
  private attraction: AttractionState | null = null
  private colors: (PhotoColor | null)[] | null = null
  private readonly colorCache = createColorCache()
  private current: DrawInstance[] = []
  private readonly film = new FilmRoll()
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
    this.film.stop()
    if (this.filmScrolls()) {
      this.frame()
      this.pannedSinceTick += this.film.scroll(Math.abs(dxPx) >= Math.abs(dyPx) ? dxPx : dyPx)
      this.dirty = true
      return
    }
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
    if (this.filmScrolls()) {
      this.film.fling(Math.abs(vxPxPerMs) >= Math.abs(vyPxPerMs) ? vxPxPerMs : vyPxPerMs)
      return
    }
    this.velocity = { x: -vxPxPerMs / this.camera.scale, y: -vyPxPerMs / this.camera.scale }
  }

  zoomAt(point: Point, factor: number) {
    this.flight = null
    this.settleFilmOnWall()
    const next = zoomAt(this.camera, this.viewport, point, factor, this.limits)
    const anchor = this.wall && next.scale < FILM_START_SCALE ? this.center() : point
    this.camera = this.constrain(
      anchor === point ? next : zoomAt(this.camera, this.viewport, anchor, factor, this.limits),
    )
    this.dirty = true
  }

  zoomStep(direction: 1 | -1) {
    this.settleFilmOnWall()
    const center = this.center()
    const factor = direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP
    this.flyTo(zoomAt(this.flight?.target ?? this.camera, this.viewport, center, factor, this.limits))
  }

  reset() {
    this.settleFilmOnWall()
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

  attract(key: string, basis: AttractBasis): boolean {
    const plan
      = this.transition || this.filmProgress() > 0
        ? null
        : planAttraction(this.settledInstances(), this.photos, basis === 'color' ? this.photoColors() : [], key, basis)
    if (!plan) {
      return false
    }
    this.flight = null
    this.velocity = { x: 0, y: 0 }
    this.attraction = { plan, progress: this.reducedMotion ? 1 : 0, velocity: 0, target: 1 }
    this.dirty = true
    return true
  }

  releaseAttraction() {
    if (!this.attraction) {
      return
    }
    if (this.reducedMotion) {
      this.attraction = null
    }
    else {
      this.attraction.target = 0
    }
    this.dirty = true
  }

  flyToWorld(point: Point) {
    this.flyTo({ ...this.camera, x: point.x, y: point.y })
  }

  tick(dtMs: number): boolean {
    let active = false
    let travelled = this.pannedSinceTick
    this.pannedSinceTick = 0

    if (this.attraction && this.attraction.progress !== this.attraction.target) {
      active = true
      this.advanceAttraction(dtMs)
    }
    else if (this.transition) {
      active = true
      this.advanceTransition(dtMs)
    }
    else if (this.film.gliding) {
      this.frame()
      travelled += this.film.glide(dtMs, decayVelocity, STOP_SPEED)
      active = this.film.gliding
      this.dirty = true
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
      film: this.film.state,
    }
  }

  hitTest(point: Point): DrawInstance | null {
    if (this.transition) {
      return null
    }
    const world = screenToWorld(this.camera, this.viewport, point)
    const plan = this.attraction?.plan
    const { instances } = this.frame()
    for (let i = instances.length - 1; i >= 0; i--) {
      const instance = instances[i]
      const pickable
        = instance.alpha >= 0.5 && (!plan || instance.key === plan.heldKey || plan.targets.has(instance.key))
      if (pickable && containsPoint(instance, world)) {
        return instance
      }
    }
    return null
  }

  attracted() {
    return this.attraction !== null && this.attraction.target === 1
  }

  screenRectOfInstance(instance: Rect): Rect {
    return worldRectToScreen(this.camera, this.viewport, instance)
  }

  screenRectOf(photoId: string, near?: Point): Rect | null {
    const rects = this.frame()
      .instances
      .filter(instance => instance.id === photoId)
      .map(instance => this.screenRectOfInstance(instance))
    return nearestOnScreen(rects, this.viewport, near ?? this.center())
  }

  islandAt(point: Point): Island | null {
    const world = screenToWorld(this.camera, this.viewport, point)
    return this.grouped?.islands.find(({ rect }) => containsPoint(rect, world)) ?? null
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
    this.attraction = null
    this.flight = null
    this.velocity = { x: 0, y: 0 }
    this.colors = null
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

  private photoColors() {
    this.colors ??= this.colorCache.colorsOf(this.photos)
    return this.colors
  }

  private buildLayout() {
    const scene = buildScene(
      this.photos,
      this.arrangement === 'color' ? this.photoColors() : [],
      this.arrangement,
      this.viewport,
    )
    this.wall = scene.wall
    this.grouped = scene.grouped
    this.film.reset(scene.wall ? filmOrder(this.photos) : [])
    this.groupedDraw = scene.grouped ? this.decorate(scene.grouped.instances, this.photos) : []
  }

  private computeLimits(): ScaleLimits {
    return sceneLimits(this.grouped, this.viewport, this.dpr)
  }

  private homeCamera(): CameraState {
    return sceneHome(this.grouped, this.viewport, this.limits)
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
    this.film.state = null
    if (!transition) {
      const settled = this.settledInstances()
      const progress = this.filmProgress()
      if (progress > 0) {
        return this.film.compose({
          settled,
          progress,
          camera: this.camera,
          viewport: this.viewport,
          photos: this.photos,
        })
      }
      return this.attraction ? applyAttraction(settled, this.attraction.plan, this.attraction.progress) : settled
    }
    return arrangeTransitionInstances(transition, this.photos)
  }

  private center(): Point {
    return { x: this.viewport.width / 2, y: this.viewport.height / 2 }
  }

  private filmProgress() {
    return this.wall && this.photos.length > 0 ? filmProgress(this.camera.scale) : 0
  }

  private filmScrolls() {
    return this.filmProgress() >= FILM_SCROLL_AT
  }

  private settleFilmOnWall() {
    const photoIndex = this.film.takeCenteredPhoto()
    const copy = photoIndex === null || !this.wall ? null : nearestWallCopy(this.wall, photoIndex, this.camera)
    if (copy) {
      this.camera = { ...this.camera, x: copy.x + copy.w / 2, y: copy.y + copy.h / 2 }
      this.dirty = true
    }
  }

  private advanceTransition(dtMs: number) {
    const { camera, done } = stepArrangeTransition(this.transition!, dtMs, TRANSITION_MS)
    this.camera = camera
    if (done) {
      this.transition = null
    }
    this.dirty = true
  }

  private advanceAttraction(dtMs: number) {
    if (stepAttraction(this.attraction!, dtMs, TRANSITION_MS)) {
      this.attraction = null
    }
    this.dirty = true
  }

  private advanceFlight(dtMs: number) {
    const before = this.camera
    const { camera, done } = stepFlight(before, this.flight!, dtMs, TRANSITION_MS)
    this.camera = camera
    if (done) {
      this.flight = null
    }
    this.dirty = true
    return Math.hypot(camera.x - before.x, camera.y - before.y) * before.scale
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
