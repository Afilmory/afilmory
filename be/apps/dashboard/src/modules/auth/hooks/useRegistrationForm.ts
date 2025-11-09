import { useForm } from '@tanstack/react-form'
import { useMemo } from 'react'
import { z } from 'zod'

import { DEFAULT_SITE_SETTINGS_VALUES, SITE_SETTINGS_KEYS, siteSettingsSchema } from '~/modules/onboarding/siteSchema'
import type { SiteFormState } from '~/modules/onboarding/types'
import { isLikelyEmail } from '~/modules/onboarding/utils'

export type TenantSiteFieldKey = (typeof SITE_SETTINGS_KEYS)[number]

export type TenantRegistrationFormState = SiteFormState & {
  tenantName: string
  tenantSlug: string
  accountName: string
  email: string
  password: string
  confirmPassword: string
  termsAccepted: boolean
}

const REQUIRED_PASSWORD_LENGTH = 8

const baseRegistrationSchema = z.object({
  tenantName: z.string().min(1, { error: 'Workspace name is required' }),
  tenantSlug: z
    .string()
    .min(1, { error: 'Slug is required' })
    .regex(/^[a-z0-9-]+$/, { error: 'Use lowercase letters, numbers, and hyphen only' }),
  accountName: z.string().min(1, { error: 'Administrator name is required' }),
  email: z
    .string()
    .min(1, { error: 'Email is required' })
    .refine((value) => isLikelyEmail(value), { error: 'Enter a valid email address' }),
  password: z
    .string()
    .min(1, { error: 'Password is required' })
    .min(REQUIRED_PASSWORD_LENGTH, {
      error: `Password must be at least ${REQUIRED_PASSWORD_LENGTH} characters`,
    }),
  confirmPassword: z.string().min(1, { error: 'Confirm your password' }),
  termsAccepted: z.boolean({
    error: 'You must accept the terms to continue',
  }),
})

export const tenantRegistrationSchema = siteSettingsSchema.merge(baseRegistrationSchema).superRefine((data, ctx) => {
  if (data.confirmPassword !== '' && data.password !== data.confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      error: 'Passwords do not match',
      path: ['confirmPassword'],
    })
  }
})

export function buildRegistrationInitialValues(
  initial?: Partial<TenantRegistrationFormState>,
): TenantRegistrationFormState {
  const siteValues: SiteFormState = { ...DEFAULT_SITE_SETTINGS_VALUES }

  if (initial) {
    for (const key of SITE_SETTINGS_KEYS) {
      const value = initial[key]
      if (value === undefined || value === null) {
        continue
      }

      if (typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') {
        siteValues[key] = value
      }
    }
  }

  return {
    tenantName: initial?.tenantName ?? '',
    tenantSlug: initial?.tenantSlug ?? '',
    accountName: initial?.accountName ?? '',
    email: initial?.email ?? '',
    password: initial?.password ?? '',
    confirmPassword: initial?.confirmPassword ?? '',
    termsAccepted: initial?.termsAccepted ?? false,
    ...siteValues,
  }
}

export function validateRegistrationValues(values: TenantRegistrationFormState): Record<string, string> {
  const result = tenantRegistrationSchema.safeParse(values)

  if (result.success) {
    return {}
  }

  const fieldErrors: Record<string, string> = {}

  for (const issue of result.error.issues) {
    const path = issue.path.join('.')

    if (!path || fieldErrors[path]) {
      continue
    }

    fieldErrors[path] = issue.message
  }

  return fieldErrors
}

export function useRegistrationForm(initial?: Partial<TenantRegistrationFormState>) {
  const defaultValues = useMemo(() => buildRegistrationInitialValues(initial), [initial])

  return useForm({
    defaultValues,
    validators: {
      onChange: ({ value }) => {
        const fieldErrors = validateRegistrationValues(value)
        return Object.keys(fieldErrors).length > 0 ? { fields: fieldErrors } : undefined
      },
      onSubmit: ({ value }) => {
        const fieldErrors = validateRegistrationValues(value)
        return Object.keys(fieldErrors).length > 0 ? { fields: fieldErrors } : undefined
      },
    },
  })
}
