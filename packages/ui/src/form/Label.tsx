import { clsxm } from '@afilmory/utils'
import type { FC, LabelHTMLAttributes } from 'react'

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /**
   * Whether the field is required
   */
  required?: boolean
}

/**
 * A styled label component for form fields.
 *
 * Features:
 * - Consistent text styling
 * - Required field indicator
 * - Proper typography
 *
 * @example
 * ```tsx
 * <Label htmlFor="email" required>
 *   Email Address
 * </Label>
 * ```
 */
export const Label: FC<LabelProps> = ({ required, className, children, ...props }) => (
  <label className={clsxm('block text-sm font-medium text-text', className)} {...props}>
    {children}
    {required && <span className="text-red ml-1">*</span>}
  </label>
)

Label.displayName = 'Label'
