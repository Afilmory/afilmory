/// <reference types="@webgpu/types" />
import { LoadingState } from './enum'
import { ImageViewerEngineBase } from './ImageViewerEngineBase'
import type { DebugInfo, ImageViewerOptions } from './interface'
import type { GainMapMetadata, Matrix3 } from './jpeg-gainmap'
import { IMAGE_SHADER } from './webgpu-shaders'
import type { BitmapPlane, ImagePixels, Rect, TextureWorkerMessage, TilePixels, TileRequest } from './webgpu-tiles'
import {
  closeTilePixels,
  getVisibleTileRequests,
  intersects,
  MAX_PENDING_TILES,
  TEXTURE_BUDGET,
  TILE_SIZE,
} from './webgpu-tiles'

interface TexturePlane {
  texture: GPUTexture
  uv: Rect
  bytes: number
}
interface Tile extends TileRequest {
  base: TexturePlane
  gain?: TexturePlane
  buffer: GPUBuffer
  bind: GPUBindGroup
}

export class WebGPUImageViewerEngine extends ImageViewerEngineBase {
  private device: GPUDevice | null = null
  private context: GPUCanvasContext | null = null
  private pipeline!: GPURenderPipeline
  private sampler!: GPUSampler
  private imageBuffer!: GPUBuffer
  private initialized: Promise<void>
  private worker: Worker | null = null
  private overview: Tile | null = null
  private tiles = new Map<string, Tile>()
  private requests: TileRequest[] = []
  private pending = new Set<string>()
  private uploads: TilePixels[] = []
  private uploadFrame: number | null = null
  private metadata: GainMapMetadata | null = null
  private wideGamut = false
  private extendedRange = false
  private hdrMedia = window.matchMedia('(dynamic-range: high)')
  private textureBytes = 0
  private tileOutlineEnabled = false
  private renderCount = 0
  private lastDebugUpdate = 0
  private failed = false
  private resolveLoad: (() => void) | null = null
  private rejectLoad: ((error: Error) => void) | null = null
  private hdrListener = () => {
    this.onHDRChange(this.isHDR)
    this.render()
  }

  constructor(
    canvas: HTMLCanvasElement,
    config: Required<ImageViewerOptions>,
    private onFailure: (error: Error) => void,
    private onHDRChange: (hdr: boolean) => void,
    private onDebugUpdate?: React.RefObject<(info: DebugInfo) => void>,
  ) {
    super(canvas, config)
    this.initialized = this.initializeGPU()
  }

  get isHDR() {
    return Boolean(this.metadata && this.extendedRange && this.hdrMedia.matches)
  }

