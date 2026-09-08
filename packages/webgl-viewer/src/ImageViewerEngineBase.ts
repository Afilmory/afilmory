import type { ViewportScaleInput } from './double-click-zoom'
import {
  computeFillScale,
  computeFitScale,
  resolveDoubleClickZoomStages,
  resolveNextDoubleClickScale,
} from './double-click-zoom'
import type { LoadingState } from './enum'
import type { ImageViewerOptions, ImageViewportState } from './interface'

export abstract class ImageViewerEngineBase {
  protected destroyed = false
  private animationFrameId: number | null = null

  constructor(canvas: HTMLCanvasElement, config: Required<ImageViewerOptions>) {
    this.canvas = canvas
    this.config = { ...config, smooth: config.smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches }
    this.onZoomChange = config.onZoomChange
    this.onViewportChange = config.onViewportChange
    this.onImageCopied = config.onImageCopied
    this.onLoadingStateChange = config.onLoadingStateChange
    this.boundHandleMouseDown = e => this.handleMouseDown(e)
    this.boundHandleMouseMove = e => this.handleMouseMove(e)
    this.boundHandleMouseUp = () => this.handleMouseUp()
    this.boundHandleWheel = e => this.handleWheel(e)
    this.boundHandleDoubleClick = e => this.handleDoubleClick(e)
    this.boundHandleTouchStart = e => this.handleTouchStart(e)
    this.boundHandleTouchMove = e => this.handleTouchMove(e)
    this.boundHandleTouchEnd = e => this.handleTouchEnd(e)
    this.boundResizeCanvas = () => this.resizeCanvas()
  }

  protected initializeViewport() {
    this.setupCanvas()
    this.setupEventListeners()
  }

  abstract loadImage(url: string, preknownWidth?: number, preknownHeight?: number): Promise<void>
  protected abstract render(): void
  protected abstract updateTileCache(): Promise<void>

  getViewport(): ImageViewportState {
    const fitToScreenScale = this.getFitToScreenScale()
    return {
      containerWidth: this.canvasWidth,
      containerHeight: this.canvasHeight,
      imageWidth: this.imageWidth,
      imageHeight: this.imageHeight,
      scale: this.scale,
      relativeScale: this.scale / fitToScreenScale,
      fitToScreenScale,
      translateX: this.translateX,
      translateY: this.translateY,
    }
  }

  restoreViewport(viewport: ImageViewportState) {
    if (!this.imageLoaded || viewport.imageWidth !== this.imageWidth || viewport.imageHeight !== this.imageHeight) {
      return
    }
    this.scale = viewport.scale
    this.translateX = viewport.translateX
    this.translateY = viewport.translateY
    this.constrainScaleAndPosition()
    this.notifyZoomChange()
    this.render()
    void this.updateTileCache()
  }

