import type { TenantRegistrationFormState } from '~/modules/auth/hooks/useRegistrationForm'

export const REGISTRATION_STEPS = [
  {
    id: 'workspace',
    title: 'Workspace details',
    description: 'Give your workspace a recognizable name and choose a slug for tenant URLs.',
  },
  {
    id: 'site',
    title: 'Site information',
    description: 'Configure the public gallery branding your visitors will see.',
  },
  {
    id: 'admin',
    title: 'Administrator account',
    description: 'Set up the primary administrator who will manage the workspace after creation.',
  },
  {
    id: 'review',
    title: 'Review & confirm',
    description: 'Verify everything looks right and accept the terms before provisioning the workspace.',
  },
] as const satisfies ReadonlyArray<{
  id: 'workspace' | 'site' | 'admin' | 'review'
  title: string
  description: string
}>

export type RegistrationStepId = (typeof REGISTRATION_STEPS)[number]['id']

export const STEP_FIELDS: Record<RegistrationStepId, Array<keyof TenantRegistrationFormState>> = {
  workspace: ['tenantName', 'tenantSlug'],
  site: [],
  admin: ['accountName', 'email', 'password', 'confirmPassword'],
  review: ['termsAccepted'],
}

export const progressForStep = (index: number) => Math.round((index / (REGISTRATION_STEPS.length - 1 || 1)) * 100)