  private async initializeGPU() {
    if (!navigator.gpu) {
      throw new Error('WebGPU is not available')
    }
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) {
      throw new Error('No WebGPU adapter')
    }
    if (this.destroyed) {
      throw new DOMException('Viewer disposed', 'AbortError')
    }
    const device = await adapter.requestDevice()
    if (this.destroyed) {
      device.destroy()
      throw new DOMException('Viewer disposed', 'AbortError')
    }
    this.device = device
    const context = this.canvas.getContext('webgpu')
    if (!context) {
      throw new Error('WebGPU canvas is not available')
    }
    this.context = context
    device.pushErrorScope('validation')
    let invalid = false
    try {
      context.configure({
        device,
        format: 'rgba16float',
        colorSpace: 'display-p3',
        toneMapping: { mode: 'extended' },
        alphaMode: 'premultiplied',
      })
    }
    catch {
      invalid = true
    }
    const error = await device.popErrorScope()
    if (this.destroyed) {
      throw new DOMException('Viewer disposed', 'AbortError')
    }
    this.extendedRange = !invalid && !error && context.getConfiguration?.()?.toneMapping?.mode === 'extended'
    const format = this.extendedRange ? 'rgba16float' : navigator.gpu.getPreferredCanvasFormat()
    if (!this.extendedRange) {
      context.configure({ device, format, colorSpace: 'display-p3', alphaMode: 'premultiplied' })
    }
    const module = device.createShaderModule({ code: IMAGE_SHADER })
    this.pipeline = await device.createRenderPipelineAsync({
      layout: 'auto',
      vertex: { module, entryPoint: 'vertex' },
      fragment: { module, entryPoint: 'fragment', targets: [{ format }] },
    })
    if (this.destroyed) {
      throw new DOMException('Viewer disposed', 'AbortError')
    }
    this.sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' })
    this.imageBuffer = device.createBuffer({ size: 176, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    device.addEventListener('uncapturederror', event => this.fail(new Error(event.error.message)))
    void device.lost.then((info) => {
      if (!this.destroyed) {
        this.fail(new Error(`WebGPU device lost: ${info.message}`))
      }
    })
    this.hdrMedia.addEventListener('change', this.hdrListener)
    this.initializeViewport()
  }

  async loadImage(url: string, preknownWidth?: number, preknownHeight?: number) {
    this.originalImageSrc = url
    this.onLoadingStateChange?.(true, LoadingState.IMAGE_LOADING, 'unknown')
    await this.initialized
    if (this.destroyed) {
      throw new DOMException('Viewer disposed', 'AbortError')
    }
    if (preknownWidth && preknownHeight) {
      this.imageWidth = preknownWidth
      this.imageHeight = preknownHeight
      this.setupInitialScaling()
    }
    return new Promise<void>((resolve, reject) => {
      this.resolveLoad = resolve
      this.rejectLoad = reject
      this.worker = new Worker(new URL('./webgpu-texture.worker.ts', import.meta.url), {
        type: 'module',
        name: 'image-textures',
      })
      this.worker.onerror = event => this.fail(new Error(event.message || 'Image worker failed'))
      this.worker.onmessage = ({ data }: MessageEvent<TextureWorkerMessage>) => {
        if (this.destroyed || this.failed) {
          if (data.type === 'ready') {
            closeTilePixels(data.image)
          }
          if (data.type === 'tile') {
            closeTilePixels(data.tile)
          }
          return
        }
        if (data.type === 'error') {
          this.fail(new Error(data.message))
          return
        }
        if (data.type === 'ready') {
          void this.acceptImage(data.image).catch(error => this.fail(error))
          return
        }
        this.uploads.push(data.tile)
        this.scheduleUploads()
      }
      this.worker.postMessage({ type: 'load', url })
    })
  }

  private writeMetadata(image: ImagePixels) {
    const floats = new Float32Array(44)
    const identity: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]
    if (image.metadata) {
      floats.set(image.metadata.min, 0)
      floats.set(image.metadata.max, 4)
      floats.set(
        image.metadata.gamma.map(v => 1 / v),
        8,
      )
      floats.set(image.metadata.offsetBase, 12)
      floats.set(image.metadata.offsetAlternate, 16)
    }
    for (const [offset, matrix] of [
      [20, image.toGainSpace ?? identity],
      [32, image.toDisplayP3 ?? identity],
    ] as const) {
      for (let col = 0; col < 3; col++) {
        floats.set(matrix.slice(col * 3, col * 3 + 3), offset + col * 4)
      }
    }
    this.device!.queue.writeBuffer(this.imageBuffer, 0, floats)
  }

  private async acceptImage(image: ImagePixels) {
    this.imageWidth = image.width
    this.imageHeight = image.height
    this.metadata = image.metadata
    this.wideGamut = image.wideGamut
    if (image.warning) {
      console.warn(image.warning)
    }
    this.setupInitialScaling()
    this.writeMetadata(image)
    this.onLoadingStateChange?.(true, LoadingState.CREATE_TEXTURE, 'low')
    const device = this.device!
    device.pushErrorScope('validation')
    let error: GPUError | null = null
    try {
      this.overview = this.createTile(image)
    }
    finally {
      closeTilePixels(image)
      error = await device.popErrorScope()
    }
    if (error) {
      throw new Error(error.message)
    }
    if (this.destroyed) {
      return
    }
    this.imageLoaded = true
    this.render()
    await device.queue.onSubmittedWorkDone()
    if (this.destroyed) {
      return
    }
    this.onHDRChange(this.isHDR)
    this.onLoadingStateChange?.(false, undefined, image.level === 0 ? 'high' : 'low')
    this.notifyZoomChange()
    this.resolveLoad?.()
    this.resolveLoad = null
    this.rejectLoad = null
  }

  private createPlane(plane: BitmapPlane, gain: boolean): TexturePlane {
    const device = this.device!
    const format = !gain && this.wideGamut ? 'rgba16float' : 'rgba8unorm'
    const { width, height } = plane.bitmap
    const texture = device.createTexture({
      size: [width, height],
      format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    })
    try {
      device.queue.copyExternalImageToTexture(
        { source: plane.bitmap },
        { texture, colorSpace: gain ? 'srgb' : 'display-p3', premultipliedAlpha: false },
        [width, height],
      )
    }
    catch (error) {
      texture.destroy()
      throw error
    }
    const bytes = width * height * (format === 'rgba16float' ? 8 : 4)
    this.textureBytes += bytes
    return { texture, uv: plane.uv, bytes }
  }

