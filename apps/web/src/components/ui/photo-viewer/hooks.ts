import { LoadingState } from '@afilmory/webgl-viewer'
import type { TFunction } from 'i18next'
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  MenuItemSeparator,
  MenuItemText,
} from '~/atoms/context-menu'
import { isMobileDevice } from '~/lib/device-viewport'
import { ImageLoaderManager } from '~/lib/image-loader-manager'

import type { LivePhotoVideoHandle } from './LivePhotoVideo'
import type { LoadingIndicatorRef } from './LoadingIndicator'
import type {
  ProgressiveImageState,
} from './types'
import { SHOW_SCALE_INDICATOR_DURATION } from './types'

export const useProgressiveImageState = (): [
  ProgressiveImageState,
  {
    setBlobSrc: (src: string | null) => void
    setHighResLoaded: (loaded: boolean) => void
    setError: (error: boolean) => void
    setIsHighResImageRendered: (rendered: boolean) => void
    setCurrentScale: (scale: number) => void
    setShowScaleIndicator: (show: boolean) => void
    setIsThumbnailLoaded: (loaded: boolean) => void
    setIsLivePhotoPlaying: (playing: boolean) => void
  },
] => {
  const [blobSrc, setBlobSrc] = useState<string | null>(null)
  const [highResLoaded, setHighResLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [isHighResImageRendered, setIsHighResImageRendered] = useState(false)
  const [currentScale, setCurrentScale] = useState(1)
  const [showScaleIndicator, setShowScaleIndicator] = useState(false)
  const [isThumbnailLoaded, setIsThumbnailLoaded] = useState(false)
  const [isLivePhotoPlaying, setIsLivePhotoPlaying] = useState(false)

  return [
    {
      blobSrc,
      highResLoaded,
      error,
      isHighResImageRendered,
      currentScale,
      showScaleIndicator,
      isThumbnailLoaded,
      isLivePhotoPlaying,
    },
    {
      setBlobSrc,
      setHighResLoaded,
      setError,
      setIsHighResImageRendered,
      setCurrentScale,
      setShowScaleIndicator,
      setIsThumbnailLoaded,
      setIsLivePhotoPlaying,
    },
  ]
}

export const useImageLoader = (
  src: string,
  isCurrentImage: boolean,
  highResLoaded: boolean,
  error: boolean,
  onProgress?: (progress: number) => void,
  onError?: () => void,
  onBlobSrcChange?: (blobSrc: string | null) => void,
  loadingIndicatorRef?: React.RefObject<LoadingIndicatorRef | null>,
  setBlobSrc?: (src: string | null) => void,
  setHighResLoaded?: (loaded: boolean) => void,
  setError?: (error: boolean) => void,
  setIsHighResImageRendered?: (rendered: boolean) => void,
) => {
  const { t } = useTranslation()
  const imageLoaderManagerRef = useRef<ImageLoaderManager | null>(null)

  useEffect(() => {
    if (highResLoaded || error || !isCurrentImage) return

    // Create new image loader manager
    const imageLoaderManager = new ImageLoaderManager()
    imageLoaderManagerRef.current = imageLoaderManager

    function cleanup() {
      setHighResLoaded?.(false)
      setBlobSrc?.(null)
      setError?.(false)
      onBlobSrcChange?.(null)
      setIsHighResImageRendered?.(false)

      // Reset loading indicator
      loadingIndicatorRef?.current?.resetLoadingState()
    }

    const loadImage = async () => {
      try {
        const result = await imageLoaderManager.loadImage(src, {
          onProgress,
          onError,
          onLoadingStateUpdate: (state) => {
            loadingIndicatorRef?.current?.updateLoadingState(state)
          },
        })

        setBlobSrc?.(result.blobSrc)
        onBlobSrcChange?.(result.blobSrc)
        setHighResLoaded?.(true)
      } catch (loadError) {
        console.error('Failed to load image:', loadError)
        setError?.(true)

        // 显示错误状态，而不是完全隐藏图片
        loadingIndicatorRef?.current?.updateLoadingState({
          isVisible: true,
          isError: true,
          errorMessage: t('photo.error.loading'),
        })
      }
    }

    cleanup()
    loadImage()

    return () => {
      imageLoaderManager.cleanup()
    }
  }, [
    highResLoaded,
    error,
    onProgress,
    src,
    onError,
    isCurrentImage,
    onBlobSrcChange,
    loadingIndicatorRef,
    t,
    setBlobSrc,
    setHighResLoaded,
    setError,
    setIsHighResImageRendered,
  ])

  return imageLoaderManagerRef
}

export const useScaleIndicator = (
  onZoomChange?: (isZoomed: boolean) => void,
  setCurrentScale?: (scale: number) => void,
  setShowScaleIndicator?: (show: boolean) => void,
) => {
  const scaleIndicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleScaleChange = useCallback(
    (scale: number, isZoomed: boolean) => {
      // 更新缩放倍率并显示提示
      startTransition(() => {
        setCurrentScale?.(scale)
        setShowScaleIndicator?.(true)
      })

      // 清除之前的定时器
      if (scaleIndicatorTimeoutRef.current) {
        clearTimeout(scaleIndicatorTimeoutRef.current)
      }

      scaleIndicatorTimeoutRef.current = setTimeout(() => {
        setShowScaleIndicator?.(false)
      }, SHOW_SCALE_INDICATOR_DURATION)

      onZoomChange?.(isZoomed)
    },
    [onZoomChange, setCurrentScale, setShowScaleIndicator],
  )

  // WebGL Image Viewer 的缩放变化处理
  const onTransformed = useCallback(
    (originalScale: number, relativeScale: number) => {
      const isZoomed = Math.abs(relativeScale - 1) > 0.01
      handleScaleChange(originalScale, isZoomed)
    },
    [handleScaleChange],
  )

  // DOM Image Viewer 的缩放变化处理
  const onDOMTransformed = useCallback(
    (isZoomed: boolean, scale: number) => {
      handleScaleChange(scale, isZoomed)
    },
    [handleScaleChange],
  )

  return { onTransformed, onDOMTransformed }
}

export const useLivePhotoControls = (
  isLivePhoto: boolean,
  isLivePhotoPlaying: boolean,
  livePhotoRef: React.RefObject<LivePhotoVideoHandle | null>,
) => {
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)

  const handleLongPressStart = useCallback(() => {
    if (!isMobileDevice) return
    const playVideo = () => livePhotoRef.current?.play()
    if (
      !isLivePhoto ||
      !livePhotoRef.current?.getIsVideoLoaded() ||
      isLivePhotoPlaying
    ) {
      return
    }
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
    }
    longPressTimerRef.current = setTimeout(playVideo, 200)
  }, [isLivePhoto, isLivePhotoPlaying, livePhotoRef])

  const handleLongPressEnd = useCallback(() => {
    if (!isMobileDevice) return
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
    }
    if (isLivePhotoPlaying) {
      livePhotoRef.current?.stop()
    }
  }, [isLivePhotoPlaying, livePhotoRef])

  return { handleLongPressStart, handleLongPressEnd }
}

