/**
 * WebGL图像查看器React组件
 *
 * 高性能的WebGL图像查看器组件
 */

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
import type { WebGLImageViewerProps, WebGLImageViewerRef } from './interface'
import { WebGLImageViewerEngine } from './WebGLImageViewerEngine'

/**
 * WebGL图像查看器组件
 */
export const WebGLImageViewer = ({
  ref,
  src,
  className = '',
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
  onImageCopied,
  onLoadingStateChange,
  debug = false,
  ...divProps
}: WebGLImageViewerProps &
  Omit<React.HTMLAttributes<HTMLDivElement>, 'className'> & {
    ref?: React.RefObject<WebGLImageViewerRef | null>
  }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<WebGLImageViewerEngine | null>(null)
  const [tileOutlineEnabled, setTileOutlineEnabled] = useState(false)

  const setDebugInfo = useRef((() => {}) as (debugInfo: any) => void)

  const config: Required<WebGLImageViewerProps> = useMemo(
    () => ({
      src,
      className,
      width: width || 0,
      height: height || 0,
      initialScale,
      minScale,
      maxScale,
      wheel: {
        ...defaultWheelConfig,
        ...wheel,
      },
      pinch: { ...defaultPinchConfig, ...pinch },
      doubleClick: { ...defaultDoubleClickConfig, ...doubleClick },
      panning: { ...defaultPanningConfig, ...panning },
      limitToBounds,
      centerOnInit,
      smooth,
      alignmentAnimation: {
        ...defaultAlignmentAnimation,
        ...alignmentAnimation,
      },
      velocityAnimation: { ...defaultVelocityAnimation, ...velocityAnimation },
      onZoomChange: onZoomChange || (() => {}),
      onImageCopied: onImageCopied || (() => {}),
      onLoadingStateChange: onLoadingStateChange || (() => {}),
      debug: debug || false,
    }),
    [
      src,
      className,
      width,
      height,
      initialScale,
      minScale,
      maxScale,
      wheel,
      pinch,
      doubleClick,
      panning,
      limitToBounds,
      centerOnInit,
      smooth,
      alignmentAnimation,
      velocityAnimation,
      onZoomChange,
      onImageCopied,
      onLoadingStateChange,
      debug,
    ],
  )

  useImperativeHandle(ref, () => ({
    zoomIn: (animated?: boolean) => viewerRef.current?.zoomIn(animated),
    zoomOut: (animated?: boolean) => viewerRef.current?.zoomOut(animated),
    resetView: () => viewerRef.current?.resetView(),
    getScale: () => viewerRef.current?.getScale() || 1,
  }))

  useEffect(() => {
    if (!canvasRef.current) return

    const webGLImageViewerEngine = new WebGLImageViewerEngine(
      canvasRef.current,
      config,
      debug ? setDebugInfo : undefined,
    )

    try {
      // 如果提供了尺寸，传递给loadImage进行优化
      const preknownWidth = config.width > 0 ? config.width : undefined
      const preknownHeight = config.height > 0 ? config.height : undefined
      webGLImageViewerEngine.loadImage(src, preknownWidth, preknownHeight).catch(console.error)
      viewerRef.current = webGLImageViewerEngine
      setTileOutlineEnabled(webGLImageViewerEngine.isTileOutlineEnabled())
    } catch (error) {
      console.error('Failed to initialize WebGL Image Viewer:', error)
    }

    return () => {
      webGLImageViewerEngine?.destroy()
      viewerRef.current = null
    }
  }, [src, config, debug])

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
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        ...divProps.style,
      }}
    >
      <canvas
        ref={canvasRef}
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
          // 对于像素艺术和小图片保持锐利，使用最新的标准属性
          imageRendering: 'pixelated',
        }}
      />
      {debug && (
        <DebugInfoComponent
          outlineEnabled={tileOutlineEnabled}
          onToggleOutline={handleOutlineToggle}
          ref={(e) => {
            if (e) {
              setDebugInfo.current = e.updateDebugInfo
            }
          }}
        />
      )}
    </div>
  )
}

// 设置显示名称用于React DevTools
WebGLImageViewer.displayName = 'WebGLImageViewer'

// 导出类型定义

export { type WebGLImageViewerProps, type WebGLImageViewerRef } from './interface'
