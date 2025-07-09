import { m, useAnimationControls } from 'motion/react'
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

import { clsxm } from '~/lib/cn'
import type { ImageLoaderManager } from '~/lib/image-loader-manager'

import type { LoadingIndicatorRef } from './LoadingIndicator'

interface LivePhotoVideoProps {
  /** Live Photo 视频 URL */
  videoUrl: string
  /** 图片加载管理器实例 */
  imageLoaderManager: ImageLoaderManager
  /** 加载指示器引用 */
  loadingIndicatorRef: React.RefObject<LoadingIndicatorRef | null>
  /** 是否是当前图片 */
  isCurrentImage: boolean
  /** 自定义样式类名 */
  className?: string
  onPlayingChange?: (isPlaying: boolean) => void
}

export interface LivePhotoVideoHandle {
  play: () => void
  stop: () => void
  getIsVideoLoaded: () => boolean
}

export const LivePhotoVideo = ({
  ref,
  videoUrl,
  imageLoaderManager,
  loadingIndicatorRef,
  isCurrentImage,
  className,
  onPlayingChange,
}: LivePhotoVideoProps & {
  ref?: React.RefObject<LivePhotoVideoHandle | null>
}) => {
  const [isPlayingLivePhoto, setIsPlayingLivePhoto] = useState(false)
  const [livePhotoVideoLoaded, setLivePhotoVideoLoaded] = useState(false)
  const [isConvertingVideo, setIsConvertingVideo] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const videoAnimateController = useAnimationControls()

  useEffect(() => {
    onPlayingChange?.(isPlayingLivePhoto)
  }, [isPlayingLivePhoto, onPlayingChange])

  useEffect(() => {
    if (
      !isCurrentImage ||
      livePhotoVideoLoaded ||
      isConvertingVideo ||
      !videoRef.current
    ) {
      return
    }
    setIsConvertingVideo(true)
    const processVideo = async () => {
      try {
        await imageLoaderManager.processLivePhotoVideo(
          videoUrl,
          videoRef.current!,
          {
            onLoadingStateUpdate: (state) => {
              loadingIndicatorRef.current?.updateLoadingState(state)
            },
          },
        )

        setLivePhotoVideoLoaded(true)
      } catch (videoError) {
        console.error('Failed to process Live Photo video:', videoError)
      } finally {
        setIsConvertingVideo(false)
      }
    }
    processVideo()
  }, [
    isCurrentImage,
    livePhotoVideoLoaded,
    isConvertingVideo,
    videoUrl,
    imageLoaderManager,
    loadingIndicatorRef,
  ])

  useEffect(() => {
    if (!isCurrentImage) {
      setIsPlayingLivePhoto(false)
      setLivePhotoVideoLoaded(false)
      setIsConvertingVideo(false)

      videoAnimateController.set({ opacity: 0 })
    }
  }, [isCurrentImage, videoAnimateController])

  const play = useCallback(async () => {
    if (!livePhotoVideoLoaded || isPlayingLivePhoto || isConvertingVideo) return
    setIsPlayingLivePhoto(true)
    setTimeout(async () => {
      await videoAnimateController.start({
        opacity: 1,
        transition: { duration: 0.15, ease: 'easeOut' },
      })
      const video = videoRef.current
      if (video) {
        video.currentTime = 0
        video.play()
      }
    }, 0)
  }, [
    livePhotoVideoLoaded,
    isPlayingLivePhoto,
    isConvertingVideo,
    videoAnimateController,
  ])

  const stop = useCallback(async () => {
    if (!isPlayingLivePhoto) return
    const video = videoRef.current
    if (video) {
      video.pause()
      video.currentTime = 0
    }
    await videoAnimateController.start({
      opacity: 0,
      transition: { duration: 0.2, ease: 'easeIn' },
    })
    setIsPlayingLivePhoto(false)
  }, [isPlayingLivePhoto, videoAnimateController])

  useImperativeHandle(ref, () => ({
    play,
    stop,
    getIsVideoLoaded: () => livePhotoVideoLoaded,
  }))

  const handleVideoEnded = useCallback(() => {
    stop()
  }, [stop])

  return (
    <m.video
      ref={videoRef}
      className={clsxm(
        'pointer-events-none absolute inset-0 z-10 h-full w-full object-contain',
        className,
      )}
      style={{
        opacity: isPlayingLivePhoto ? 1 : 0,
        transition: 'opacity 0.2s ease-in-out',
      }}
      muted
      playsInline
      onEnded={handleVideoEnded}
      initial={{ opacity: 0 }}
      animate={videoAnimateController}
    />
  )
}

LivePhotoVideo.displayName = 'LivePhotoVideo'
