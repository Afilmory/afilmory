import { FormError, Input, Label } from '@afilmory/ui'
import type { FC } from 'react'

import type { OnboardingErrors, TenantFormState } from '../../types'

type TenantStepProps = {
  tenant: TenantFormState
  errors: OnboardingErrors
  onNameChange: (value: string) => void
  onSlugChange: (value: string) => void
}

export const TenantStep: FC<TenantStepProps> = ({ tenant, errors, onNameChange, onSlugChange }) => (
  <form className="space-y-6" onSubmit={(event) => event.preventDefault()}>
    <div className="grid gap-5 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="tenant-name">Workspace name</Label>
        <Input
          id="tenant-name"
          value={tenant.name}
          onInput={(event) => onNameChange(event.currentTarget.value)}
          placeholder="Afilmory Studio"
          error={!!errors['tenant.name']}
          autoComplete="organization"
        />
        <FormError>{errors['tenant.name']}</FormError>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tenant-slug">Tenant slug</Label>
        <div className="flex gap-2">
          <Input
            id="tenant-slug"
            value={tenant.slug}
            onInput={(event) => onSlugChange(event.currentTarget.value)}
            placeholder="afilmory"
            error={!!errors['tenant.slug']}
            autoComplete="off"
          />
        </div>
        <FormError>{errors['tenant.slug']}</FormError>
      </div>
    </div>
  </form>
)
