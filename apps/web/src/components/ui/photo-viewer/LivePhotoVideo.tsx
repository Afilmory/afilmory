import { clsxm } from '@afilmory/utils'
import { m, useAnimationControls } from 'motion/react'
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

import type { ImageLoaderManager } from '~/lib/image-loader-manager'

import type { LoadingIndicatorRef } from './LoadingIndicator'
import type { VideoSource } from './types'

interface LivePhotoVideoProps {
  /** Video source (Live Photo or Motion Photo) */
  videoSource: VideoSource
  /** 图片加载管理器实例 */
  imageLoaderManager: ImageLoaderManager
  /** 加载指示器引用 */
  loadingIndicatorRef: React.RefObject<LoadingIndicatorRef | null>
  /** 是否是当前图片 */
  isCurrentImage: boolean
  /** 自定义样式类名 */
  className?: string
  onPlayingChange?: (isPlaying: boolean) => void
  /** 是否自动播放一次 */
  shouldAutoPlayOnce?: boolean
}

export interface LivePhotoVideoHandle {
  play: () => void
  stop: () => void
  getIsVideoLoaded: () => boolean
}

export const LivePhotoVideo = ({
  ref,
  videoSource,
  imageLoaderManager,
  loadingIndicatorRef,
  isCurrentImage,
  className,
  onPlayingChange,
  shouldAutoPlayOnce = false,
}: LivePhotoVideoProps & {
  ref?: React.RefObject<LivePhotoVideoHandle | null>
}) => {
  const [isPlayingLivePhoto, setIsPlayingLivePhoto] = useState(false)
  const [livePhotoVideoLoaded, setLivePhotoVideoLoaded] = useState(false)
  const [isConvertingVideo, setIsConvertingVideo] = useState(false)
  const hasAutoPlayedRef = useRef(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const videoAnimateController = useAnimationControls()

  useEffect(() => {
    onPlayingChange?.(isPlayingLivePhoto)
  }, [isPlayingLivePhoto, onPlayingChange])

  useEffect(() => {
    if (!isCurrentImage || livePhotoVideoLoaded || isConvertingVideo || !videoRef.current) {
      return
    }
    // 如果没有视频源，直接返回
    if (videoSource.type === 'none') {
      return
    }

    setIsConvertingVideo(true)
    const processVideo = async () => {
      try {
        await imageLoaderManager.processVideo(videoSource, videoRef.current!, {
          onLoadingStateUpdate: (state) => {
            loadingIndicatorRef.current?.updateLoadingState(state)
          },
        })

        setLivePhotoVideoLoaded(true)
      } catch (videoError) {
        console.error('Failed to process video:', videoError)
      } finally {
        setIsConvertingVideo(false)
      }
    }
    processVideo()
  }, [isCurrentImage, livePhotoVideoLoaded, isConvertingVideo, videoSource, imageLoaderManager, loadingIndicatorRef])

  useEffect(() => {
    if (!isCurrentImage) {
      setIsPlayingLivePhoto(false)
      setLivePhotoVideoLoaded(false)
      setIsConvertingVideo(false)
      hasAutoPlayedRef.current = false

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
  }, [livePhotoVideoLoaded, isPlayingLivePhoto, isConvertingVideo, videoAnimateController])

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

  // Auto-play effect - play once when video is loaded
  useEffect(() => {
    if (
      shouldAutoPlayOnce &&
      isCurrentImage &&
      livePhotoVideoLoaded &&
      !isPlayingLivePhoto &&
      !isConvertingVideo &&
      !hasAutoPlayedRef.current
    ) {
      hasAutoPlayedRef.current = true
      play()
    }
  }, [shouldAutoPlayOnce, isCurrentImage, livePhotoVideoLoaded, isPlayingLivePhoto, isConvertingVideo, play])

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
      className={clsxm('pointer-events-none absolute inset-0 z-10 h-full w-full object-contain', className)}
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
