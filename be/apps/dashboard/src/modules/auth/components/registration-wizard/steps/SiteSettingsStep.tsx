import type { FC } from 'react'

import type {
  TenantRegistrationFormState,
  TenantSiteFieldKey,
  useRegistrationForm,
} from '~/modules/auth/hooks/useRegistrationForm'
import { SiteStep } from '~/modules/onboarding/components/steps/SiteStep'
import type { SchemaFormState, UiSchema } from '~/modules/schema-form/types'

type SiteSettingsStepProps = {
  form: ReturnType<typeof useRegistrationForm>
  schema: UiSchema<TenantSiteFieldKey> | null
  isLoading: boolean
  errorMessage?: string
  values: TenantRegistrationFormState
  errors: Record<string, string>
  onFieldInteraction: () => void
}

export const SiteSettingsStep: FC<SiteSettingsStepProps> = ({
  form,
  schema,
  isLoading,
  errorMessage,
  values,
  errors,
}) => {
  if (!schema) {
    if (isLoading) {
      return (
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-text text-lg font-semibold">Site branding</h2>
            <p className="text-text-secondary text-sm">
              These details appear on your public gallery, metadata, and social sharing cards. You can change them later
              from the dashboard.
            </p>
          </section>
          <div className="bg-fill/40 border border-white/5 h-56 animate-pulse rounded-2xl" />
        </div>
      )
    }

    return (
      <div className="space-y-6">
        <section className="space-y-3">
          <h2 className="text-text text-lg font-semibold">Site branding</h2>
          <p className="text-text-secondary text-sm">
            We couldn&apos;t load the site configuration schema from the server. Refresh the page or contact support.
          </p>
        </section>
        {errorMessage && (
          <div className="border-red/50 bg-red/10 rounded-xl border px-4 py-3 text-sm text-red">{errorMessage}</div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-8 -mx-6 -mt-12">
      {errorMessage && (
        <div className="border-red/50 bg-red/10 rounded-xl border px-4 py-3 text-sm text-red">{errorMessage}</div>
      )}
      <SiteStep
        schema={schema}
        values={values as SchemaFormState<TenantSiteFieldKey>}
        errors={errors}
        onFieldChange={(key, value) => {
          form.state.values[key] = value
        }}
      />
    </div>
  )
}