export const useWebGLLoadingState = (
  loadingIndicatorRef: React.RefObject<LoadingIndicatorRef | null>,
) => {
  const { t } = useTranslation()

  const handleWebGLLoadingStateChange = useCallback(
    (
      isLoading: boolean,
      state?: LoadingState,
      quality?: 'high' | 'medium' | 'low' | 'unknown',
    ) => {
      let message = ''

      if (state === LoadingState.CREATE_TEXTURE) {
        message = t('photo.webgl.creatingTexture')
      } else if (state === LoadingState.IMAGE_LOADING) {
        message = t('photo.webgl.loadingImage')
      }

      loadingIndicatorRef.current?.updateLoadingState({
        isVisible: isLoading,
        isWebGLLoading: isLoading,
        webglMessage: message,
        webglQuality: quality,
      })
    },
    [t, loadingIndicatorRef],
  )

  return handleWebGLLoadingStateChange
}

export const createContextMenuItems = (
  blobSrc: string,
  alt: string,
  t: TFunction<'app', undefined>,
) => [
  new MenuItemText({
    label: t('photo.copy.image'),
    click: async () => {
      const loadingToast = toast.loading(t('photo.copying'))

      try {
        // Create a canvas to convert the image to PNG
        const img = new Image()
        img.crossOrigin = 'anonymous'

        await new Promise((resolve, reject) => {
          img.onload = resolve
          img.onerror = reject
          img.src = blobSrc
        })

        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight

        ctx?.drawImage(img, 0, 0)

        // Convert to PNG blob
        await new Promise<void>((resolve, reject) => {
          canvas.toBlob(async (pngBlob) => {
            try {
              if (pngBlob) {
                await navigator.clipboard.write([
                  new ClipboardItem({
                    'image/png': pngBlob,
                  }),
                ])
                resolve()
              } else {
                reject(new Error('Failed to convert image to PNG'))
              }
            } catch (error) {
              reject(error)
            }
          }, 'image/png')
        })

        toast.dismiss(loadingToast)
        toast.success(t('photo.copy.success'))
      } catch (error) {
        console.error('Failed to copy image:', error)

        // Fallback: try to copy the original blob
        try {
          const blob = await fetch(blobSrc).then((res) => res.blob())
          await navigator.clipboard.write([
            new ClipboardItem({
              [blob.type]: blob,
            }),
          ])
          toast.dismiss(loadingToast)
          toast.success(t('photo.copy.success'))
        } catch (fallbackError) {
          console.error('Fallback copy also failed:', fallbackError)
          toast.dismiss(loadingToast)
          toast.error(t('photo.copy.error'))
        }
      }
    },
  }),
  MenuItemSeparator.default,
  new MenuItemText({
    label: t('photo.download'),
    click: () => {
      const a = document.createElement('a')
      a.href = blobSrc
      a.download = alt
      a.click()
    },
  }),
]
