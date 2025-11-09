import { clsxm } from '@afilmory/utils'
import type { FC, ReactNode } from 'react'

type LinearBorderContainerProps = {
  children: ReactNode
  className?: string

  /**
   * Color tint for the border gradient.
   * @default 'text' - Uses the default text color
   * @example 'accent' - Uses the accent color
   * @example 'red' - Uses the red system color
   */
  tint?: string
}

/**
 * A container with linear gradient borders on all sides.
 * @example
 * ```tsx
 * <LinearBorderContainer  className="bg-background-tertiary">
 *   <div className="grid lg:grid-cols-[280px_1fr]">
 *     <Sidebar />
 *     <Content />
 *   </div>
 * </LinearBorderContainer>
 * ```
 */
export const LinearBorderContainer: FC<LinearBorderContainerProps> = ({
  children,
  className,

  tint = 'var(--color-text-secondary)',
}) => {
  // Generate inline styles for gradients with dynamic tint color
  const horizontalGradient = {
    background: `linear-gradient(to right, transparent, ${tint}, transparent)`,
  }
  const verticalGradient = {
    background: `linear-gradient(to bottom, transparent -15%, ${tint} 50%, transparent 115%)`,
  }

  // Advanced mode: uses flex layout for borders that span full dimensions
  return (
    <div className="flex flex-col">
      <div className={clsxm('flex flex-row', className)}>
        {/* Top border */}
        <div className="absolute right-0 left-0 z-1 h-[0.5px]" style={horizontalGradient} />

        {/* Left border */}
        <div className="absolute top-0 bottom-0 z-1 w-[0.5px]" style={verticalGradient} />

        {/* Main content area */}
        {children}

        {/* Right border container */}
        <div className="flex shrink-0 flex-col">
          <div className="absolute top-0 bottom-0 z-1 w-[0.5px]" style={verticalGradient} />
        </div>
      </div>

      {/* Bottom border container */}
      <div className="w-[2px] shrink-0">
        <div className="absolute right-0 left-0 z-1 h-[0.5px]" style={horizontalGradient} />
      </div>
    </div>
  )
}
