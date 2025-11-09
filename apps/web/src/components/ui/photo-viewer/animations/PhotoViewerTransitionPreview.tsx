import { Thumbhash } from '@afilmory/ui'
import { Spring } from '@afilmory/utils'
import { m } from 'motion/react'

import type { PhotoViewerTransition } from './types'

interface PhotoViewerTransitionPreviewProps {
  transition: PhotoViewerTransition
  onComplete: () => void
}

export const PhotoViewerTransitionPreview = ({ transition, onComplete }: PhotoViewerTransitionPreviewProps) => {
  const baseTransition = Spring.snappy(0.5)
  const thumbHash = typeof transition.thumbHash === 'string' ? transition.thumbHash : null

  return (
    <m.div
      className="pointer-events-none fixed top-0 left-0 z-40"
      data-variant={`photo-viewer-transition-${transition.variant}`}
      initial={{
        x: transition.from.left,
        y: transition.from.top,
        width: transition.from.width,
        height: transition.from.height,
        borderRadius: transition.from.borderRadius,
        opacity: 1,
      }}
      animate={{
        x: transition.to.left,
        y: transition.to.top,
        width: transition.to.width,
        height: transition.to.height,
        borderRadius: transition.to.borderRadius,
        opacity: 1,
      }}
      transition={baseTransition}
      onAnimationComplete={onComplete}
    >
      <div className="relative h-full w-full overflow-hidden bg-black">
        {thumbHash && (
          <Thumbhash thumbHash={thumbHash} className="pointer-events-none absolute inset-0 h-full w-full" />
        )}
        <img
          src={transition.imageSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      </div>
    </m.div>
  )
}
