import type {
  HTMLMotionProps,
} from 'motion/react'
import { m } from 'motion/react'
import type { FC, PropsWithChildren } from 'react'

import { clsxm } from '~/lib/cn'
import { Spring } from '~/lib/spring'

export const GlassButton: FC<HTMLMotionProps<'button'> & PropsWithChildren> = (
  props,
) => {
  return (
    <m.button
      type="button"
      {...props}
      className={clsxm(
        // Base styles with modern glass morphism - perfect 1:1 circle
        'pointer-events-auto relative flex size-10 items-center justify-center rounded-full',
        'bg-black/20 text-white backdrop-blur-md',
        // Border and shadow for depth
        'border border-white/10 shadow-lg shadow-black/25',

        // Text size
        'text-lg',
        props.className,
      )}
      initial={{ scale: 1 }}
      whileHover={{
        scale: 1.1,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        borderColor: 'rgba(255, 255, 255, 0.2)',
      }}
      whileTap={{ scale: 0.95 }}
      transition={Spring.presets.smooth}
    >
      {/* Glass effect overlay */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-t from-white/5 to-white/20 opacity-0 transition-opacity duration-300 hover:opacity-100" />

      {/* Icon container */}
      <div className="center relative z-10 flex">{props.children}</div>

      {/* Subtle inner shadow for depth */}
      <div className="absolute inset-0 rounded-full shadow-inner shadow-black/10" />
    </m.button>
  )
}
