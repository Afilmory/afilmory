import { clsxm } from '@afilmory/utils'
import type { FC } from 'react'
import { useCallback, useEffect, useRef } from 'react'
import type { ReactZoomPanPinchRef, ReactZoomPanPinchState } from 'react-zoom-pan-pinch'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'

import type { DOMImageViewerProps } from './types'

export const DOMImageViewer: FC<DOMImageViewerProps> = ({
  ref,
  onZoomChange,
  minZoom,
  maxZoom,
  src,
  alt,
  highResLoaded,
  onLoad,
  children,
}) => {
  const transformRef = useRef<ReactZoomPanPinchRef>(null)
  // 兼容外部 ref
  const activeRef = ref || transformRef

  // 监听缩放变化
  const onTransformed = useCallback(
    (transformRef: ReactZoomPanPinchRef, state: Omit<ReactZoomPanPinchState, 'previousScale'>) => {
      // 计算实际缩放倍率（相对于原图尺寸）
      const { instance } = transformRef
      const wrapper = instance.wrapperComponent
      const img = wrapper?.querySelector('img') as HTMLImageElement | null
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        const containerWidth = wrapper?.clientWidth || 1
        const containerHeight = wrapper?.clientHeight || 1
        const fit = Math.min(containerWidth / img.naturalWidth, containerHeight / img.naturalHeight)
        const actualScale = state.scale * fit
        const isZoomed = Math.abs(actualScale - fit) > 0.01
        onZoomChange?.(isZoomed, actualScale)
      } else {
        const isZoomed = state.scale !== 1
        onZoomChange?.(isZoomed, state.scale)
      }
    },
    [onZoomChange],
  )

  useEffect(() => {
    if (activeRef?.current) {
      activeRef.current.resetTransform()
    }
  }, [src, ref, activeRef])

  // 双击切换 1x/fitToScreenScale，缩放中心为指针位置
  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const instance = activeRef.current?.instance
      if (!instance) return
      const wrapper = instance.wrapperComponent
      if (!wrapper) return
      const img = wrapper.querySelector('img') as HTMLImageElement | null
      if (!img || img.naturalWidth === 0 || img.naturalHeight === 0) return
      const containerRect = wrapper.getBoundingClientRect()
      // 指针在容器内的坐标
      const pointerX = event.clientX - containerRect.left
      const pointerY = event.clientY - containerRect.top
      const containerWidth = wrapper.clientWidth || 1
      const containerHeight = wrapper.clientHeight || 1
      const fit = Math.min(containerWidth / img.naturalWidth, containerHeight / img.naturalHeight)
      const scale0 = instance.transformState.scale
      const x0 = instance.transformState.positionX
      const y0 = instance.transformState.positionY
      // 判断当前是否为 fitToScreen 或 1x
      const isAtFit = Math.abs(scale0 - 1) < 0.01
      const isAt1x = Math.abs(scale0 * fit - 1) < 0.01
      if (isAtFit) {
        // fitToScreen -> 放大到 1x
        const scale1 = 1 / fit
        const x1 = pointerX - (pointerX - x0) * (scale1 / scale0)
        const y1 = pointerY - (pointerY - y0) * (scale1 / scale0)
        activeRef.current?.setTransform(x1, y1, scale1, 200, 'easeInOutCubic')
      } else if (isAt1x) {
        // 1x -> 回到 fitToScreen
        activeRef.current?.setTransform(0, 0, 1, 200, 'easeInOutCubic')
      }
    },
    [activeRef],
  )

  return (
    <div className="absolute inset-0 h-full w-full" onDoubleClick={handleDoubleClick}>
      <TransformWrapper
        ref={activeRef}
        initialScale={1}
        minScale={minZoom}
        maxScale={maxZoom}
        wheel={{
          step: 0.1,
        }}
        pinch={{
          step: 0.5,
        }}
        doubleClick={{
          disabled: true, // 禁用内置双击
        }}
        limitToBounds={true}
        centerOnInit={true}
        smooth={true}
        alignmentAnimation={{
          sizeX: 0,
          sizeY: 0,
          velocityAlignmentTime: 0.2,
        }}
        velocityAnimation={{
          sensitivity: 1,
          animationTime: 0.2,
        }}
        centerZoomedOut={true}
        onTransformed={onTransformed}
      >
        <TransformComponent
          wrapperClass="!w-full !h-full !absolute !inset-0"
          contentClass="!w-full !h-full flex items-center justify-center"
        >
          <img
            src={src || undefined}
            alt={alt}
            className={clsxm(
              'absolute inset-0 w-full h-full object-contain',
              highResLoaded ? 'opacity-100' : 'opacity-0',
            )}
            draggable={false}
            loading="eager"
            decoding="async"
            onLoad={onLoad}
          />
          {children}
        </TransformComponent>
      </TransformWrapper>
    </div>
  )
}
