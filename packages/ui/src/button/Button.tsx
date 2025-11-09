// Tremor Button [v0.2.0]

import { clsxm, focusRing } from '@afilmory/utils'
import { Slot } from '@radix-ui/react-slot'
import { m } from 'motion/react'
import * as React from 'react'
import type { VariantProps } from 'tailwind-variants'
import { tv } from 'tailwind-variants'

const buttonVariants = tv({
  base: [
    'relative inline-flex items-center justify-center whitespace-nowrap rounded text-center font-medium transition-all duration-100 ease-in-out',
    'disabled:pointer-events-none',
    focusRing,
  ],
  variants: {
    variant: {
      primary: [
        'border-transparent',
        'text-text',
        'bg-accent',
        'hover:bg-accent/90',
        'disabled:bg-accent/50 disabled:text-text/70',
      ],
      secondary: [
        'border border-fill-tertiary dark:border-fill-tertiary',
        'text-text',
        'bg-fill-tertiary',
        'hover:bg-fill-tertiary/10',
        'disabled:bg-fill-tertiary/10',
        'disabled:dark:bg-fill-tertiary/10',
      ],
      light: [
        'shadow-none',
        'border-transparent',
        'text-gray-900 dark:text-gray-50',
        'bg-gray-200 dark:bg-gray-900',
        'hover:bg-gray-300/70 dark:hover:bg-gray-800/80',
        'disabled:bg-gray-100 disabled:text-gray-400',
        'disabled:dark:bg-gray-800 disabled:dark:text-gray-600',
      ],
      ghost: [
        'shadow-none',
        'border-transparent',
        'text-gray-900 dark:text-gray-50',
        'bg-transparent dark:hover:bg-fill-tertiary',
        'disabled:text-gray-400',
        'disabled:dark:text-gray-600',
      ],
      destructive: [
        'text-white',
        'border-transparent',
        'bg-red-600 dark:bg-red-700',
        'hover:bg-red-700 dark:hover:bg-red-600',
        'disabled:bg-red-300 disabled:text-white',
        'disabled:dark:bg-red-950 disabled:dark:text-red-400',
      ],
    },
    size: {
      xs: 'h-6 px-2 text-xs',
      sm: 'h-8 px-3 text-sm',
      md: 'h-10 px-4 text-sm',
      lg: 'h-11 px-8 text-base',
      xl: 'h-12 px-8 text-base',
    },
    flat: {
      true: 'shadow-none',
      false: 'shadow-sm',
    },
  },
  defaultVariants: {
    variant: 'primary',
    size: 'sm',
    flat: false,
  },
})

interface ButtonProps extends React.ComponentPropsWithoutRef<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  isLoading?: boolean
  loadingText?: string
}

const Button = ({
  ref: forwardedRef,
  asChild,
  isLoading = false,
  loadingText,
  className,
  disabled,
  variant,
  size,
  flat,
  children,
  ...props
}: ButtonProps & {
  ref?: React.RefObject<HTMLButtonElement>
}) => {
  const Component = asChild ? Slot : m.button
  return (
    // @ts-expect-error
    <Component
      ref={forwardedRef}
      className={clsxm(buttonVariants({ variant, size, flat }), className)}
      disabled={disabled || isLoading}
      data-tremor-id="tremor-raw"
      whileTap={{ scale: 0.95 }}
      {...props}
    >
      {isLoading ? (
        <span className="pointer-events-none inline-flex items-center justify-center gap-1.5">
          <i
            className={clsxm(
              'shrink-0 animate-spin i-mingcute-loading-3-line !duration-1000',
              size === 'xs' || size === 'sm' ? 'size-3' : 'size-4',
            )}
            aria-hidden="true"
          />
          <span className="sr-only">{loadingText ?? 'Loading'}</span>
          <span className="inline-block">{loadingText ?? children}</span>
        </span>
      ) : (
        children
      )}
    </Component>
  )
}

Button.displayName = 'Button'

export { Button, type ButtonProps, buttonVariants }
