import { Checkbox } from '@afilmory/ui'
import type { FC } from 'react'

import type { SchemaFormValue, UiFieldNode, UiNode, UiSchema } from '~/modules/schema-form/types'

import type { OnboardingSiteSettingKey, SettingFieldDefinition } from '../../constants'
import type { AdminFormState, OnboardingErrors, SiteFormState, TenantFormState } from '../../types'
import { maskSecret } from '../../utils'

export type ReviewSettingEntry = {
  definition: SettingFieldDefinition
  value: string
}

type ReviewStepProps = {
  tenant: TenantFormState
  admin: AdminFormState
  site: SiteFormState
  siteSchema: UiSchema<OnboardingSiteSettingKey>
  siteSchemaLoading?: boolean
  siteSchemaError?: string | null
  reviewSettings: ReviewSettingEntry[]
  acknowledged: boolean
  errors: OnboardingErrors
  onAcknowledgeChange: (checked: boolean) => void
}

const optionalSiteValue = (value: SchemaFormValue | undefined) => {
  if (typeof value === 'boolean') {
    return value ? 'Enabled' : 'Disabled'
  }

  if (typeof value === 'string') {
    if (value.length === 0) {
      return '—'
    }
    const lowered = value.toLowerCase()
    if (lowered === 'true' || lowered === 'false') {
      return lowered === 'true' ? 'Enabled' : 'Disabled'
    }
    return value
  }

  if (value == null) {
    return '—'
  }

  return String(value)
}

function collectSiteFields(
  nodes: ReadonlyArray<UiNode<OnboardingSiteSettingKey>>,
): Array<UiFieldNode<OnboardingSiteSettingKey>> {
  const fields: Array<UiFieldNode<OnboardingSiteSettingKey>> = []

  for (const node of nodes) {
    if (node.type === 'field') {
      fields.push(node)
      continue
    }

    fields.push(...collectSiteFields(node.children))
  }

  return fields
}

export const ReviewStep: FC<ReviewStepProps> = ({
  tenant,
  admin,
  site,
  siteSchema,
  siteSchemaLoading = false,
  siteSchemaError = null,
  reviewSettings,
  acknowledged,
  errors,
  onAcknowledgeChange,
}) => (
  <div className="space-y-6">
    <div className="border-fill-tertiary bg-background rounded-lg border p-6">
      <h3 className="text-text mb-4 text-sm font-semibold">Tenant summary</h3>
      <dl className="text-text-secondary grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-text font-semibold">Name</dt>
          <dd className="mt-1">{tenant.name || '—'}</dd>
        </div>
        <div>
          <dt className="text-text font-semibold">Slug</dt>
          <dd className="mt-1">{tenant.slug || '—'}</dd>
        </div>
      </dl>
    </div>

    <div className="border-fill-tertiary bg-background rounded-lg border p-6">
      <h3 className="text-text mb-4 text-sm font-semibold">Administrator</h3>
      <dl className="text-text-secondary grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-text font-semibold">Name</dt>
          <dd className="mt-1">{admin.name || '—'}</dd>
        </div>
        <div>
          <dt className="text-text font-semibold">Email</dt>
          <dd className="mt-1">{admin.email || '—'}</dd>
        </div>
        <div>
          <dt className="text-text font-semibold">Password</dt>
          <dd className="mt-1">{maskSecret(admin.password)}</dd>
        </div>
      </dl>
    </div>

    <div className="border-fill-tertiary bg-background rounded-lg border p-6">
      <h3 className="text-text mb-4 text-sm font-semibold">Site information</h3>
      {siteSchemaLoading && <div className="bg-fill/60 border border-white/5 h-24 animate-pulse rounded-xl" />}
      {!siteSchemaLoading && siteSchemaError && (
        <div className="border-red/60 bg-red/10 mt-2 rounded-xl border px-4 py-3 text-sm text-red">
          {siteSchemaError}
        </div>
      )}
      {!siteSchemaLoading && !siteSchemaError && (
        <dl className="text-text-secondary grid gap-4 text-sm md:grid-cols-2">
          {collectSiteFields(siteSchema.sections).map((field) => {
            const spanClass = field.component?.type === 'textarea' ? 'md:col-span-2' : ''
            return (
              <div key={field.id} className={`${spanClass} min-w-0`}>
                <dt className="text-text font-semibold">{field.title}</dt>
                <dd className="mt-1 leading-relaxed break-words">{optionalSiteValue(site[field.key])}</dd>
              </div>
            )
          })}
        </dl>
      )}
    </div>

    <div className="border-fill-tertiary bg-background rounded-lg border p-6">
      <h3 className="text-text mb-4 text-sm font-semibold">Enabled integrations</h3>
      {reviewSettings.length === 0 ? (
        <p className="text-text-tertiary text-sm">
          No integrations configured. You can enable OAuth providers, AI services, or maps later from the settings
          panel.
        </p>
      ) : (
        <ul className="space-y-3">
          {reviewSettings.map(({ definition, value }) => (
            <li key={definition.key} className="border-fill-tertiary bg-background rounded-lg border px-4 py-3">
              <p className="text-text text-sm font-medium">{definition.label}</p>
              <p className="text-text-tertiary mt-1">{definition.sensitive ? maskSecret(value) : value}</p>
            </li>
          ))}
        </ul>
      )}
    </div>

    <div className="border-orange/40 bg-orange/5 rounded-lg border p-6">
      <h3 className="text-orange mb-2 flex items-center gap-2 text-sm font-semibold">
        <i className="i-mingcute-alert-fill" />
        Important
      </h3>
      <p className="text-orange/90 text-sm leading-relaxed">
        Once you click initialize, the application becomes locked to this initial administrator. The core service will
        print super administrator credentials to stdout exactly once.
      </p>
      <label className="text-text mt-4 flex items-start gap-3 text-sm">
        <Checkbox
          checked={acknowledged}
          onCheckedChange={(checked) => onAcknowledgeChange(Boolean(checked))}
          className="mt-0.5"
        />
        <span>
          I have noted the super administrator credentials will appear in the backend logs and understand this action
          cannot be repeated.
        </span>
      </label>
      {errors['review.ack'] && <p className="text-red mt-2 text-xs">{errors['review.ack']}</p>}
    </div>
  </div>
)
