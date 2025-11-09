import { clsxm } from '@afilmory/utils'
import type { InputHTMLAttributes } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /**
   * Whether the input has an error state
   */
  error?: boolean
  /**
   * Additional class name
   */
  className?: string
}

/**
 * A styled input component following the dashboard design language.
 *
 * Features:
 * - `rounded` for subtle rounded corners
 * - Consistent padding and text styles
 * - Focus ring with accent color
 * - Error state support
 * - Full TypeScript support with forwarded ref
 *
 * @example
 * ```tsx
 * <Input
 *   placeholder="Enter your email"
 *   type="email"
 *   error={hasError}
 * />
 * ```
 */
export const Input = ({
  ref,
  error,
  className,
  ...props
}: InputProps & { ref?: React.RefObject<HTMLInputElement | null> }) => (
  <input
    ref={ref}
    className={clsxm(
      'w-full rounded border border-fill-tertiary bg-background',
      'px-3 py-2 text-sm text-text placeholder:text-text-tertiary/70',
      'focus:outline-none focus:ring-2 focus:ring-accent/40',
      'transition-all duration-200',
      'disabled:cursor-not-allowed disabled:opacity-60',
      error && 'border-red/60 focus:ring-red/30',
      className,
    )}
    {...props}
  />
)

Input.displayName = 'Input'
