import { EllipsisHorizontalTextWithTooltip } from '@afilmory/ui'
import type { FC } from 'react'

export const Row: FC<{
  label: string
  value: string | number | null | undefined | number[]
  ellipsis?: boolean
}> = ({ label, value, ellipsis = false }) => {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-text-secondary shrink-0">{label}</span>
      {ellipsis ? (
        <span className="relative min-w-0 flex-1 shrink">
          <span className="absolute inset-0">
            <EllipsisHorizontalTextWithTooltip className="text-text min-w-0 text-right">
              {Array.isArray(value) ? value.join(' ') : value}
            </EllipsisHorizontalTextWithTooltip>
          </span>
        </span>
      ) : (
        <span className="text-text min-w-0 text-right">{Array.isArray(value) ? value.join(' ') : value}</span>
      )}
    </div>
  )
}
