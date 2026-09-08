import { LoadingState } from './enum'
import { ImageViewerEngineBase } from './ImageViewerEngineBase'
import type { DebugInfo, ImageViewerOptions } from './interface'
import { createShader, FRAGMENT_SHADER_SOURCE, VERTEX_SHADER_SOURCE } from './shaders'
import TextureWorkerRaw from './texture.worker?raw'

// 瓦片系统配置
const TILE_SIZE = 512 // 每个瓦片的像素大小
const MAX_TILES_PER_FRAME = 4 // 每帧最多创建的瓦片数量
const TILE_CACHE_SIZE = 32 // 最大缓存瓦片数量

// 瓦片信息接口
interface TileInfo {
  x: number // 瓦片在网格中的 x 坐标
  y: number // 瓦片在网格中的 y 坐标
  lodLevel: number // LOD 级别
  texture: WebGLTexture | null // WebGL 纹理
  lastUsed: number // 最后使用时间
  isLoading: boolean // 是否正在加载
  priority: number // 优先级（距离视口中心的距离）
}

interface PendingTileRequest {
  key: TileKey
  priority: number
}

// 瓦片键值
type TileKey = string // 格式：`${x}-${y}-${lodLevel}`

// 简化的 LOD 级别
const SIMPLE_LOD_LEVELS = [
  { scale: 0.25 }, // 极低质量
  { scale: 0.5 }, // 低质量
  { scale: 1 }, // 正常质量
  { scale: 2 }, // 高质量
  { scale: 4 }, // 超高质量
] as const

// 简化的 WebGL 图像查看器引擎
export class WebGLImageViewerEngine extends ImageViewerEngineBase {
  private gl: WebGLRenderingContext
  private program!: WebGLProgram
  private texture: WebGLTexture | null = null

  // 简化的纹理管理
  private currentLOD = 1 // 默认使用正常质量
  private lodTextures = new Map<number, WebGLTexture>()

  private onDebugUpdate?: React.RefObject<(debugInfo: DebugInfo) => void>

  // 当前质量状态
  private currentQuality: 'high' | 'medium' | 'low' | 'unknown' = 'unknown'
  private isLoadingTexture = true
  private worker: Worker | null = null
  private workerURL: string | null = null
  private textureWorkerInitialized = false

  // WebGL attribute/uniform缓存
  private positionBuffer: WebGLBuffer | null = null
  private texCoordBuffer: WebGLBuffer | null = null
  private tileOutlineBuffer: WebGLBuffer | null = null
  private positionLocation = -1
  private texCoordLocation = -1
  private matrixLocation!: WebGLUniformLocation
  private imageLocation!: WebGLUniformLocation
  private renderModeLocation!: WebGLUniformLocation
  private solidColorLocation!: WebGLUniformLocation
  private tileOutlineEnabled = false

  // 瓦片系统
  private tileCache = new Map<TileKey, TileInfo>()
  private loadingTiles = new Map<TileKey, { priority: number }>()
  private pendingTileRequests: PendingTileRequest[] = []
  private tileProcessingFrameId: number | null = null

  // 可视区域信息
  private currentVisibleTiles = new Set<TileKey>()
  private lastViewportHash = ''

  // Promise resolvers for loadImage
  private loadImageResolve: (() => void) | null = null
  private loadImageReject: ((error: Error) => void) | null = null

