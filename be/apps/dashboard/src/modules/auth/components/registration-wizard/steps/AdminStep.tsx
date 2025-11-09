import { FormError, Input, Label } from '@afilmory/ui'
import type { FC } from 'react'

import { SocialAuthButtons } from '~/modules/auth/components/SocialAuthButtons'
import type { useRegistrationForm } from '~/modules/auth/hooks/useRegistrationForm'

import { firstErrorMessage } from '../utils'

type AdminStepProps = {
  form: ReturnType<typeof useRegistrationForm>
  isSubmitting: boolean
  onFieldInteraction: () => void
}

export const AdminStep: FC<AdminStepProps> = ({ form, isSubmitting, onFieldInteraction }) => (
  <div className="space-y-8">
    <section className="space-y-3">
      <h2 className="text-text text-lg font-semibold">Administrator</h2>
      <p className="text-text-secondary text-sm">
        The first user becomes the workspace administrator and can invite additional members later.
      </p>
    </section>
    <div className="grid gap-6 md:grid-cols-2">
      <form.Field name="accountName">
        {(field) => {
          const error = firstErrorMessage(field.state.meta.errors)
          return (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Full name</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onChange={(event) => {
                  onFieldInteraction()
                  field.handleChange(event.currentTarget.value)
                }}
                onBlur={field.handleBlur}
                placeholder="Jane Doe"
                disabled={isSubmitting}
                error={Boolean(error)}
                autoComplete="name"
              />
              <FormError>{error}</FormError>
            </div>
          )
        }}
      </form.Field>
      <form.Field name="email">
        {(field) => {
          const error = firstErrorMessage(field.state.meta.errors)
          return (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Work email</Label>
              <Input
                id={field.name}
                type="email"
                value={field.state.value}
                onChange={(event) => {
                  onFieldInteraction()
                  field.handleChange(event.currentTarget.value)
                }}
                onBlur={field.handleBlur}
                placeholder="jane@acme.studio"
                disabled={isSubmitting}
                error={Boolean(error)}
                autoComplete="email"
              />
              <FormError>{error}</FormError>
            </div>
          )
        }}
      </form.Field>
      <form.Field name="password">
        {(field) => {
          const error = firstErrorMessage(field.state.meta.errors)
          return (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Password</Label>
              <Input
                id={field.name}
                type="password"
                value={field.state.value}
                onChange={(event) => {
                  onFieldInteraction()
                  field.handleChange(event.currentTarget.value)
                }}
                onBlur={field.handleBlur}
                placeholder="Create a strong password"
                disabled={isSubmitting}
                error={Boolean(error)}
                autoComplete="new-password"
              />
              <FormError>{error}</FormError>
            </div>
          )
        }}
      </form.Field>
      <form.Field name="confirmPassword">
        {(field) => {
          const error = firstErrorMessage(field.state.meta.errors)
          return (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Confirm password</Label>
              <Input
                id={field.name}
                type="password"
                value={field.state.value}
                onChange={(event) => {
                  onFieldInteraction()
                  field.handleChange(event.currentTarget.value)
                }}
                onBlur={field.handleBlur}
                placeholder="Repeat your password"
                disabled={isSubmitting}
                error={Boolean(error)}
                autoComplete="new-password"
              />
              <FormError>{error}</FormError>
            </div>
          )
        }}
      </form.Field>
    </div>
    <p className="text-text-tertiary text-xs">
      We recommend using a secure password manager to store credentials for critical roles like the administrator.
    </p>
    <SocialAuthButtons
      className="border border-white/5 bg-fill/40 rounded-2xl p-4"
      title="Or use single sign-on"
      requestSignUp
    />
  </div>
)
