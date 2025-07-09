import { AnimatePresence, m } from 'motion/react'
import type { FC } from 'react'
import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { clsxm } from '~/lib/cn'
import { isMobileDevice } from '~/lib/device-viewport'

import type { LivePhotoBadgeProps } from './types'

export const LivePhotoBadge: FC<LivePhotoBadgeProps> = ({
  livePhotoRef,
  isLivePhotoPlaying,
}) => {
  const { t } = useTranslation()
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null)

  const handlePlay = useCallback(async () => {
    if (!livePhotoRef.current?.getIsVideoLoaded() || isLivePhotoPlaying) return
    livePhotoRef.current.play()
  }, [livePhotoRef, isLivePhotoPlaying])

  const handleStop = useCallback(() => {
    if (!isLivePhotoPlaying) return
    livePhotoRef.current?.stop()
  }, [livePhotoRef, isLivePhotoPlaying])

  // Desktop hover logic
  const handleBadgeMouseEnter = useCallback(() => {
    if (isMobileDevice) return
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = setTimeout(handlePlay, 200)
  }, [handlePlay])

  const handleBadgeMouseLeave = useCallback(() => {
    if (isMobileDevice) return
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    handleStop()
  }, [handleStop])

  return (
    <>
      {/* Live Photo 标识 */}
      <div
        className={clsxm(
          'absolute z-20 flex items-center space-x-1 rounded-xl bg-black/50 px-1 py-1 text-xs text-white transition-all duration-200',
          !isMobileDevice && 'cursor-pointer hover:bg-black/70',
          import.meta.env.DEV ? 'top-16 right-4' : 'top-12 lg:top-4 left-4',
        )}
        onMouseEnter={handleBadgeMouseEnter}
        onMouseLeave={handleBadgeMouseLeave}
      >
        <i className="i-mingcute-live-photo-line size-4" />
        <span className="mr-1">{t('photo.live.badge')}</span>
      </div>

      {/* 播放状态提示 */}
      <AnimatePresence>
        {isLivePhotoPlaying && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2"
          >
            <div className="flex items-center gap-2 rounded bg-black/50 px-2 py-1 text-xs text-white">
              <i className="i-mingcute-live-photo-line" />
              <span>{t('photo.live.playing')}</span>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* 操作提示 */}
      <div
        className={clsxm(
          'pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded bg-black/50 px-2 py-1 text-xs text-white opacity-0 duration-200 group-hover:opacity-50',
          isLivePhotoPlaying && 'opacity-0!',
        )}
      >
        {isMobileDevice
          ? t('photo.live.tooltip.mobile.zoom')
          : t('photo.live.tooltip.desktop.zoom')}
      </div>
    </>
  )
}
