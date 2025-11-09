import { FormError, Input, Label } from '@afilmory/ui'
import type { FC } from 'react'

import type { AdminFormState, OnboardingErrors } from '../../types'

type AdminStepProps = {
  admin: AdminFormState
  errors: OnboardingErrors
  onChange: <Field extends keyof AdminFormState>(field: Field, value: AdminFormState[Field]) => void
}

export const AdminStep: FC<AdminStepProps> = ({ admin, errors, onChange }) => (
  <form className="space-y-6" onSubmit={(event) => event.preventDefault()}>
    <div className="grid gap-5 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="admin-name">Administrator name</Label>
        <Input
          id="admin-name"
          value={admin.name}
          onInput={(event) => onChange('name', event.currentTarget.value)}
          placeholder="Studio Admin"
          autoComplete="name"
          error={!!errors['admin.name']}
        />
        <FormError>{errors['admin.name']}</FormError>
      </div>

      <div className="space-y-2">
        <Label htmlFor="admin-email">Administrator email</Label>
        <Input
          id="admin-email"
          value={admin.email}
          onInput={(event) => onChange('email', event.currentTarget.value)}
          placeholder="admin@afilmory.app"
          autoComplete="email"
          error={!!errors['admin.email']}
        />
        <FormError>{errors['admin.email']}</FormError>
      </div>
    </div>

    <div className="grid gap-5 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="admin-password">Password</Label>
        <Input
          id="admin-password"
          type="password"
          value={admin.password}
          onInput={(event) => onChange('password', event.currentTarget.value)}
          placeholder="Minimum 8 characters"
          autoComplete="new-password"
          error={!!errors['admin.password']}
        />
        <FormError>{errors['admin.password']}</FormError>
      </div>

      <div className="space-y-2">
        <Label htmlFor="admin-confirm">Confirm password</Label>
        <Input
          id="admin-confirm"
          type="password"
          value={admin.confirmPassword}
          onInput={(event) => onChange('confirmPassword', event.currentTarget.value)}
          placeholder="Repeat password"
          autoComplete="new-password"
          error={!!errors['admin.confirmPassword']}
        />
        <FormError>{errors['admin.confirmPassword']}</FormError>
      </div>
    </div>

    <p className="text-text-tertiary text-xs">
      After onboarding completes a global super administrator will also be generated. Those credentials are written to
      the backend logs for security reasons.
    </p>
  </form>
)
