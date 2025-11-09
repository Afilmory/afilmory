import { clsxm } from '@afilmory/utils'
import type { ReactNode } from 'react'

export function LinearBorderPanel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={clsxm('group relative overflow-hidden', className)}>
      {/* Linear gradient borders - sharp edges */}
      <div className="via-text/20 absolute top-0 right-0 left-0 h-[0.5px] bg-linear-to-r from-transparent to-transparent" />
      <div className="via-text/20 absolute top-0 right-0 bottom-0 w-[0.5px] bg-linear-to-b from-transparent to-transparent" />
      <div className="via-text/20 absolute right-0 bottom-0 left-0 h-[0.5px] bg-linear-to-r from-transparent to-transparent" />
      <div className="via-text/20 absolute top-0 bottom-0 left-0 w-[0.5px] bg-linear-to-b from-transparent to-transparent" />

      <div className="relative">{children}</div>
    </div>
  )
}
