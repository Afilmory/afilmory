import type { FC } from 'react'
import { useMemo } from 'react'

import { SchemaFormRendererUncontrolled } from '~/modules/schema-form/SchemaFormRenderer'
import type { SchemaFormValue, UiSchema } from '~/modules/schema-form/types'

import type { OnboardingSiteSettingKey } from '../../constants'
import type { SiteFormState } from '../../types'

type SiteStepProps = {
  schema: UiSchema<OnboardingSiteSettingKey>
  values: SiteFormState
  errors: Record<string, string>
  onFieldChange: (key: OnboardingSiteSettingKey, value: string | boolean) => void
}

export const SiteStep: FC<SiteStepProps> = ({ schema, values, errors, onFieldChange }) => {
  const schemaWithErrors = useMemo(() => {
    return {
      ...schema,
      sections: schema.sections.map((section) => ({
        ...section,
        children: section.children.map((child: any) => {
          if (child.type !== 'field') {
            return child
          }
          const error = errors[child.key]
          return {
            ...child,
            helperText: error ?? child.helperText ?? null,
          }
        }),
      })),
    }
  }, [errors, schema])

  return (
    <div className="space-y-6">
      <SchemaFormRendererUncontrolled
        initialValues={values}
        schema={schemaWithErrors}
        onChange={(key: OnboardingSiteSettingKey, value: SchemaFormValue) => {
          onFieldChange(key, typeof value === 'boolean' ? value : value == null ? '' : String(value))
        }}
      />
    </div>
  )
}
