import { clsxm } from '@afilmory/utils'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface SliderProps {
  value: number | 'auto'
  onChange: (value: number | 'auto') => void
  // Called when user finishes interaction (pointer up). Optional and non-breaking.
  onPointUp?: (e: PointerEvent) => void
  min: number
  max: number
  step?: number
  autoLabel?: string
  className?: string
  disabled?: boolean
}

export const Slider = ({
  value,
  onChange,
  onPointUp,
  min,
  max,
  step = 1,
  autoLabel,
  className,
  disabled = false,
}: SliderProps) => {
  const { t } = useTranslation()
  const finalAutoLabel = autoLabel || t('slider.auto')
  const [isDragging, setIsDragging] = useState(false)
  const sliderRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  // 将值转换为位置百分比
  const getPositionFromValue = useCallback(
    (val: number | 'auto') => {
      if (val === 'auto') return 5 // 自动档位置稍微偏右一点
      // 数值档从 15% 开始到 100%
      return 15 + ((val - min) / (max - min)) * 85
    },
    [min, max],
  )

  // 将位置百分比转换为值
  const getValueFromPosition = useCallback(
    (position: number) => {
      if (position <= 12) return 'auto' // 左侧 12% 区域为自动档
      const normalizedPosition = (position - 15) / 85 // 从 15% 开始的 85% 区域为数值
      const rawValue = min + Math.max(0, normalizedPosition) * (max - min)
      return Math.round(Math.max(min, rawValue) / step) * step
    },
    [min, max, step],
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (disabled) return

      event.preventDefault()
      setIsDragging(true)

      const updateValue = (clientX: number) => {
        if (!trackRef.current) return

        const rect = trackRef.current.getBoundingClientRect()
        const position = ((clientX - rect.left) / rect.width) * 100
        const clampedPosition = Math.max(0, Math.min(100, position))
        const newValue = getValueFromPosition(clampedPosition)

        if (newValue !== value) {
          onChange(newValue)
        }
      }

      updateValue(event.clientX)

      const handlePointerMove = (e: PointerEvent) => {
        updateValue(e.clientX)
      }

      const handlePointerUp = (e: PointerEvent) => {
        setIsDragging(false)
        if (onPointUp) {
          onPointUp(e)
        }
        document.removeEventListener('pointermove', handlePointerMove)
        document.removeEventListener('pointerup', handlePointerUp)
      }

      document.addEventListener('pointermove', handlePointerMove)
      document.addEventListener('pointerup', handlePointerUp)
    },
    [disabled, getValueFromPosition, value, onChange, onPointUp],
  )

  const position = getPositionFromValue(value)

  return (
    <div className={clsxm('w-full', className)}>
      {/* 标签 */}
      <div className="text-text-secondary mb-2 flex justify-between text-xs">
        <span>{finalAutoLabel}</span>
        <span>{max}</span>
      </div>

      {/* 滑块轨道 */}
      <div
        ref={sliderRef}
        className={clsxm('relative h-6 cursor-pointer', disabled && 'cursor-not-allowed opacity-50')}
        onPointerDown={handlePointerDown}
      >
        {/* 背景轨道 */}
        <div
          ref={trackRef}
          className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-neutral-200 dark:bg-neutral-700"
        >
          {/* 自动档区域指示 */}
          <div className="absolute top-0 left-0 h-full w-[12%] rounded-l-full bg-green-100 dark:bg-green-900/50" />

          {/* 激活区域 */}
          <div
            className={clsxm(
              'absolute top-0 h-full rounded-full transition-all duration-150 max-w-full',
              value === 'auto' ? 'bg-green-500' : 'bg-accent',
            )}
            style={{
              width: `${Math.max(position, 5)}%`,
              borderRadius: value === 'auto' ? '9999px 0 0 9999px' : '9999px',
            }}
          />
        </div>

        {/* 滑块把手 */}
        <div
          className={clsxm(
            'absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg transition-all duration-150',
            isDragging ? 'scale-110' : 'hover:scale-105',
            value === 'auto' ? 'bg-green-500' : 'bg-accent',
            disabled && 'cursor-not-allowed',
          )}
          style={{
            left: `${position}%`,
          }}
        />

        {/* 数值刻度 */}
        <div className="text-text-secondary absolute top-full mt-1 flex w-full text-xs">
          <div className="w-[15%] text-left">
            <span className={clsxm('transition-colors', value === 'auto' && 'font-medium text-green-500')}>
              {finalAutoLabel}
            </span>
          </div>
          <div className="flex w-[85%] justify-between">
            {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((num) => (
              <span key={num} className={clsxm('transition-colors', value === num && 'font-medium text-accent')}>
                {num}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 当前值显示 */}
      <div className="mt-8 text-center text-sm font-medium text-gray-700 dark:text-gray-300">
        {value === 'auto' ? finalAutoLabel : t('slider.columns', { count: value } as any)}
      </div>
    </div>
  )
}
