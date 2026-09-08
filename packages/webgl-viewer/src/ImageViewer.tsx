import * as React from 'react'
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'

import {
  defaultAlignmentAnimation,
  defaultDoubleClickConfig,
  defaultPanningConfig,
  defaultPinchConfig,
  defaultVelocityAnimation,
  defaultWheelConfig,
} from './constants'
import DebugInfoComponent from './DebugInfo'
import type { DebugInfo, ImageViewerOptions, ImageViewerRef, ImageViewportState } from './interface'
import { WebGLImageViewerEngine } from './WebGLImageViewerEngine'
import { WebGPUImageViewerEngine } from './WebGPUImageViewerEngine'

export interface ImageViewerProps extends ImageViewerOptions {
  alt?: string
  onLoad?: () => void
  onError?: (error: Error) => void
  onHDRChange?: (hdr: boolean) => void
  onRendererChange?: (renderer: 'webgpu' | 'webgl') => void
}

export const ImageViewer = ({
  ref,
  src,
  className = '',
  alt = '',
  onLoad,
  onError,
  onHDRChange,
  onRendererChange,
  width,
  height,
  initialScale = 1,
  minScale = 0.1,
  maxScale = 10,
  wheel = defaultWheelConfig,
  pinch = defaultPinchConfig,
  doubleClick = defaultDoubleClickConfig,
  panning = defaultPanningConfig,
  limitToBounds = true,
  centerOnInit = true,
  smooth = true,
  alignmentAnimation = defaultAlignmentAnimation,
  velocityAnimation = defaultVelocityAnimation,
  onZoomChange,
  onViewportChange,
  onImageCopied,
  onLoadingStateChange,
  debug = false,
  ...divProps
}: ImageViewerProps
  & Omit<React.HTMLAttributes<HTMLDivElement>, keyof ImageViewerProps> & {
    ref?: React.RefObject<ImageViewerRef | null>
  }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<WebGLImageViewerEngine | WebGPUImageViewerEngine | null>(null)
  const [tileOutlineEnabled, setTileOutlineEnabled] = useState(false)
  const [renderer, setRenderer] = useState<'webgpu' | 'webgl'>(() =>
    typeof navigator !== 'undefined' && navigator.gpu ? 'webgpu' : 'webgl')
  const savedViewportRef = useRef<{ src: string, viewport: ImageViewportState } | null>(null)
  const lifecycleRef = useRef({ onLoad, onError, onHDRChange, onRendererChange })
  lifecycleRef.current = { onLoad, onError, onHDRChange, onRendererChange }

  const setDebugInfoRef = useRef<(debugInfo: DebugInfo) => void>(() => {})
  const debugEnabled = Boolean(debug)

  const mergedWheel = useMemo(
    () => ({
      ...defaultWheelConfig,
      ...wheel,
    }),
    [wheel],
  )

  const mergedPinch = useMemo(
    () => ({
      ...defaultPinchConfig,
      ...pinch,
    }),
    [pinch],
  )

  const mergedDoubleClick = useMemo(
    () => ({
      ...defaultDoubleClickConfig,
      ...doubleClick,
    }),
    [doubleClick],
  )

  const mergedPanning = useMemo(
    () => ({
      ...defaultPanningConfig,
      ...panning,
    }),
    [panning],
  )

  const mergedAlignmentAnimation = useMemo(
    () => ({
      ...defaultAlignmentAnimation,
      ...alignmentAnimation,
    }),
    [alignmentAnimation],
  )

  const mergedVelocityAnimation = useMemo(
    () => ({
      ...defaultVelocityAnimation,
      ...velocityAnimation,
    }),
    [velocityAnimation],
  )

  const callbacksRef = useRef<
    Pick<Required<ImageViewerOptions>, 'onZoomChange' | 'onViewportChange' | 'onImageCopied' | 'onLoadingStateChange'>
  >({
    onZoomChange: onZoomChange || (() => {}),
    onViewportChange: onViewportChange || (() => {}),
    onImageCopied: onImageCopied || (() => {}),
    onLoadingStateChange: onLoadingStateChange || (() => {}),
  })

  callbacksRef.current = {
    onZoomChange: onZoomChange || (() => {}),
    onViewportChange: onViewportChange || (() => {}),
    onImageCopied: onImageCopied || (() => {}),
    onLoadingStateChange: onLoadingStateChange || (() => {}),
  }

  const interactionConfigRef = useRef<
    Pick<Required<ImageViewerOptions>, 'wheel' | 'pinch' | 'doubleClick' | 'panning'>
  >({
    wheel: mergedWheel,
    pinch: mergedPinch,
    doubleClick: mergedDoubleClick,
    panning: mergedPanning,
  })

  interactionConfigRef.current = {
    wheel: mergedWheel,
    pinch: mergedPinch,
    doubleClick: mergedDoubleClick,
    panning: mergedPanning,
  }

  useImperativeHandle(ref, () => ({
    zoomIn: (animated?: boolean) => viewerRef.current?.zoomIn(animated),
    zoomOut: (animated?: boolean) => viewerRef.current?.zoomOut(animated),
    resetView: () => viewerRef.current?.resetView(),
    getScale: () => viewerRef.current?.getScale() || 1,
  }))

  useEffect(() => {
    if (!canvasRef.current) {
      return
    }

    let disposed = false
    let failed = false
    let engine: WebGLImageViewerEngine | WebGPUImageViewerEngine | null = null
    const fail = (reason: unknown) => {
      if (disposed || failed) {
        return
      }
      failed = true
      const error = reason instanceof Error ? reason : new Error(String(reason))
      const viewport = engine?.getViewport()
      if (viewport && Number.isFinite(viewport.relativeScale) && viewport.imageWidth > 0) {
        savedViewportRef.current = { src, viewport }
      }
      engine?.destroy()
      if (viewerRef.current === engine) {
        viewerRef.current = null
      }
      lifecycleRef.current.onHDRChange?.(false)
      if (renderer === 'webgpu') {
        console.warn('WebGPU viewer failed; falling back to WebGL', error)
        setRenderer('webgl')
      }
      else {
        callbacksRef.current.onLoadingStateChange(false)
        lifecycleRef.current.onError?.(error)
      }
    }
    const config: Required<ImageViewerOptions> = {
      src,
      className: '',
      width: width || 0,
      height: height || 0,
      initialScale,
      minScale,
      maxScale,
      wheel: interactionConfigRef.current.wheel,
      pinch: interactionConfigRef.current.pinch,
      doubleClick: interactionConfigRef.current.doubleClick,
      panning: interactionConfigRef.current.panning,
      limitToBounds,
      centerOnInit,
      smooth,
      alignmentAnimation: mergedAlignmentAnimation,
      velocityAnimation: mergedVelocityAnimation,
      onZoomChange: callbacksRef.current.onZoomChange,
      onViewportChange: callbacksRef.current.onViewportChange,
      onImageCopied: callbacksRef.current.onImageCopied,
      onLoadingStateChange: callbacksRef.current.onLoadingStateChange,
      debug: debugEnabled,
    }
    try {
      engine
        = renderer === 'webgpu'
          ? new WebGPUImageViewerEngine(
              canvasRef.current,
              config,
              fail,
              (hdr) => {
                if (!disposed && !failed) {
                  lifecycleRef.current.onHDRChange?.(hdr)
                }
              },
              debugEnabled ? setDebugInfoRef : undefined,
            )
          : new WebGLImageViewerEngine(canvasRef.current, config, debugEnabled ? setDebugInfoRef : undefined)
      viewerRef.current = engine
      setTileOutlineEnabled(engine.isTileOutlineEnabled())
      void engine
        .loadImage(new URL(src, document.baseURI).href, width, height)
        .then(() => {
          if (disposed || failed || !engine) {
            return
          }
          if (savedViewportRef.current?.src === src) {
            engine.restoreViewport(savedViewportRef.current.viewport)
          }
          savedViewportRef.current = null
          lifecycleRef.current.onRendererChange?.(renderer)
          lifecycleRef.current.onHDRChange?.(
            renderer === 'webgpu' && engine instanceof WebGPUImageViewerEngine && engine.isHDR,
          )
          lifecycleRef.current.onLoad?.()
        })
        .catch(fail)
    }
    catch (error) {
      fail(error)
    }
    return () => {
      disposed = true
      engine?.destroy()
      if (viewerRef.current === engine) {
        viewerRef.current = null
      }
    }
  }, [
    renderer,
    src,
    width,
    height,
    initialScale,
    minScale,
    maxScale,
    limitToBounds,
    centerOnInit,
    smooth,
    mergedAlignmentAnimation,
    mergedVelocityAnimation,
    debugEnabled,
  ])

  useEffect(() => {
    viewerRef.current?.updateCallbacks(callbacksRef.current)
  }, [onZoomChange, onViewportChange, onImageCopied, onLoadingStateChange])

  useEffect(() => {
    viewerRef.current?.updateInteractionConfig(interactionConfigRef.current)
  }, [mergedWheel, mergedPinch, mergedDoubleClick, mergedPanning])

  const handleOutlineToggle = useCallback(
    (enabled: boolean) => {
      setTileOutlineEnabled(enabled)
      viewerRef.current?.setTileOutlineEnabled(enabled)
    },
    [setTileOutlineEnabled],
  )

  return (
    <div
      {...divProps}
      data-image-renderer={renderer}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        ...divProps.style,
      }}
    >
      <canvas
        key={renderer}
        ref={canvasRef}
        role="img"
        aria-label={alt || undefined}
        className={className}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          touchAction: 'none',
          border: 'none',
          outline: 'none',
          margin: 0,
          padding: 0,
        }}
      />
      {debug && (
        <DebugInfoComponent
          outlineEnabled={tileOutlineEnabled}
          onToggleOutline={handleOutlineToggle}
          ref={(e) => {
            if (e) {
              setDebugInfoRef.current = e.updateDebugInfo
            }
          }}
        />
      )}
    </div>
  )
}
ImageViewer.displayName = 'ImageViewer'

export { type ImageViewerOptions, type ImageViewerRef } from './interface'
