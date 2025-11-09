import { clsxm } from '@afilmory/utils'
import type { FC } from 'react'

export const HDRBadge: FC = () => {
  return (
    <div
      className={clsxm(
        'absolute z-20 flex items-center space-x-1 rounded-xl bg-black/50 px-1 py-1 text-xs text-white',
        import.meta.env.DEV ? 'top-24 right-4' : 'top-20 lg:top-8 left-4',
      )}
    >
      <i className="i-mingcute-sun-line size-4" />
      <span className="mr-1">HDR</span>
    </div>
  )
}

export default HDRBadge
