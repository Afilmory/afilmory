import type { AttractBasis } from './attraction'
import type { FrameState } from './core'
import { CanvasCore } from './core'
import { attachInput } from './input'
import { Renderer } from './renderer'
import { TextureScheduler } from './textures/scheduler'
import { pickTier } from './textures/tiers'
import { loadThumbnail } from './thumbnail-loader'
import type { Arrangement, CanvasPhoto, Point, Rect } from './types'

export interface PhotoCanvasCallbacks {
  onPhotoClick: (photoId: string, screenRect: Rect) => void
  onHover: (photoId: string | null, instanceKey: string | null) => void
  onFrame: (frame: FrameState) => void
  onUnavailable: () => void
  reducedMotion: boolean
}

const MAX_FRAME_MS = 48
const WANTED_MARGIN_PX = 160
const DEFAULT_BUDGET_BYTES = 256 * 1024 * 1024
const LOW_MEMORY_BUDGET_BYTES = 128 * 1024 * 1024
const LOW_MEMORY_GB = 4

const textureBudget = () => {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return memory !== undefined && memory <= LOW_MEMORY_GB ? LOW_MEMORY_BUDGET_BYTES : DEFAULT_BUDGET_BYTES
}

export class PhotoCanvasEngine {
  private readonly core: CanvasCore
  private readonly gl: WebGL2RenderingContext
  private renderer: Renderer | null = null
  private scheduler: TextureScheduler<ImageBitmap> | null = null
  private readonly detachInput: () => void
  private readonly resizeObserver: ResizeObserver
  private photos: CanvasPhoto[] = []
  private photosById = new Map<string, CanvasPhoto>()
  private hoveredKey: string | null = null
  private raf = 0
  private lastFrameAt = 0
  private paused = false
  private holding = false
  private attractBasis: AttractBasis = 'color'
  private destroyed = false
  private wantedVersion = -1
  private wantedMoving = false

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: PhotoCanvasCallbacks,
  ) {
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true })
    if (!gl) {
      throw new Error('WebGL2 is not available')
    }
    this.gl = gl
    this.core = new CanvasCore({
      viewport: this.measure(),
      dpr: window.devicePixelRatio || 1,
      reducedMotion: callbacks.reducedMotion,
    })
    this.createGpuState()

    const whileActive
      = <A extends unknown[]>(handler: (...args: A) => void) =>
        (...args: A) => {
          if (!this.paused) {
            handler(...args)
          }
        }
    this.detachInput = attachInput(canvas, {
      panBy: whileActive((dx, dy) => this.act(() => this.core.panBy(dx, dy))),
      release: whileActive((vx, vy) => this.act(() => this.core.release(vx, vy))),
      zoomAt: whileActive((point, factor) => this.act(() => this.core.zoomAt(point, factor))),
      step: whileActive(direction => this.zoomStep(direction)),
      reset: whileActive(() => this.reset()),
      click: whileActive(point => this.handleClick(point)),
      doubleClick: whileActive(point => this.handleDoubleClick(point)),
      hover: whileActive(point => this.handleHover(point)),
      hold: point => this.handleHold(point),
      holdEnd: () => this.handleHoldEnd(),
    })
    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(canvas)
    canvas.addEventListener('webglcontextlost', this.handleContextLost)
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored)
    this.handleResize()
  }

  setPhotos(photos: CanvasPhoto[]) {
    this.photos = photos
    this.photosById = new Map(photos.map(photo => [photo.id, photo]))
    this.renderer?.setPhotos(photos)
    this.act(() => this.core.setPhotos(photos))
  }

  setArrangement(arrangement: Arrangement) {
    this.act(() => this.core.setArrangement(arrangement))
  }

  arrangements() {
    return this.core.arrangements()
  }

  screenRectOf(photoId: string, near?: Point) {
    return this.core.screenRectOf(photoId, near)
  }

  flyToIsland(key: string) {
    this.act(() => this.core.flyToIsland(key))
  }

  flyToWorld(point: Point) {
    this.act(() => this.core.flyToWorld(point))
  }

  setAttractBasis(basis: AttractBasis) {
    this.attractBasis = basis
  }

  zoomStep(direction: 1 | -1) {
    this.act(() => this.core.zoomStep(direction))
  }

  reset() {
    this.act(() => this.core.reset())
  }

  pause() {
    this.paused = true
    cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  resume() {
    if (!this.paused) {
      return
    }
    this.paused = false
    this.schedule()
  }

  destroy() {
    this.destroyed = true
    cancelAnimationFrame(this.raf)
    this.detachInput()
    this.resizeObserver.disconnect()
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored)
    this.disposeGpuState()
  }

  private createGpuState() {
    const renderer = new Renderer(this.gl)
    renderer.setPhotos(this.photos)
    this.renderer = renderer
    this.scheduler = new TextureScheduler<ImageBitmap>({
      load: (id, tier, signal) => {
        const photo = this.photosById.get(id)
        if (!photo) {
          return Promise.reject(new Error('unknown photo'))
        }
        return loadThumbnail(photo.thumbnailUrl, photo.aspectRatio, tier, signal)
      },
      onLoaded: (id, _tier, bitmap) => {
        renderer.setThumbnail(id, bitmap, performance.now())
        this.schedule()
      },
      onEvict: id => renderer.deleteThumbnail(id),
      budgetBytes: textureBudget(),
    })
    this.wantedVersion = -1
  }

  private disposeGpuState() {
    this.scheduler?.dispose()
    this.scheduler = null
    this.renderer?.dispose()
    this.renderer = null
  }

  private readonly handleContextLost = (event: Event) => {
    event.preventDefault()
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.scheduler?.dispose()
    this.scheduler = null
    this.renderer = null
  }

  private readonly handleContextRestored = () => {
    if (this.destroyed) {
      return
    }
    try {
      this.createGpuState()
    }
    catch {
      this.disposeGpuState()
      this.callbacks.onUnavailable()
      return
    }
    this.schedule()
  }

  private measure() {
    const rect = this.canvas.getBoundingClientRect()
    return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) }
  }

  private handleResize() {
    const viewport = this.measure()
    const dpr = window.devicePixelRatio || 1
    const width = Math.round(viewport.width * dpr)
    const height = Math.round(viewport.height * dpr)
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }
    this.act(() => this.core.resize(viewport, dpr))
  }

  private act(change: () => void) {
    change()
    this.schedule()
  }

  private schedule() {
    if (this.raf !== 0 || this.paused || this.destroyed || !this.renderer) {
      return
    }
    this.raf = requestAnimationFrame(this.loop)
  }

  private readonly loop = (now: number) => {
    this.raf = 0
    const renderer = this.renderer
    if (!renderer || this.paused || this.destroyed) {
      return
    }
    const elapsed = this.lastFrameAt === 0 ? 16 : now - this.lastFrameAt
    this.lastFrameAt = now
    const animating = this.core.tick(Math.min(MAX_FRAME_MS, elapsed))
    const frame = this.core.frame()
    this.requestTextures(frame)
    const pending = renderer.render(frame, this.hoveredKey, now)
    this.callbacks.onFrame(frame)
    if (animating || pending || frame.moving) {
      this.schedule()
    }
    else {
      this.lastFrameAt = 0
    }
  }

  private requestTextures(frame: FrameState) {
    if (frame.cameraVersion === this.wantedVersion && frame.moving === this.wantedMoving) {
      return
    }
    this.wantedVersion = frame.cameraVersion
    this.wantedMoving = frame.moving
    const { camera, viewport, dpr } = frame
    const halfWidth = (viewport.width / 2 + WANTED_MARGIN_PX) / camera.scale
    const halfHeight = (viewport.height / 2 + WANTED_MARGIN_PX) / camera.scale
    const wanted = new Map<string, { id: string, tier: number, distance: number }>()
    for (const instance of frame.instances) {
      const centerX = instance.x + instance.w / 2
      const centerY = instance.y + instance.h / 2
      if (
        Math.abs(centerX - camera.x) > halfWidth + instance.w / 2
        || Math.abs(centerY - camera.y) > halfHeight + instance.h / 2
      ) {
        continue
      }
      const tier = pickTier(Math.max(instance.w, instance.h) * camera.scale, dpr)
      if (tier === 0) {
        continue
      }
      const distance = Math.hypot(centerX - camera.x, centerY - camera.y)
      const existing = wanted.get(instance.id)
      if (!existing || distance < existing.distance) {
        wanted.set(instance.id, { id: instance.id, tier, distance })
      }
    }
    this.scheduler?.update([...wanted.values()], frame.moving)
  }

  private handleClick(point: Point) {
    const hit = this.core.hitTest(point)
    if (!hit) {
      return
    }
    this.callbacks.onPhotoClick(hit.id, this.core.screenRectOfInstance(hit))
  }

  private handleHold(point: Point) {
    if (this.paused) {
      return false
    }
    const hit = this.core.hitTest(point)
    this.holding = hit !== null && this.core.attract(hit.key, this.attractBasis)
    this.schedule()
    return this.holding
  }

  private handleHoldEnd() {
    this.holding = false
    this.core.releaseAttraction()
    this.schedule()
  }

  private handleDoubleClick(point: Point) {
    if (this.core.hitTest(point)) {
      return
    }
    const island = this.core.islandAt(point)
    if (island) {
      this.flyToIsland(island.key)
    }
  }

  private handleHover(point: Point | null) {
    const hit = point ? this.core.hitTest(point) : null
    const key = hit?.key ?? null
    if (key === this.hoveredKey) {
      return
    }
    this.hoveredKey = key
    this.canvas.style.cursor = hit ? 'pointer' : ''
    this.schedule()
    this.callbacks.onHover(hit?.id ?? null, key)
  }
}