  destroy() {
    this.destroyed = true
    this.isAnimating = false
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
    }
    window.removeEventListener('resize', this.boundResizeCanvas)
    window.removeEventListener('mousemove', this.boundHandleMouseMove)
    window.removeEventListener('mouseup', this.boundHandleMouseUp)
    this.canvas.removeEventListener('mousedown', this.boundHandleMouseDown)
    this.canvas.removeEventListener('wheel', this.boundHandleWheel)
    this.canvas.removeEventListener('dblclick', this.boundHandleDoubleClick)
    this.canvas.removeEventListener('touchstart', this.boundHandleTouchStart)
    this.canvas.removeEventListener('touchmove', this.boundHandleTouchMove)
    this.canvas.removeEventListener('touchend', this.boundHandleTouchEnd)
    this.canvas.removeEventListener('touchcancel', this.boundHandleTouchEnd)
    this.resizeObserver?.disconnect()
  }

  protected canvas: HTMLCanvasElement

  protected imageLoaded = false

  protected originalImageSrc = ''

  protected scale = 1

  protected translateX = 0

  protected translateY = 0

  protected imageWidth = 0

  protected imageHeight = 0

  protected canvasWidth = 1

  protected canvasHeight = 1

  protected devicePixelRatio = 1

  protected isDragging = false

  protected lastMouseX = 0

  protected lastMouseY = 0

  protected lastTouchDistance = 0

  protected lastDoubleClickTime = 0

  protected lastTouchTime = 0

  protected lastTouchX = 0

  protected lastTouchY = 0

  protected isAnimating = false

  protected animationStartTime = 0

  protected animationDuration = 300

  protected startScale = 1

  protected targetScale = 1

  protected startTranslateX = 0

  protected startTranslateY = 0

  protected targetTranslateX = 0

  protected targetTranslateY = 0

  protected config: Required<ImageViewerOptions>

  protected onZoomChange?: (originalScale: number, relativeScale: number) => void

  protected onViewportChange?: (viewport: ImageViewportState) => void

  protected onImageCopied?: () => void

  protected onLoadingStateChange?: (
    isLoading: boolean,
    state?: LoadingState,
    quality?: 'high' | 'medium' | 'low' | 'unknown',
  ) => void

  protected boundHandleMouseDown: (e: MouseEvent) => void

  protected boundHandleMouseMove: (e: MouseEvent) => void

  protected boundHandleMouseUp: () => void

  protected boundHandleWheel: (e: WheelEvent) => void

  protected boundHandleDoubleClick: (e: MouseEvent) => void

  protected boundHandleTouchStart: (e: TouchEvent) => void

  protected boundHandleTouchMove: (e: TouchEvent) => void

  protected boundHandleTouchEnd: (e: TouchEvent) => void

  protected boundResizeCanvas: () => void

  protected lastViewportNotificationKey = ''

  protected resizeObserver: ResizeObserver | null = null

  protected setupCanvas() {
    this.resizeCanvas()
    window.addEventListener('resize', this.boundResizeCanvas)
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
    }
    this.resizeObserver = new ResizeObserver((e) => {
      if (e[0].target !== this.canvas) {
        return
      }

      this.boundResizeCanvas()
    })
    this.resizeObserver.observe(this.canvas)
  }

  protected resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect()
    this.devicePixelRatio = window.devicePixelRatio || 1

    if (rect.width <= 0 || rect.height <= 0) {
      return
    }
    const wasFit = Math.abs(this.scale / this.getFitToScreenScale() - 1) < 0.01
    this.canvasWidth = rect.width
    this.canvasHeight = rect.height

    const actualWidth = Math.round(rect.width * this.devicePixelRatio)
    const actualHeight = Math.round(rect.height * this.devicePixelRatio)

    this.canvas.width = actualWidth
    this.canvas.height = actualHeight

    if (this.imageLoaded) {
      if (wasFit) {
        this.fitImageToScreen()
      }
      this.constrainScaleAndPosition()
      this.render()
      this.notifyZoomChange()
    }
  }

  protected setupInitialScaling() {
    if (this.config.centerOnInit) {
      this.fitImageToScreen()
    }
    else {
      const fitToScreenScale = this.getFitToScreenScale()
      this.scale = fitToScreenScale * this.config.initialScale
    }
  }

  protected easeOutQuart(t: number): number {
    return 1 - (1 - t) ** 4
  }

  protected startAnimation(
    targetScale: number,
    targetTranslateX: number,
    targetTranslateY: number,
    animationTime?: number,
  ) {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
    }
    this.isAnimating = true
    this.animationStartTime = performance.now()
    this.animationDuration = this.config.smooth ? (animationTime ?? 300) : 0
    this.startScale = this.scale
    this.targetScale = targetScale
    this.startTranslateX = this.translateX
    this.startTranslateY = this.translateY
    this.targetTranslateX = targetTranslateX
    this.targetTranslateY = targetTranslateY
    const tempScale = this.scale
    const tempTranslateX = this.translateX
    const tempTranslateY = this.translateY

    this.scale = targetScale
    this.translateX = targetTranslateX
    this.translateY = targetTranslateY
    this.constrainImagePosition()

    this.targetTranslateX = this.translateX
    this.targetTranslateY = this.translateY
    this.scale = tempScale
    this.translateX = tempTranslateX
    this.translateY = tempTranslateY

    this.animate()
  }

  protected animate() {
    if (this.destroyed || !this.isAnimating) {
      return
    }

    const now = performance.now()
    const elapsed = now - this.animationStartTime
    const progress = this.animationDuration > 0 ? Math.min(elapsed / this.animationDuration, 1) : 1
    const easedProgress = this.config.smooth ? this.easeOutQuart(progress) : progress

    this.scale = this.startScale + (this.targetScale - this.startScale) * easedProgress
    this.translateX = this.startTranslateX + (this.targetTranslateX - this.startTranslateX) * easedProgress
    this.translateY = this.startTranslateY + (this.targetTranslateY - this.startTranslateY) * easedProgress

    this.render()
    this.notifyZoomChange()

    if (progress < 1) {
      this.animationFrameId = requestAnimationFrame(() => this.animate())
    }
    else {
      this.isAnimating = false
      this.scale = this.targetScale
      this.translateX = this.targetTranslateX
      this.translateY = this.targetTranslateY
      this.render()
      this.notifyZoomChange()
      this.updateTileCache()
    }
  }

  protected fitImageToScreen() {
    const fitToScreenScale = this.getFitToScreenScale()

    this.scale = fitToScreenScale * this.config.initialScale
    this.translateX = 0
    this.translateY = 0
  }

  protected getFitToScreenScale(): number {
    return computeFitScale(this.getViewportScaleInput())
  }

  protected getFillToScreenScale(): number {
    return computeFillScale(this.getViewportScaleInput())
  }

  protected getViewportScaleInput(): ViewportScaleInput {
    return {
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight,
      imageWidth: this.imageWidth,
      imageHeight: this.imageHeight,
    }
  }

  protected constrainImagePosition() {
    if (!this.config.limitToBounds) {
      return
    }

    const fitScale = this.getFitToScreenScale()

    if (this.scale <= fitScale) {
      this.translateX = 0
      this.translateY = 0
      return
    }

    const scaledWidth = this.imageWidth * this.scale
    const scaledHeight = this.imageHeight * this.scale
    const maxTranslateX = Math.max(0, (scaledWidth - this.canvasWidth) / 2)
    const maxTranslateY = Math.max(0, (scaledHeight - this.canvasHeight) / 2)

    this.translateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, this.translateX))
    this.translateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, this.translateY))
  }

  protected constrainScaleAndPosition() {
    const fitToScreenScale = this.getFitToScreenScale()
    const absoluteMinScale = fitToScreenScale * this.config.minScale
    const originalSizeScale = 1
    const userMaxScale = fitToScreenScale * this.config.maxScale
    const effectiveMaxScale = Math.max(userMaxScale, originalSizeScale)

    if (this.scale < absoluteMinScale) {
      this.scale = absoluteMinScale
    }
    else if (this.scale > effectiveMaxScale) {
      this.scale = effectiveMaxScale
    }

    this.constrainImagePosition()
  }

  public zoomIn(animated = false) {
    const centerX = this.canvasWidth / 2
    const centerY = this.canvasHeight / 2
    this.zoomAt(centerX, centerY, 1 + this.config.wheel.step, animated)
  }

  public zoomOut(animated = false) {
    const centerX = this.canvasWidth / 2
    const centerY = this.canvasHeight / 2
    this.zoomAt(centerX, centerY, 1 - this.config.wheel.step, animated)
  }

  public resetView() {
    const fitToScreenScale = this.getFitToScreenScale()
    const targetScale = fitToScreenScale * this.config.initialScale
    this.startAnimation(targetScale, 0, 0)
  }

  public getScale(): number {
    return this.scale
  }

  public updateCallbacks({
    onZoomChange,
    onViewportChange,
    onImageCopied,
    onLoadingStateChange,
  }: Pick<
    Required<ImageViewerOptions>,
    'onZoomChange' | 'onViewportChange' | 'onImageCopied' | 'onLoadingStateChange'
  >) {
    this.onZoomChange = onZoomChange
    this.onViewportChange = onViewportChange
    this.onImageCopied = onImageCopied
    this.onLoadingStateChange = onLoadingStateChange
    this.lastViewportNotificationKey = ''
    this.notifyViewportChange()
  }

  public updateInteractionConfig({
    wheel,
    pinch,
    doubleClick,
    panning,
  }: Pick<Required<ImageViewerOptions>, 'wheel' | 'pinch' | 'doubleClick' | 'panning'>) {
    this.config.wheel = wheel
    this.config.pinch = pinch
    this.config.doubleClick = doubleClick
    this.config.panning = panning

    if (panning.disabled) {
      this.isDragging = false
    }

    if (pinch.disabled) {
      this.lastTouchDistance = 0
    }
  }

  protected notifyZoomChange() {
    if (this.onZoomChange) {
      const originalScale = this.scale
      const fitToScreenScale = this.getFitToScreenScale()
      const relativeScale = this.scale / fitToScreenScale
      this.onZoomChange(originalScale, relativeScale)
    }
  }

  protected notifyViewportChange() {
    if (!this.onViewportChange || !this.imageLoaded) {
      return
    }

    const fitToScreenScale = this.getFitToScreenScale()
    const relativeScale = this.scale / fitToScreenScale
    const notificationKey = [
      this.canvasWidth,
      this.canvasHeight,
      this.imageWidth,
      this.imageHeight,
      this.scale,
      this.translateX,
      this.translateY,
    ].join(':')

    if (notificationKey === this.lastViewportNotificationKey) {
      return
    }

    this.lastViewportNotificationKey = notificationKey
    this.onViewportChange({
      containerWidth: this.canvasWidth,
      containerHeight: this.canvasHeight,
      imageWidth: this.imageWidth,
      imageHeight: this.imageHeight,
      scale: this.scale,
      relativeScale,
      fitToScreenScale,
      translateX: this.translateX,
      translateY: this.translateY,
    })
  }

  protected setupEventListeners() {
    this.canvas.addEventListener('mousedown', this.boundHandleMouseDown)
    window.addEventListener('mousemove', this.boundHandleMouseMove)
    window.addEventListener('mouseup', this.boundHandleMouseUp)
    this.canvas.addEventListener('wheel', this.boundHandleWheel, { passive: false })
    this.canvas.addEventListener('dblclick', this.boundHandleDoubleClick)
    this.canvas.addEventListener('touchstart', this.boundHandleTouchStart, { passive: false })
    this.canvas.addEventListener('touchmove', this.boundHandleTouchMove, { passive: false })
    this.canvas.addEventListener('touchend', this.boundHandleTouchEnd)
    this.canvas.addEventListener('touchcancel', this.boundHandleTouchEnd)
  }

  protected handleMouseDown(e: MouseEvent) {
    if (e.button !== 0 || !this.imageLoaded) {
      return
    }
    if (this.isAnimating) {
      this.isAnimating = false
    }
    if (this.config.panning.disabled) {
      return
    }

    this.isDragging = true
    this.lastMouseX = e.clientX
    this.lastMouseY = e.clientY
  }

  protected handleMouseMove(e: MouseEvent) {
    if (!this.isDragging || this.config.panning.disabled) {
      return
    }

    const deltaX = e.clientX - this.lastMouseX
    const deltaY = e.clientY - this.lastMouseY

    this.translateX += deltaX
    this.translateY += deltaY

    this.lastMouseX = e.clientX
    this.lastMouseY = e.clientY

    this.constrainImagePosition()
    this.render()
  }

  protected handleMouseUp() {
    this.isDragging = false
  }

  protected handleWheel(e: WheelEvent) {
    e.preventDefault()
    if (this.config.wheel.wheelDisabled) {
      return
    }

    if (this.isAnimating) {
      this.isAnimating = false
    }

    const rect = this.canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const scaleFactor = e.deltaY > 0 ? 1 - this.config.wheel.step : 1 + this.config.wheel.step
    this.zoomAt(mouseX, mouseY, scaleFactor)
  }

  protected handleDoubleClick(e: MouseEvent) {
    e.preventDefault()
    if (this.config.doubleClick.disabled) {
      return
    }

    const now = Date.now()
    if (now - this.lastDoubleClickTime < 300) {
      return
    }

    this.lastDoubleClickTime = now

    const rect = this.canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    this.performDoubleClickAction(mouseX, mouseY)
  }

  protected handleTouchStart(e: TouchEvent) {
    const canHandleSingleTouch
      = e.touches.length === 1 && (!this.config.panning.disabled || !this.config.doubleClick.disabled)
    const canHandlePinch = e.touches.length === 2 && !this.config.pinch.disabled

    if (!canHandleSingleTouch && !canHandlePinch) {
      return
    }

    e.preventDefault()

    if (this.isAnimating) {
      this.isAnimating = false
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0]
      const now = Date.now()
      if (
        !this.config.doubleClick.disabled
        && now - this.lastTouchTime < 300
        && Math.abs(touch.clientX - this.lastTouchX) < 50
        && Math.abs(touch.clientY - this.lastTouchY) < 50
      ) {
        this.handleTouchDoubleTap(touch.clientX, touch.clientY)
        this.lastTouchTime = 0
        return
      }

      if (!this.config.panning.disabled) {
        this.isDragging = true
        this.lastMouseX = touch.clientX
        this.lastMouseY = touch.clientY
      }

      this.lastTouchTime = now
      this.lastTouchX = touch.clientX
      this.lastTouchY = touch.clientY
    }
    else if (e.touches.length === 2 && !this.config.pinch.disabled) {
      this.isDragging = false
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      this.lastTouchDistance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY)
    }
  }

  protected handleTouchMove(e: TouchEvent) {
    if (e.touches.length === 1 && this.isDragging && !this.config.panning.disabled) {
      e.preventDefault()

      const deltaX = e.touches[0].clientX - this.lastMouseX
      const deltaY = e.touches[0].clientY - this.lastMouseY

      this.translateX += deltaX
      this.translateY += deltaY

      this.lastMouseX = e.touches[0].clientX
      this.lastMouseY = e.touches[0].clientY

      this.constrainImagePosition()
      this.render()
    }
    else if (e.touches.length === 2 && !this.config.pinch.disabled) {
      e.preventDefault()

      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const distance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY)

      if (this.lastTouchDistance > 0) {
        const scaleFactor = distance / this.lastTouchDistance
        const centerX = (touch1.clientX + touch2.clientX) / 2
        const centerY = (touch1.clientY + touch2.clientY) / 2

        const rect = this.canvas.getBoundingClientRect()
        this.zoomAt(centerX - rect.left, centerY - rect.top, scaleFactor)
      }

      this.lastTouchDistance = distance
    }
  }

  protected handleTouchEnd(_e: TouchEvent) {
    this.isDragging = false
    this.lastTouchDistance = 0
  }

  protected handleTouchDoubleTap(clientX: number, clientY: number) {
    if (this.config.doubleClick.disabled) {
      return
    }

    const rect = this.canvas.getBoundingClientRect()
    const touchX = clientX - rect.left
    const touchY = clientY - rect.top

    this.performDoubleClickAction(touchX, touchY)
  }

  protected performDoubleClickAction(x: number, y: number) {
    this.isAnimating = false

    if (this.config.doubleClick.mode !== 'toggle') {
      this.zoomAt(x, y, this.config.doubleClick.step, true)
      return
    }

    const fitToScreenScale = this.getFitToScreenScale()
    const absoluteMinScale = fitToScreenScale * this.config.minScale
    const userMaxScale = fitToScreenScale * this.config.maxScale
    const effectiveMaxScale = Math.max(userMaxScale, 1)
    const originalSizeScale = Math.max(absoluteMinScale, Math.min(effectiveMaxScale, 1))

    const stages = resolveDoubleClickZoomStages({
      fitScale: fitToScreenScale,
      fillScale: this.getFillToScreenScale(),
      originalScale: originalSizeScale,
    })
    const targetScale = resolveNextDoubleClickScale(this.scale, stages)

    const zoomX = (x - this.canvasWidth / 2 - this.translateX) / this.scale
    const zoomY = (y - this.canvasHeight / 2 - this.translateY) / this.scale
    const targetTranslateX = x - this.canvasWidth / 2 - zoomX * targetScale
    const targetTranslateY = y - this.canvasHeight / 2 - zoomY * targetScale

    this.startAnimation(targetScale, targetTranslateX, targetTranslateY, this.config.doubleClick.animationTime)
  }

  public zoomAt(x: number, y: number, scaleFactor: number, animated = false) {
    if (!this.imageLoaded || !Number.isFinite(scaleFactor) || scaleFactor <= 0) {
      return
    }
    const newScale = this.scale * scaleFactor
    const fitToScreenScale = this.getFitToScreenScale()
    const absoluteMinScale = fitToScreenScale * this.config.minScale
    const originalSizeScale = 1
    const userMaxScale = fitToScreenScale * this.config.maxScale
    const effectiveMaxScale = Math.max(userMaxScale, originalSizeScale)

    if (newScale < absoluteMinScale || newScale > effectiveMaxScale) {
      return
    }

    if (animated && this.config.smooth) {
      const zoomX = (x - this.canvasWidth / 2 - this.translateX) / this.scale
      const zoomY = (y - this.canvasHeight / 2 - this.translateY) / this.scale
      const targetTranslateX = x - this.canvasWidth / 2 - zoomX * newScale
      const targetTranslateY = y - this.canvasHeight / 2 - zoomY * newScale

      this.startAnimation(newScale, targetTranslateX, targetTranslateY)
    }
    else {
      const zoomX = (x - this.canvasWidth / 2 - this.translateX) / this.scale
      const zoomY = (y - this.canvasHeight / 2 - this.translateY) / this.scale

      this.scale = newScale
      this.translateX = x - this.canvasWidth / 2 - zoomX * this.scale
      this.translateY = y - this.canvasHeight / 2 - zoomY * this.scale

      this.constrainImagePosition()
      this.render()
      this.notifyZoomChange()
    }
  }

  async copyOriginalImageToClipboard() {
    try {
      const response = await fetch(this.originalImageSrc)
      const blob = await response.blob()

      if (!navigator.clipboard || !navigator.clipboard.write) {
        console.warn('Clipboard API not supported')
        return
      }

      const clipboardItem = new ClipboardItem({ [blob.type]: blob })
      await navigator.clipboard.write([clipboardItem])

      if (this.onImageCopied) {
        this.onImageCopied()
      }
    }
    catch (error) {
      console.error('Failed to copy image to clipboard:', error)
    }
  }
}
