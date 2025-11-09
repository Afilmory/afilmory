import { clsxm } from '@afilmory/utils'
import type { FC, HTMLAttributes } from 'react'

export interface FormHelperTextProps extends HTMLAttributes<HTMLParagraphElement> {
  /**
   * Helper text to display
   */
  children?: string
}

/**
 * A styled helper text component for form fields.
 *
 * Features:
 * - Muted text color (text-text-tertiary)
 * - Consistent typography (text-xs)
 * - Proper spacing (mt-2)
 * - Only renders if children is provided
 *
 * @example
 * ```tsx
 * <FormHelperText>
 *   We'll never share your email with anyone else.
 * </FormHelperText>
 * ```
 */
export const FormHelperText: FC<FormHelperTextProps> = ({ children, className, ...props }) => {
  if (!children) return null

  return (
    <p className={clsxm('mt-2 text-xs text-text-tertiary', className)} {...props}>
      {children}
    </p>
  )
}

FormHelperText.displayName = 'FormHelperText'
