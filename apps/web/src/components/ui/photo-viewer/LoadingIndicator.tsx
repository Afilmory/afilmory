import { useCallback, useImperativeHandle, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface LoadingState {
  isVisible: boolean
  isConverting: boolean
  isHeicFormat: boolean
  loadingProgress: number
  loadedBytes: number
  totalBytes: number
  conversionMessage?: string // 视频转换消息
  codecInfo?: string // 编码器信息

  // WebGL 相关状态
  isWebGLLoading?: boolean // WebGL 纹理是否正在加载
  webglMessage?: string // WebGL 加载消息
  webglQuality?: 'high' | 'medium' | 'low' | 'unknown' // WebGL 纹理质量

  // 错误状态
  isError?: boolean // 是否出现错误
  errorMessage?: string // 错误消息
}

interface LoadingIndicatorRef {
  updateLoadingState: (state: Partial<LoadingState>) => void
  resetLoadingState: () => void
}

const initialLoadingState: LoadingState = {
  isVisible: false,
  isConverting: false,
  isHeicFormat: false,
  loadingProgress: 0,
  loadedBytes: 0,
  totalBytes: 0,
  conversionMessage: undefined,

  isWebGLLoading: false,
  webglMessage: undefined,
  webglQuality: 'unknown',

  isError: false,
  errorMessage: undefined,
}

export const LoadingIndicator = ({
  ref,
}: {
  ref?: React.Ref<LoadingIndicatorRef | null>
}) => {
  const { t } = useTranslation()
  const [loadingState, setLoadingState] =
    useState<LoadingState>(initialLoadingState)

  useImperativeHandle(
    ref,
    useCallback(
      () => ({
        updateLoadingState: (partialState: Partial<LoadingState>) => {
          setLoadingState((prev) => {
            if (partialState.isVisible === false) {
              return initialLoadingState
            }
            return { ...prev, ...partialState }
          })
        },
        resetLoadingState: () => {
          setLoadingState(initialLoadingState)
        },
      }),
      [],
    ),
  )

  if (!loadingState.isVisible) {
    return null
  }

  return (
    <div className="pointer-events-none absolute right-4 bottom-4 z-10 rounded-xl border border-white/10 bg-black/80 px-3 py-2 backdrop-blur">
      <div className="flex items-center gap-3 text-white">
        <div className="relative">
          {loadingState.isError ? (
            <div className="i-mingcute-warning-line text-lg text-red-400" />
          ) : (
            <div className="i-mingcute-loading-3-line animate-spin text-lg" />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          {loadingState.isError ? (
            // 错误状态
            <>
              <p className="text-xs font-medium text-red-400">
                {loadingState.errorMessage || t('photo.error.loading')}
              </p>
              <p className="text-xs text-white/70">{t('loading.default')}</p>
            </>
          ) : loadingState.isConverting ? (
            // 视频转换状态
            <>
              <p className="text-xs font-medium text-white tabular-nums">
                {loadingState.conversionMessage || t('loading.converting')}
              </p>
            </>
          ) : loadingState.isWebGLLoading ? (
            // WebGL 加载状态
            <>
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-white">
                  {loadingState.webglMessage || t('loading.webgl.main')}
                </p>
                {loadingState.webglQuality !== 'unknown' && (
                  <span
                    className="text-xs tabular-nums"
                    style={{
                      color:
                        loadingState.webglQuality === 'high'
                          ? '#4ade80'
                          : loadingState.webglQuality === 'medium'
                            ? '#fbbf24'
                            : loadingState.webglQuality === 'low'
                              ? '#f87171'
                              : '#94a3b8',
                    }}
                  >
                    {loadingState.webglQuality}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/70">
                {t('loading.webgl.building')}
              </p>
            </>
          ) : (
            // 图片加载状态
            <>
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-white">
                  {loadingState.isHeicFormat
                    ? t('loading.heic.main')
                    : t('loading.default')}
                </p>
                <span className="text-xs text-white/60 tabular-nums">
                  {Math.round(loadingState.loadingProgress)}%
                </span>
              </div>
              {loadingState.totalBytes > 0 && (
                <p className="text-xs text-white/70 tabular-nums">
                  {(loadingState.loadedBytes / 1024 / 1024).toFixed(1)}MB /{' '}
                  {(loadingState.totalBytes / 1024 / 1024).toFixed(1)}MB
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export type { LoadingIndicatorRef, LoadingState }
