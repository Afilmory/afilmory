import { clsxm } from '@afilmory/utils'
import type * as SwitchPrimitives from '@radix-ui/react-switch'
import type { HTMLMotionProps } from 'motion/react'

import { Switch as SwitchAnimate, SwitchThumb } from '../animate-ui/primitives/radix/switch'

type SwitchProps = React.ComponentProps<typeof SwitchPrimitives.Root> &
  HTMLMotionProps<'button'> & {
    leftIcon?: React.ReactNode
    rightIcon?: React.ReactNode
  }

export function Switch({ className, ...props }: SwitchProps) {
  return (
    <SwitchAnimate
      className={clsxm(
        'relative flex h-6 w-10 items-center justify-start rounded-full border p-0.5 transition-colors',
        'data-[state=checked]:justify-end',
        className,
      )}
      {...props}
    >
      <SwitchThumb
        className="data-[state=checked]:bg-accent data-[state=unchecked]:bg-disabled-control aspect-square h-full rounded-full transition-colors duration-200"
        pressedAnimation={{ width: 22 }}
      />
    </SwitchAnimate>
  )
}