  constructor(
    canvas: HTMLCanvasElement,
    config: Required<ImageViewerOptions>,
    onDebugUpdate?: React.RefObject<(debugInfo: DebugInfo) => void>,
  ) {
    super(canvas, config)
    this.onDebugUpdate = onDebugUpdate

    // 初始化 WebGL
    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: true,
      powerPreference: 'default',
    })
    if (!gl) {
      throw new Error('WebGL not supported')
    }
    this.gl = gl

    try {
      this.initializeViewport()
      this.initWebGL()
      this.initWorker()
    }
    catch (error) {
      this.destroy()
      throw error
    }
  }

  private initWebGL() {
    const { gl } = this

    // 创建着色器
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE)
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE)

    // 创建程序
    this.program = gl.createProgram()!
    gl.attachShader(this.program, vertexShader)
    gl.attachShader(this.program, fragmentShader)
    gl.linkProgram(this.program)
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(`Program linking failed: ${gl.getProgramInfoLog(this.program)}`)
    }

    gl.useProgram(this.program)

    this.positionLocation = gl.getAttribLocation(this.program, 'a_position')
    this.texCoordLocation = gl.getAttribLocation(this.program, 'a_texCoord')

    if (this.positionLocation === -1 || this.texCoordLocation === -1) {
      throw new Error('Failed to get attribute locations')
    }

    const matrixLocation = gl.getUniformLocation(this.program, 'u_matrix')
    const imageLocation = gl.getUniformLocation(this.program, 'u_image')
    const renderModeLocation = gl.getUniformLocation(this.program, 'u_renderMode')
    const solidColorLocation = gl.getUniformLocation(this.program, 'u_solidColor')

    if (!matrixLocation || !imageLocation || !renderModeLocation || !solidColorLocation) {
      throw new Error('Failed to get uniform locations')
    }

    this.matrixLocation = matrixLocation
    this.imageLocation = imageLocation
    this.renderModeLocation = renderModeLocation
    this.solidColorLocation = solidColorLocation

    // 启用混合
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    // 创建几何体
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1])
    const texCoords = new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0])

    // 位置缓冲
    const positionBuffer = gl.createBuffer()
    if (!positionBuffer) {
      throw new Error('Failed to create position buffer')
    }
    this.positionBuffer = positionBuffer
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)

    // 纹理坐标缓冲
    const texCoordBuffer = gl.createBuffer()
    if (!texCoordBuffer) {
      throw new Error('Failed to create texCoord buffer')
    }
    this.texCoordBuffer = texCoordBuffer
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW)

    // 绘制瓦片描边的线框缓冲
    const outlinePositions = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1])
    const outlineBuffer = gl.createBuffer()
    if (!outlineBuffer) {
      throw new Error('Failed to create outline buffer')
    }
    this.tileOutlineBuffer = outlineBuffer
    gl.bindBuffer(gl.ARRAY_BUFFER, outlineBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, outlinePositions, gl.STATIC_DRAW)

    gl.enableVertexAttribArray(this.positionLocation)
    gl.enableVertexAttribArray(this.texCoordLocation)

    this.bindQuadBuffers()
    gl.uniform1i(this.renderModeLocation, 0)
  }

  private bindQuadBuffers() {
    if (!this.positionBuffer || !this.texCoordBuffer) {
      return
    }

    const { gl } = this
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer)
    gl.vertexAttribPointer(this.texCoordLocation, 2, gl.FLOAT, false, 0, 0)
  }

  private bindOutlineBuffer() {
    if (!this.tileOutlineBuffer) {
      return
    }

    const { gl } = this
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tileOutlineBuffer)
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0)
  }

  private drawTileOutlines(tileMatrices: Float32Array[]) {
    if (!this.tileOutlineEnabled || tileMatrices.length === 0 || !this.tileOutlineBuffer) {
      return
    }

    const { gl } = this
    gl.uniform1i(this.renderModeLocation, 1)
    gl.uniform4f(this.solidColorLocation, 1, 0.4, 0, 0.7)
    this.bindOutlineBuffer()
    gl.lineWidth(1)

    for (const matrix of tileMatrices) {
      gl.uniformMatrix3fv(this.matrixLocation, false, matrix)
      gl.drawArrays(gl.LINE_LOOP, 0, 4)
    }

    this.bindQuadBuffers()
    gl.uniform1i(this.renderModeLocation, 0)
  }

  private initWorker() {
    this.workerURL = URL.createObjectURL(new Blob([TextureWorkerRaw]))
    this.worker = new Worker(this.workerURL, {
      name: 'texture-worker',
    })

    this.worker.onmessage = (e: MessageEvent) => {
      this.handleWorkerMessage(e)
    }

    this.worker.onerror = (e: ErrorEvent) => {
      this.notifyLoadingStateChange(false)
      this.loadImageReject?.(new Error(e.message || 'Image worker failed'))
    }
  }

  private handleWorkerMessage(e: MessageEvent) {
    const { type, payload } = e.data

    if (type === 'image-loaded') {
      const { imageBitmap, imageWidth, imageHeight, lodLevel } = payload
      try {
        if (this.imageWidth !== imageWidth || this.imageHeight !== imageHeight) {
          this.imageWidth = imageWidth
          this.imageHeight = imageHeight
          this.setupInitialScaling()
        }

        this.notifyLoadingStateChange(true, LoadingState.CREATE_TEXTURE)

        const texture = this.createWebGLTexture(imageBitmap)
        imageBitmap.close()

        if (texture) {
          this.cleanupLODTextures()
          this.lodTextures.set(lodLevel, texture)
          this.texture = texture
          this.currentLOD = lodLevel
          this.currentQuality
            = SIMPLE_LOD_LEVELS[lodLevel].scale >= 2 ? 'high' : SIMPLE_LOD_LEVELS[lodLevel].scale >= 1 ? 'medium' : 'low'
        }

        this.imageLoaded = true
        this.isLoadingTexture = false
        this.notifyLoadingStateChange(false)
        this.render()
        this.notifyZoomChange()
        if (this.loadImageResolve) {
          this.loadImageResolve()
        }
      }
      catch (error) {
        if (this.loadImageReject) {
          this.loadImageReject(error as Error)
        }
      }
      return
    }

    if (type === 'load-error') {
      this.isLoadingTexture = false
      this.notifyLoadingStateChange(false)
      if (this.loadImageReject) {
        this.loadImageReject(new Error(payload.error?.message || 'Failed to load image in worker'))
      }
      return
    }

    if (type === 'init-done') {
      this.textureWorkerInitialized = true
      // After worker is initialized, we can start processing pending tiles.
      this.updateTileCache()
      return
    }

    if (type === 'tile-created') {
      const { key, imageBitmap, lodLevel } = payload
      const loadingInfo = this.loadingTiles.get(key)
      const tileInfoInCache = this.tileCache.get(key)

      // Tile might have been loaded by other means or is no longer needed
      if (!this.currentVisibleTiles.has(key)) {
        imageBitmap.close()
        if (loadingInfo) {
          this.loadingTiles.delete(key)
        }
        return
      }

      const texture = this.createWebGLTexture(imageBitmap)
      imageBitmap.close() // free memory

      if (texture) {
        const [x, y] = key.split('-').map(Number)
        const tileInfo: TileInfo = {
          x,
          y,
          lodLevel,
          texture,
          lastUsed: performance.now(),
          isLoading: false,
          priority: loadingInfo ? loadingInfo.priority : tileInfoInCache ? tileInfoInCache.priority : 0,
        }
        this.tileCache.set(key, tileInfo)

        if (loadingInfo) {
          this.loadingTiles.delete(key)
        }

        if (this.currentVisibleTiles.has(key)) {
          this.render()
        }
      }
      else if (loadingInfo) {
        this.loadingTiles.delete(key)
      }
    }
    else if (type === 'tile-error') {
      const { key, error } = payload
      console.warn(`Worker failed to create tile: ${key}`, error)
      this.loadingTiles.delete(key)
    }
  }

  async loadImage(url: string, preknownWidth?: number, preknownHeight?: number) {
    this.originalImageSrc = url
    this.isLoadingTexture = true
    this.notifyLoadingStateChange(true, LoadingState.IMAGE_LOADING)

    if (preknownWidth && preknownHeight) {
      this.imageWidth = preknownWidth
      this.imageHeight = preknownHeight
      this.setupInitialScaling()
    }

    return new Promise<void>((resolve, reject) => {
      this.loadImageResolve = resolve
      this.loadImageReject = reject

      this.worker?.postMessage({
        type: 'load-image',
        payload: { url },
      })
    })
  }

  private createWebGLTexture(source: HTMLCanvasElement | HTMLImageElement | ImageBitmap): WebGLTexture | null {
    const { gl } = this

    const texture = gl.createTexture()
    if (!texture) {
      return null
    }

    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)

    return texture
  }

  private cleanupLODTextures() {
    for (const texture of this.lodTextures.values()) {
      this.gl.deleteTexture(texture)
    }
    this.lodTextures.clear()
  }

  private selectOptimalLOD(): number {
    if (!this.imageLoaded) {
      return 1
    }

    const requiredScale = this.scale * this.devicePixelRatio

    // 寻找最佳的 LOD 级别
    // 我们希望找到一个 LOD 级别，它的缩放比例刚好大于或等于所需的缩放比例
    for (const [i, SIMPLE_LOD_LEVEL] of SIMPLE_LOD_LEVELS.entries()) {
      if (SIMPLE_LOD_LEVEL.scale >= requiredScale) {
        return i
      }
    }

    // 如果没有找到，返回最高质量的 LOD
    return SIMPLE_LOD_LEVELS.length - 1
  }

  private createMatrix(): Float32Array {
    const scaleX = (this.imageWidth * this.scale) / this.canvasWidth
    const scaleY = (this.imageHeight * this.scale) / this.canvasHeight
    const translateX = (this.translateX * 2) / this.canvasWidth
    const translateY = -(this.translateY * 2) / this.canvasHeight

    return new Float32Array([scaleX, 0, 0, 0, scaleY, 0, translateX, translateY, 1])
  }

  // 瓦片系统实现
  private getTileKey(x: number, y: number, lodLevel: number): TileKey {
    return `${x}-${y}-${lodLevel}`
  }

  private getTileGridSize(lodLevel: number): { cols: number, rows: number } {
    const lodConfig = SIMPLE_LOD_LEVELS[lodLevel]
    const scaledWidth = this.imageWidth * lodConfig.scale
    const scaledHeight = this.imageHeight * lodConfig.scale

    const cols = Math.ceil(scaledWidth / TILE_SIZE)
    const rows = Math.ceil(scaledHeight / TILE_SIZE)

    return { cols, rows }
  }

  private calculateVisibleTiles(): Array<{
    x: number
    y: number
    lodLevel: number
    priority: number
  }> {
    if (!this.imageLoaded) {
      return []
    }

    const lodLevel = this.selectOptimalLOD()
    const { cols, rows } = this.getTileGridSize(lodLevel)

    // 计算当前可视区域在图像坐标系中的范围
    // 图像中心点在 canvas 中的位置
    const imageCenterInCanvasX = this.canvasWidth / 2 + this.translateX
    const imageCenterInCanvasY = this.canvasHeight / 2 + this.translateY

    // 当前缩放后的图像尺寸
    const scaledImageWidth = this.imageWidth * this.scale
    const scaledImageHeight = this.imageHeight * this.scale

    // 图像左上角在 canvas 中的位置
    const imageLeftInCanvas = imageCenterInCanvasX - scaledImageWidth / 2
    const imageTopInCanvas = imageCenterInCanvasY - scaledImageHeight / 2

    // 可视区域在图像坐标中的范围 (0 到 imageWidth/Height)
    const viewLeft = Math.max(0, -imageLeftInCanvas / this.scale)
    const viewTop = Math.max(0, -imageTopInCanvas / this.scale)
    const viewRight = Math.min(this.imageWidth, (this.canvasWidth - imageLeftInCanvas) / this.scale)
    const viewBottom = Math.min(this.imageHeight, (this.canvasHeight - imageTopInCanvas) / this.scale)

    // 计算瓦片大小在原图坐标中的尺寸
    const tileWidthInImage = this.imageWidth / cols
    const tileHeightInImage = this.imageHeight / rows

    // 计算需要的瓦片范围
    const margin = 1 // 额外加载 1 个瓦片的边距
    const startTileX = Math.max(0, Math.floor(viewLeft / tileWidthInImage) - margin)
    const endTileX = Math.min(cols - 1, Math.ceil(viewRight / tileWidthInImage) + margin)
    const startTileY = Math.max(0, Math.floor(viewTop / tileHeightInImage) - margin)
    const endTileY = Math.min(rows - 1, Math.ceil(viewBottom / tileHeightInImage) + margin)

    const visibleTiles: Array<{
      x: number
      y: number
      lodLevel: number
      priority: number
    }> = []

    // 计算视口中心在图像坐标中的位置
    const viewCenterX = (viewLeft + viewRight) / 2
    const viewCenterY = (viewTop + viewBottom) / 2

    for (let y = startTileY; y <= endTileY; y++) {
      for (let x = startTileX; x <= endTileX; x++) {
        // 计算瓦片中心到视口中心的距离作为优先级
        const tileCenterX = (x + 0.5) * tileWidthInImage
        const tileCenterY = (y + 0.5) * tileHeightInImage
        const distance = Math.hypot(tileCenterX - viewCenterX, tileCenterY - viewCenterY)

        visibleTiles.push({
          x,
          y,
          lodLevel,
          priority: distance,
        })
      }
    }

    // 按优先级排序（距离越近优先级越高）
    visibleTiles.sort((a, b) => a.priority - b.priority)

    return visibleTiles
  }

  protected async updateTileCache(): Promise<void> {
    const visibleTiles = this.calculateVisibleTiles()
    const newVisibleTiles = new Set<TileKey>()

    // 创建当前视口的哈希，用于检测视口变化
    const viewportHash = `${this.scale.toFixed(3)}-${this.translateX.toFixed(1)}-${this.translateY.toFixed(1)}`
    const viewportChanged = viewportHash !== this.lastViewportHash
    this.lastViewportHash = viewportHash

    let addedNewRequest = false

    // 标记需要的瓦片
    for (const tile of visibleTiles) {
      const key = this.getTileKey(tile.x, tile.y, tile.lodLevel)
      newVisibleTiles.add(key)

      const pendingRequest = this.pendingTileRequests.find(request => request.key === key)

      if (!this.tileCache.has(key) && !this.loadingTiles.has(key) && !pendingRequest) {
        this.pendingTileRequests.push({ key, priority: tile.priority })
        addedNewRequest = true
      }
      else if (pendingRequest) {
        // Update priority when tile stays in view to keep ordering useful
        pendingRequest.priority = Math.min(pendingRequest.priority, tile.priority)
      }
      else if (this.tileCache.has(key)) {
        // 更新使用时间
        const tileInfo = this.tileCache.get(key)!
        tileInfo.lastUsed = performance.now()
      }
    }

    this.currentVisibleTiles = newVisibleTiles
    this.cleanupOldTiles()

    if (viewportChanged || addedNewRequest || this.pendingTileRequests.length > 0) {
      this.processPendingTileRequests()
    }
  }

  private cleanupOldTiles(): void {
    const now = performance.now()
    const maxAge = 30000 // 30 秒后清理不再使用的瓦片

    // 如果缓存过大，强制清理
    if (this.tileCache.size > TILE_CACHE_SIZE) {
      const tilesToRemove = Array.from(this.tileCache.entries())
        .filter(([key]) => !this.currentVisibleTiles.has(key))
        .sort(([, a], [, b]) => a.lastUsed - b.lastUsed)
        .slice(0, this.tileCache.size - TILE_CACHE_SIZE + 5) // 清理多一些

      for (const [key, tileInfo] of tilesToRemove) {
        if (tileInfo.texture) {
          this.gl.deleteTexture(tileInfo.texture)
        }
        this.tileCache.delete(key)
      }
    }

    // 清理过期的瓦片
    for (const [key, tileInfo] of this.tileCache.entries()) {
      if (!this.currentVisibleTiles.has(key) && now - tileInfo.lastUsed > maxAge) {
        if (tileInfo.texture) {
          this.gl.deleteTexture(tileInfo.texture)
        }
        this.tileCache.delete(key)
      }
    }
  }

  private processPendingTileRequests(): void {
    if (!this.worker || !this.textureWorkerInitialized) {
      return
    }

    if (this.pendingTileRequests.length === 0) {
      if (this.tileProcessingFrameId !== null) {
        cancelAnimationFrame(this.tileProcessingFrameId)
        this.tileProcessingFrameId = null
      }
      return
    }

    // 按优先级排序
    this.pendingTileRequests.sort((a, b) => a.priority - b.priority)

    const halfCount = Math.max(1, Math.ceil(this.pendingTileRequests.length / 2))
    const batchSize = Math.min(MAX_TILES_PER_FRAME, halfCount)
    const batch = this.pendingTileRequests.splice(0, batchSize)

    for (const request of batch) {
      const { key, priority } = request
      if (this.loadingTiles.has(key) || this.tileCache.has(key)) {
        continue
      }

      this.loadingTiles.set(key, { priority })

      // 解析瓦片坐标
      const [x, y, lodLevel] = key.split('-').map(Number)
      const lodConfig = SIMPLE_LOD_LEVELS[lodLevel]

      this.worker.postMessage({
        type: 'create-tile',
        payload: {
          x,
          y,
          lodLevel,
          lodConfig,
          imageWidth: this.imageWidth,
          imageHeight: this.imageHeight,
          key,
        },
      })
    }

    if (this.pendingTileRequests.length > 0 && this.tileProcessingFrameId === null) {
      this.tileProcessingFrameId = requestAnimationFrame(() => {
        this.tileProcessingFrameId = null
        this.processPendingTileRequests()
      })
    }
  }

  // 修改渲染方法以支持瓦片渲染
  protected render() {
    if (this.destroyed) {
      return
    }
    const { gl } = this

    if (!this.positionBuffer || !this.texCoordBuffer) {
      return
    }

    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(this.program)
    this.bindQuadBuffers()
    gl.uniform1i(this.renderModeLocation, 0)

    // 始终渲染一个低分辨率的底图作为回退，防止瓦片加载过程中出现空白
    if (this.texture) {
      gl.uniformMatrix3fv(this.matrixLocation, false, this.createMatrix())
      gl.uniform1i(this.imageLocation, 0)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.texture)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }

    // 渲染可见的瓦片
    const lodLevel = this.selectOptimalLOD()
    const outlinedTileMatrices: Float32Array[] = []

    for (const tileKey of this.currentVisibleTiles) {
      const tileInfo = this.tileCache.get(tileKey)
      if (!tileInfo || !tileInfo.texture || tileInfo.lodLevel !== lodLevel) {
        continue
      }

      // 计算瓦片的渲染变换矩阵
      const tileMatrix = this.createTileMatrix(tileInfo.x, tileInfo.y, tileInfo.lodLevel)
      gl.uniformMatrix3fv(this.matrixLocation, false, tileMatrix)

      gl.uniform1i(this.imageLocation, 0)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, tileInfo.texture)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      if (this.tileOutlineEnabled) {
        outlinedTileMatrices.push(tileMatrix)
      }
    }

    this.drawTileOutlines(outlinedTileMatrices)

    // 更新调试信息
    this.updateDebugInfo()
    this.notifyViewportChange()

    // 定期更新瓦片缓存
    if (!this.isAnimating && performance.now() - this.lastTileUpdateTime > 100) {
      // 100ms 防抖
      this.lastTileUpdateTime = performance.now()
      setTimeout(() => this.updateTileCache(), 0)
    }
  }

  private createTileMatrix(tileX: number, tileY: number, lodLevel: number): Float32Array {
    const { cols, rows } = this.getTileGridSize(lodLevel)

    // 计算瓦片在原图中的区域
    const tileWidthInImage = this.imageWidth / cols
    const tileHeightInImage = this.imageHeight / rows

    // 瓦片在原图中的边界
    const tileLeftInImage = tileX * tileWidthInImage
    const tileTopInImage = tileY * tileHeightInImage
    const tileRightInImage = Math.min(this.imageWidth, tileLeftInImage + tileWidthInImage)
    const tileBottomInImage = Math.min(this.imageHeight, tileTopInImage + tileHeightInImage)

    // 瓦片的实际尺寸（处理边界情况）
    const actualTileWidth = tileRightInImage - tileLeftInImage
    const actualTileHeight = tileBottomInImage - tileTopInImage

    // 瓦片中心在原图中的位置
    const tileCenterInImageX = tileLeftInImage + actualTileWidth / 2
    const tileCenterInImageY = tileTopInImage + actualTileHeight / 2

    // 将瓦片中心转换到相对于图像中心的坐标
    const tileCenterRelativeX = tileCenterInImageX - this.imageWidth / 2
    const tileCenterRelativeY = tileCenterInImageY - this.imageHeight / 2

    // 计算瓦片在 canvas 中的位置
    const tileCenterInCanvasX = this.canvasWidth / 2 + this.translateX + tileCenterRelativeX * this.scale
    const tileCenterInCanvasY = this.canvasHeight / 2 + this.translateY + tileCenterRelativeY * this.scale

    // 计算瓦片在 canvas 中的尺寸
    const tileWidthInCanvas = actualTileWidth * this.scale
    const tileHeightInCanvas = actualTileHeight * this.scale

    // 转换到 WebGL 归一化坐标系 (-1 到 1)
    const scaleX = tileWidthInCanvas / this.canvasWidth
    const scaleY = tileHeightInCanvas / this.canvasHeight

    const translateX = (tileCenterInCanvasX * 2) / this.canvasWidth - 1
    const translateY = -((tileCenterInCanvasY * 2) / this.canvasHeight - 1)

    return new Float32Array([scaleX, 0, 0, 0, scaleY, 0, translateX, translateY, 1])
  }

  // 添加瓦片更新时间追踪
  private lastTileUpdateTime = 0

  public setTileOutlineEnabled(enabled: boolean) {
    this.tileOutlineEnabled = enabled
    this.render()
  }

  public isTileOutlineEnabled(): boolean {
    return this.tileOutlineEnabled
  }

  public destroy() {
    if (this.destroyed) {
      return
    }
    super.destroy()
    this.loadImageReject?.(new DOMException('Viewer disposed', 'AbortError'))
    this.loadImageResolve = null
    this.loadImageReject = null
    for (const tile of this.tileCache.values()) {
      if (tile.texture) {
        this.gl.deleteTexture(tile.texture)
      }
    }
    this.tileCache.clear()
    // 清理 WebGL 资源
    this.cleanupLODTextures()
    if (this.texture) {
      this.gl.deleteTexture(this.texture)
    }
    if (this.positionBuffer) {
      this.gl.deleteBuffer(this.positionBuffer)
      this.positionBuffer = null
    }
    if (this.texCoordBuffer) {
      this.gl.deleteBuffer(this.texCoordBuffer)
      this.texCoordBuffer = null
    }
    if (this.tileOutlineBuffer) {
      this.gl.deleteBuffer(this.tileOutlineBuffer)
      this.tileOutlineBuffer = null
    }
    if (this.program) {
      this.gl.deleteProgram(this.program)
    }

    if (this.tileProcessingFrameId !== null) {
      cancelAnimationFrame(this.tileProcessingFrameId)
      this.tileProcessingFrameId = null
    }

    this.worker?.terminate()
    if (this.workerURL) {
      URL.revokeObjectURL(this.workerURL)
    }
  }

  private updateDebugInfo() {
    if (!this.onDebugUpdate?.current) {
      return
    }

    const fitToScreenScale = this.getFitToScreenScale()
    const relativeScale = this.scale / fitToScreenScale
    const userMaxScale = fitToScreenScale * this.config.maxScale
    const originalSizeScale = 1
    const effectiveMaxScale = Math.max(userMaxScale, originalSizeScale)

    // 计算瓦片系统的内存使用
    const tileMemoryMB = this.tileCache.size * 4 // 简化估算，每个瓦片约 4MB
    const totalMemoryMB = tileMemoryMB + this.lodTextures.size * 16 // LOD 纹理约 16MB
    const memoryBudget = 256 // 256MB 预算

    // 收集瓦片系统调试信息
    const tileSystemInfo = {
      cacheSize: this.tileCache.size,
      visibleTiles: this.currentVisibleTiles.size,
      loadingTiles: this.loadingTiles.size,
      pendingRequests: this.pendingTileRequests.length,
      cacheLimit: TILE_CACHE_SIZE,
      maxTilesPerFrame: MAX_TILES_PER_FRAME,
      tileSize: TILE_SIZE,
      cacheKeys: Array.from(this.tileCache.keys()),
      visibleKeys: Array.from(this.currentVisibleTiles),
      loadingKeys: Array.from(this.loadingTiles.keys()),
      pendingKeys: this.pendingTileRequests.map(req => req.key),
    }

    this.onDebugUpdate.current({
      scale: this.scale,
      relativeScale,
      translateX: this.translateX,
      translateY: this.translateY,
      currentLOD: this.currentLOD,
      lodLevels: SIMPLE_LOD_LEVELS.length,
      canvasSize: { width: this.canvasWidth, height: this.canvasHeight },
      imageSize: { width: this.imageWidth, height: this.imageHeight },
      fitToScreenScale,
      userMaxScale,
      effectiveMaxScale,
      originalSizeScale,
      renderCount: performance.now(),
      maxTextureSize: this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE),
      quality: this.currentQuality,
      isLoading: this.isLoadingTexture,
      memory: {
        textures: totalMemoryMB,
        estimated: totalMemoryMB,
        budget: memoryBudget,
        pressure: (totalMemoryMB / memoryBudget) * 100,
        activeLODs: this.lodTextures.size,
        maxConcurrentLODs: 3,
        onDemandStrategy: true,
      },
      tileOutlinesEnabled: this.tileOutlineEnabled,
      tileSystem: tileSystemInfo,
    })
  }

  private notifyLoadingStateChange(
    isLoading: boolean,

    state?: LoadingState,
    quality?: 'high' | 'medium' | 'low' | 'unknown',
  ) {
    if (this.onLoadingStateChange) {
      this.onLoadingStateChange(isLoading, state, quality || this.currentQuality)
    }
  }
}
