import { useCallback, useEffect, useRef, useState } from 'react'

interface ContainedImageFrameProps {
  width?: number
  height?: number
  className?: string
  children: React.ReactNode
}

export const ContainedImageFrame = ({ width, height, className, children }: ContainedImageFrameProps) => {
  const stageRef = useRef<HTMLDivElement>(null)
  const [imageFrame, setImageFrame] = useState<{ width: number, height: number } | null>(null)

  const updateImageFrame = useCallback(() => {
    const stage = stageRef.current
    if (!stage || !width || !height) {
      setImageFrame(null)
      return
    }

    const containerWidth = stage.clientWidth
    const containerHeight = stage.clientHeight
    if (!containerWidth || !containerHeight) {
      setImageFrame(null)
      return
    }

    const imageAspectRatio = width / height
    const containerAspectRatio = containerWidth / containerHeight

    let nextWidth = containerWidth
    let nextHeight = containerHeight

    if (containerAspectRatio > imageAspectRatio) {
      nextHeight = containerHeight
      nextWidth = containerHeight * imageAspectRatio
    }
    else {
      nextWidth = containerWidth
      nextHeight = containerWidth / imageAspectRatio
    }

    setImageFrame((current) => {
      if (current && Math.abs(current.width - nextWidth) < 0.5 && Math.abs(current.height - nextHeight) < 0.5) {
        return current
      }

      return {
        width: nextWidth,
        height: nextHeight,
      }
    })
  }, [height, width])

  useEffect(() => {
    updateImageFrame()

    const stage = stageRef.current
    if (!stage || typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(() => {
      updateImageFrame()
    })

    observer.observe(stage)
    return () => {
      observer.disconnect()
    }
  }, [updateImageFrame])

  return (
    <div
      ref={stageRef}
      className={className ?? 'relative flex h-full w-full items-center justify-center overflow-visible'}
    >
      <div
        className="relative shrink-0 overflow-visible"
        style={imageFrame ? { width: `${imageFrame.width}px`, height: `${imageFrame.height}px` } : undefined}
      >
        {children}
      </div>
    </div>
  )
}
