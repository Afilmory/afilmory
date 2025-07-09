import { useCallback, useState } from 'react'
import { useInView } from 'react-intersection-observer'

import { Thumbhash } from '~/components/ui/thumbhash'
import { clsxm } from '~/lib/cn'

export interface LazyImageProps {
  src: string
  alt: string
  thumbHash?: string | null
  className?: string
  style?: React.CSSProperties
  onLoad?: () => void
  onError?: () => void
  // Intersection observer options
  rootMargin?: string
  threshold?: number
}

export const LazyImage = ({
  src,
  alt,
  thumbHash,
  className,
  style,
  onLoad,
  onError,
  rootMargin = '50px',
  threshold = 0.1,
}: LazyImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)

  const { ref, inView } = useInView({
    triggerOnce: true,
    rootMargin,
    threshold,
  })

  const handleLoad = useCallback(() => {
    setIsLoaded(true)
    onLoad?.()
  }, [onLoad])

  const handleError = useCallback(() => {
    setHasError(true)
    onError?.()
  }, [onError])

  const shouldLoadImage = inView && !hasError

  return (
    <div
      ref={ref}
      className={clsxm('relative overflow-hidden', className)}
      style={style}
    >
      {/* Thumbhash placeholder */}
      {thumbHash && !isLoaded && (
        <Thumbhash
          thumbHash={thumbHash}
          className="absolute inset-0 scale-110 blur-sm"
        />
      )}

      {/* Actual image */}
      {shouldLoadImage && (
        <img
          src={src}
          alt={alt}
          className={clsxm(
            'h-full w-full object-cover transition-opacity duration-300',
            isLoaded ? 'opacity-100' : 'opacity-0',
          )}
          onLoad={handleLoad}
          onError={handleError}
          loading="lazy"
        />
      )}

      {/* Error state */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-200 dark:bg-gray-800">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Failed to load image
          </span>
        </div>
      )}
    </div>
  )
}