  private createTile(pixels: TilePixels): Tile {
    const device = this.device!
    const base = this.createPlane(pixels.base, false)
    let gain: TexturePlane | undefined, buffer: GPUBuffer | undefined
    try {
      gain = pixels.gain ? this.createPlane(pixels.gain, true) : undefined
      buffer = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
      const bind = device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.sampler },
          { binding: 1, resource: base.texture.createView() },
          { binding: 2, resource: (gain ?? base).texture.createView() },
          { binding: 3, resource: { buffer } },
          { binding: 4, resource: { buffer: this.imageBuffer } },
        ],
      })
      return { key: pixels.key, level: pixels.level, rect: pixels.rect, base, gain, buffer, bind }
    }
    catch (error) {
      this.deletePlane(base)
      if (gain) {
        this.deletePlane(gain)
      }
      buffer?.destroy()
      throw error
    }
  }

  private deletePlane(plane: TexturePlane) {
    plane.texture.destroy()
    this.textureBytes -= plane.bytes
  }

  private deleteTile(tile: Tile) {
    this.deletePlane(tile.base)
    if (tile.gain) {
      this.deletePlane(tile.gain)
    }
    tile.buffer.destroy()
  }

  private scheduleUploads() {
    if (this.uploadFrame !== null || this.destroyed || this.failed) {
      return
    }
    this.uploadFrame = requestAnimationFrame(() => {
      this.uploadFrame = null
      try {
        for (let i = 0; i < MAX_PENDING_TILES && this.uploads.length; i++) {
          const pixels = this.uploads.shift()!
          this.pending.delete(pixels.key)
          try {
            if (!this.requests.some(r => r.key === pixels.key)) {
              continue
            }
            const needed
              = pixels.base.bitmap.width * pixels.base.bitmap.height * (this.wideGamut ? 8 : 4)
                + (pixels.gain ? pixels.gain.bitmap.width * pixels.gain.bitmap.height * 4 : 0)
            while (this.textureBytes + needed > TEXTURE_BUDGET) {
              const entry = [...this.tiles.entries()].find(([key]) => !this.requests.some(r => r.key === key))
              if (!entry) {
                break
              }
              this.deleteTile(entry[1])
              this.tiles.delete(entry[0])
            }
            if (this.textureBytes + needed > TEXTURE_BUDGET) {
              continue
            }
            this.tiles.set(pixels.key, this.createTile(pixels))
          }
          finally {
            closeTilePixels(pixels)
          }
        }
        this.render()
        if (this.uploads.length) {
          this.scheduleUploads()
        }
      }
      catch (error) {
        this.fail(error)
      }
    })
  }

  protected async updateTileCache() {
    if (!this.overview || this.destroyed || this.failed) {
      return
    }
    const overviewBytes = this.overview.base.bytes + (this.overview.gain?.bytes ?? 0)
    this.requests = getVisibleTileRequests(
      this.getViewport(),
      this.devicePixelRatio,
      this.overview.level,
      TEXTURE_BUDGET - overviewBytes,
      (this.wideGamut ? 8 : 4) + (this.metadata ? 4 : 0),
    )
    for (const request of this.requests) {
      const cached = this.tiles.get(request.key)
      if (cached) {
        this.tiles.delete(request.key)
        this.tiles.set(request.key, cached)
        continue
      }
      if (this.pending.has(request.key) || this.pending.size >= MAX_PENDING_TILES) {
        continue
      }
      this.pending.add(request.key)
      this.worker?.postMessage({ type: 'tile', tile: request })
    }
  }

  protected render() {
    if (!this.device || !this.context || !this.overview || this.destroyed || this.failed) {
      return
    }
    try {
      const max = this.device.limits.maxTextureDimension2D
      if (this.canvas.width > max || this.canvas.height > max) {
        const ratio = max / Math.max(this.canvas.width, this.canvas.height)
        this.canvas.width = Math.max(1, Math.floor(this.canvas.width * ratio))
        this.canvas.height = Math.max(1, Math.floor(this.canvas.height * ratio))
        this.devicePixelRatio = this.canvas.width / this.canvasWidth
      }
      void this.updateTileCache()
      const missing = this.requests.filter(r => !this.tiles.has(r.key))
      const fallback = [...this.tiles.values()]
        .filter(tile => missing.some(r => intersects(tile.rect, r.rect)))
        .sort((a, b) => b.level - a.level)
      const ready = this.requests.map(r => this.tiles.get(r.key)).filter((tile): tile is Tile => Boolean(tile))
      const drawTiles = [this.overview, ...fallback, ...ready]
      const encoder = this.device.createCommandEncoder()
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.context.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      })
      pass.setPipeline(this.pipeline)
      const left = (this.canvasWidth - this.imageWidth * this.scale) / 2 + this.translateX
      const top = (this.canvasHeight - this.imageHeight * this.scale) / 2 + this.translateY
      for (const tile of drawTiles) {
        const [x, y, width, height] = tile.rect
        this.device.queue.writeBuffer(
          tile.buffer,
          0,
          new Float32Array([
            left + x * this.scale,
            top + y * this.scale,
            width * this.scale,
            height * this.scale,
            this.canvasWidth,
            this.canvasHeight,
            this.isHDR ? 1 : 0,
            this.tileOutlineEnabled && tile !== this.overview ? 1 : 0,
            ...tile.base.uv,
            ...(tile.gain?.uv ?? tile.base.uv),
          ]),
        )
        pass.setBindGroup(0, tile.bind)
        pass.draw(6)
      }
      pass.end()
      this.device.queue.submit([encoder.finish()])
      this.renderCount++
      this.notifyViewportChange()
      this.updateDebugInfo()
    }
    catch (error) {
      this.fail(error)
    }
  }

  setTileOutlineEnabled(enabled: boolean) {
    this.tileOutlineEnabled = enabled
    this.render()
  }

  isTileOutlineEnabled() {
    return this.tileOutlineEnabled
  }

  private updateDebugInfo() {
    if (!this.onDebugUpdate?.current || performance.now() - this.lastDebugUpdate < 100) {
      return
    }
    this.lastDebugUpdate = performance.now()
    const fit = this.getFitToScreenScale()
    const mib = this.textureBytes / 1024 ** 2
    this.onDebugUpdate.current({
      renderer: 'webgpu',
      hdr: this.isHDR,
      scale: this.scale,
      relativeScale: this.scale / fit,
      translateX: this.translateX,
      translateY: this.translateY,
      currentLOD: this.requests[0]?.level ?? this.overview!.level,
      lodLevels: this.overview!.level + 1,
      canvasSize: { width: this.canvasWidth, height: this.canvasHeight },
      imageSize: { width: this.imageWidth, height: this.imageHeight },
      fitToScreenScale: fit,
      userMaxScale: fit * this.config.maxScale,
      effectiveMaxScale: Math.max(1, fit * this.config.maxScale),
      originalSizeScale: 1,
      renderCount: this.renderCount,
      maxTextureSize: this.device!.limits.maxTextureDimension2D,
      quality: this.pending.size ? 'low' : 'high',
      isLoading: !this.imageLoaded,
      memory: {
        textures: mib,
        estimated: mib,
        budget: TEXTURE_BUDGET / 1024 ** 2,
        pressure: (this.textureBytes / TEXTURE_BUDGET) * 100,
        activeLODs: new Set(Array.from(this.tiles.values(), t => t.level)).size,
        maxConcurrentLODs: this.overview!.level + 1,
        onDemandStrategy: true,
      },
      tileSystem: {
        cacheSize: this.tiles.size,
        visibleTiles: this.requests.length,
        loadingTiles: this.pending.size,
        pendingRequests: this.uploads.length,
        cacheLimit: Math.floor(TEXTURE_BUDGET / (TILE_SIZE ** 2 * (this.metadata ? 8 : 4))),
        maxTilesPerFrame: MAX_PENDING_TILES,
        tileSize: TILE_SIZE,
        cacheKeys: [...this.tiles.keys()],
        visibleKeys: this.requests.map(r => r.key),
        loadingKeys: [...this.pending],
        pendingKeys: this.uploads.map(p => p.key),
      },
      tileOutlinesEnabled: this.tileOutlineEnabled,
    })
  }

  private fail(error: unknown) {
    if (this.destroyed || this.failed) {
      return
    }
    this.failed = true
    const reason = error instanceof Error ? error : new Error(String(error))
    this.rejectLoad?.(reason)
    this.resolveLoad = null
    this.rejectLoad = null
    this.onFailure(reason)
  }

  destroy() {
    if (this.destroyed) {
      return
    }
    super.destroy()
    this.rejectLoad?.(new DOMException('Viewer disposed', 'AbortError'))
    this.resolveLoad = null
    this.rejectLoad = null
    this.worker?.terminate()
    this.worker = null
    this.hdrMedia.removeEventListener('change', this.hdrListener)
    if (this.uploadFrame !== null) {
      cancelAnimationFrame(this.uploadFrame)
    }
    for (const pixels of this.uploads) {
      closeTilePixels(pixels)
    }
    this.uploads = []
    this.pending.clear()
    for (const tile of this.tiles.values()) {
      this.deleteTile(tile)
    }
    this.tiles.clear()
    if (this.overview) {
      this.deleteTile(this.overview)
    }
    this.overview = null
    this.imageBuffer?.destroy()
    this.context?.unconfigure()
    this.device?.destroy()
  }
}
