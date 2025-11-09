import { clsxm } from '@afilmory/utils'
import type { FC, HTMLAttributes } from 'react'

export interface FormErrorProps extends HTMLAttributes<HTMLParagraphElement> {
  /**
   * Error message to display
   */
  children?: string
}

/**
 * A styled error message component for form fields.
 *
 * Features:
 * - Red text color
 * - Consistent typography (text-xs)
 * - Proper spacing (mt-1)
 * - Only renders if children is provided
 *
 * @example
 * ```tsx
 * <FormError>{errors.email}</FormError>
 * ```
 */
export const FormError: FC<FormErrorProps> = ({ children, className, ...props }) => {
  if (!children) return null

  return (
    <p className={clsxm('mt-1 text-xs text-red', className)} {...props}>
      {children}
    </p>
  )
}

FormError.displayName = 'FormError'
