import { clsxm } from '@afilmory/utils'
import type { FC, PropsWithChildren, ReactNode } from 'react'

interface ExifSectionProps {
  title: ReactNode
  className?: string
  ariaLabel?: string
}

export const ExifSection: FC<PropsWithChildren<ExifSectionProps>> = ({ title, className, ariaLabel, children }) => (
  <section className={clsxm('flex flex-col gap-2', className)} aria-label={ariaLabel}>
    <h4 className="text-sm font-medium text-white/80">{title}</h4>
    {children}
  </section>
)

export const ExifRowGroup: FC<PropsWithChildren<{ className?: string }>> = ({ className, children }) => (
  <div className={clsxm('flex flex-col gap-1 text-sm', className)}>{children}</div>
)
