import { Checkbox, FormError } from '@afilmory/ui'
import { cx, Spring } from '@afilmory/utils'
import { m } from 'motion/react'
import type { FC } from 'react'
import { useMemo } from 'react'

import type {
  TenantRegistrationFormState,
  TenantSiteFieldKey,
  useRegistrationForm,
} from '~/modules/auth/hooks/useRegistrationForm'
import type { SchemaFormValue, UiFieldNode, UiSchema } from '~/modules/schema-form/types'

import { collectSiteFields, firstErrorMessage } from '../utils'

type ReviewStepProps = {
  form: ReturnType<typeof useRegistrationForm>
  values: TenantRegistrationFormState
  siteSchema: UiSchema<string> | null
  siteSchemaLoading: boolean
  siteSchemaError?: string
  isSubmitting: boolean
  serverError: string | null
  onFieldInteraction: () => void
}

export const ReviewStep: FC<ReviewStepProps> = ({
  form,
  values,
  siteSchema,
  siteSchemaLoading,
  siteSchemaError,
  isSubmitting,
  serverError,
  onFieldInteraction,
}) => {
  const formatSiteValue = (value: SchemaFormValue | undefined) => {
    if (typeof value === 'boolean') {
      return value ? 'Enabled' : 'Disabled'
    }
    if (value == null) {
      return '—'
    }
    const text = String(value).trim()
    return text || '—'
  }

  const siteSummary = useMemo(() => {
    if (!siteSchema) {
      return [] as Array<{ field: UiFieldNode<string>; value: SchemaFormValue | undefined }>
    }

    return collectSiteFields(siteSchema.sections).map((field) => {
      const key = field.key as TenantSiteFieldKey
      return {
        field,
        value: values[key],
      }
    })
  }, [siteSchema, values])

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-text text-lg font-semibold">Confirm workspace configuration</h2>
        <p className="text-text-secondary text-sm">
          Double-check the details below. You can go back to make adjustments before creating the workspace.
        </p>
      </section>
      <dl className="bg-fill/40 border border-white/5 grid gap-x-6 gap-y-4 rounded-2xl p-6 md:grid-cols-2">
        <div>
          <dt className="text-text-tertiary text-xs uppercase tracking-wide">Workspace name</dt>
          <dd className="text-text mt-1 text-sm font-medium">{values.tenantName || '—'}</dd>
        </div>
        <div>
          <dt className="text-text-tertiary text-xs uppercase tracking-wide">Workspace slug</dt>
          <dd className="text-text mt-1 text-sm font-medium">{values.tenantSlug || '—'}</dd>
        </div>
        <div>
          <dt className="text-text-tertiary text-xs uppercase tracking-wide">Administrator name</dt>
          <dd className="text-text mt-1 text-sm font-medium">{values.accountName || '—'}</dd>
        </div>
        <div>
          <dt className="text-text-tertiary text-xs uppercase tracking-wide">Administrator email</dt>
          <dd className="text-text mt-1 text-sm font-medium">{values.email || '—'}</dd>
        </div>
      </dl>

      <section className="space-y-4">
        <h3 className="text-text text-base font-semibold">Site details</h3>
        {siteSchemaLoading && <div className="bg-fill/40 border border-white/5 h-32 animate-pulse rounded-2xl" />}
        {!siteSchemaLoading && siteSchemaError && (
          <div className="border-red/60 bg-red/10 rounded-2xl border px-4 py-3 text-sm text-red">{siteSchemaError}</div>
        )}
        {!siteSchemaLoading && !siteSchemaError && siteSchema && (
          <dl className="bg-fill/40 border border-white/5 grid gap-x-6 gap-y-4 rounded-2xl p-6 md:grid-cols-2">
            {siteSummary.map(({ field, value }) => {
              const spanClass = field.component?.type === 'textarea' ? 'md:col-span-2' : ''
              const isMono = field.key === 'site.accentColor'

              return (
                <div key={field.id} className={cx(spanClass, 'min-w-0')}>
                  <dt className="text-text-tertiary text-xs uppercase tracking-wide">{field.title}</dt>
                  <dd
                    className={cx(
                      'text-text mt-1 text-sm font-medium wrap-break-word',
                      isMono && 'font-mono text-xs tracking-wide text-text-secondary',
                    )}
                  >
                    {formatSiteValue(value)}
                  </dd>
                </div>
              )
            })}
          </dl>
        )}
      </section>

      {serverError && (
        <m.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={Spring.presets.snappy}
          className="border-red/60 bg-red/10 rounded-xl border px-4 py-3"
        >
          <p className="text-red text-sm">{serverError}</p>
        </m.div>
      )}

      <section className="space-y-3">
        <h3 className="text-text text-base font-semibold">Policies</h3>
        <p className="text-text-tertiary text-sm">
          Creating a workspace means you agree to comply with our usage guidelines and privacy practices.
        </p>
        <div className="space-y-2">
          <form.Field name="termsAccepted">
            {(field) => {
              const error = firstErrorMessage(field.state.meta.errors)
              return (
                <>
                  <label className="text-text flex items-center gap-3 text-sm">
                    <Checkbox
                      checked={field.state.value}
                      onCheckedChange={(checked) => {
                        onFieldInteraction()
                        field.handleChange(checked === true)
                      }}
                      disabled={isSubmitting}
                      className="mt-0.5"
                    />
                    <span className="text-text-secondary">
                      I agree to the{' '}
                      <a href="/terms" target="_blank" rel="noreferrer" className="text-accent hover:underline">
                        Terms of Service
                      </a>{' '}
                      and{' '}
                      <a href="/privacy" target="_blank" rel="noreferrer" className="text-accent hover:underline">
                        Privacy Policy
                      </a>
                      .
                    </span>
                  </label>
                  <FormError>{error}</FormError>
                </>
              )
            }}
          </form.Field>
        </div>
      </section>
    </div>
  )
}
