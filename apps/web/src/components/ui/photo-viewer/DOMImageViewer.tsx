import type { FC } from 'react'
import { useCallback, useEffect, useRef } from 'react'
import type {
  ReactZoomPanPinchRef,
  ReactZoomPanPinchState,
} from 'react-zoom-pan-pinch'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'

import { clsxm } from '~/lib/cn'

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
  const onTransformed = useCallback(
    (
      transformRef: ReactZoomPanPinchRef,
      state: Omit<ReactZoomPanPinchState, 'previousScale'>,
    ) => {
      // 当缩放比例不等于 1 时，认为图片被缩放了
      const isZoomed = state.scale !== 1
      onZoomChange?.(isZoomed, state.scale)
    },
    [onZoomChange],
  )
  const transformRef = useRef<ReactZoomPanPinchRef>(null)

  useEffect(() => {
    const activeRef = ref || transformRef;
    if (activeRef?.current) {
      activeRef.current.resetTransform();
    }
  }, [src, ref])

  return (
    <TransformWrapper
      ref={ref || transformRef}
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
        step: 2,
        mode: 'toggle',
        animationTime: 200,
        animationType: 'easeInOutCubic',
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
  )
}
