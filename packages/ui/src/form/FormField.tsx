import { clsxm } from '@afilmory/utils'
import type { FC, ReactNode } from 'react'

export interface FormFieldProps {
  /**
   * Label text for the field
   */
  label: string
  /**
   * HTML id for the input element
   */
  htmlFor: string
  /**
   * Error message to display
   */
  error?: string
  /**
   * Helper text to display below the input
   */
  helperText?: string
  /**
   * Whether the field is required
   */
  required?: boolean
  /**
   * The input/textarea element
   */
  children: ReactNode
  /**
   * Additional class name for the container
   */
  className?: string
}

/**
 * A form field container component with label, error message, and helper text.
 *
 * Features:
 * - Consistent label styling
 * - Error message display
 * - Helper text support
 * - Required field indicator
 * - Proper spacing and typography
 *
 * @example
 * ```tsx
 * <FormField
 *   label="Email Address"
 *   htmlFor="email"
 *   error={errors.email}
 *   helperText="We'll never share your email"
 *   required
 * >
 *   <Input
 *     id="email"
 *     type="email"
 *     error={!!errors.email}
 *   />
 * </FormField>
 * ```
 */
export const FormField: FC<FormFieldProps> = ({ label, htmlFor, error, helperText, required, children, className }) => (
  <div className={clsxm('space-y-2', className)}>
    <label htmlFor={htmlFor} className="text-text block text-sm font-medium">
      {label}
      {required && <span className="text-red ml-1">*</span>}
    </label>
    {children}
    {error && <p className="text-red text-xs">{error}</p>}
    {!error && helperText && <p className="text-text-tertiary text-xs">{helperText}</p>}
  </div>
)

FormField.displayName = 'FormField'
