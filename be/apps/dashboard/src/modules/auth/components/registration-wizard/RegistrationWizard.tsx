import { ScrollArea } from '@afilmory/ui'
import { useStore } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import type { FC, KeyboardEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { useRegisterTenant } from '~/modules/auth/hooks/useRegisterTenant'
import type { TenantRegistrationFormState, TenantSiteFieldKey } from '~/modules/auth/hooks/useRegistrationForm'
import { useRegistrationForm } from '~/modules/auth/hooks/useRegistrationForm'
import { getOnboardingSiteSchema } from '~/modules/onboarding/api'
import { LinearBorderContainer } from '~/modules/onboarding/components/LinearBorderContainer'
import { SITE_SETTINGS_KEYS, siteSettingsSchema } from '~/modules/onboarding/siteSchema'
import {
  coerceSiteFieldValue,
  collectSchemaFieldMap,
  createInitialSiteStateFromFieldMap,
  serializeSiteFieldValue,
} from '~/modules/onboarding/utils'
import type { SchemaFormValue, UiSchema } from '~/modules/schema-form/types'

import { REGISTRATION_STEPS, STEP_FIELDS } from './constants'
import { RegistrationFooter } from './RegistrationFooter'
import { RegistrationHeader } from './RegistrationHeader'
import { RegistrationSidebar } from './RegistrationSidebar'
import { AdminStep } from './steps/AdminStep'
import { ReviewStep } from './steps/ReviewStep'
import { SiteSettingsStep } from './steps/SiteSettingsStep'
import { WorkspaceStep } from './steps/WorkspaceStep'
import { firstErrorMessage } from './utils'

export const RegistrationWizard: FC = () => {
  const form = useRegistrationForm()
  const formValues = useStore(form.store, (state) => state.values)
  const fieldMeta = useStore(form.store, (state) => state.fieldMeta)
  const { registerTenant, isLoading, error, clearError } = useRegisterTenant()
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [maxVisitedIndex, setMaxVisitedIndex] = useState(0)
  const contentRef = useRef<HTMLElement | null>(null)
  const slugManuallyEditedRef = useRef(false)
  const siteDefaultsAppliedRef = useRef(false)

  const siteSchemaQuery = useQuery({
    queryKey: ['onboarding', 'site-schema'],
    queryFn: getOnboardingSiteSchema,
    staleTime: Infinity,
  })

  const [siteSchema, setSiteSchema] = useState<UiSchema<TenantSiteFieldKey> | null>(null)

  useEffect(() => {
    const data = siteSchemaQuery.data as
      | {
          schema?: UiSchema<TenantSiteFieldKey>
          values?: Partial<Record<TenantSiteFieldKey, SchemaFormValue>>
        }
      | undefined

    if (!data) {
      return
    }

    if (data.schema && !siteSchema) {
      setSiteSchema(data.schema)
    }

    if (!data.schema || siteDefaultsAppliedRef.current) {
      return
    }

    const fieldMap = collectSchemaFieldMap(data.schema)
    const defaults = createInitialSiteStateFromFieldMap(fieldMap)
    const presetValues = data.values ?? {}

    let applied = false

    for (const [key, field] of fieldMap) {
      const defaultValue = defaults[key]
      if (defaultValue !== undefined) {
        applied = true
        form.setFieldValue(key, () => defaultValue)
      }

      const coerced = coerceSiteFieldValue(field, presetValues[key])
      if (coerced !== undefined) {
        applied = true
        form.setFieldValue(key, () => coerced)
      }
    }

    if (applied) {
      siteDefaultsAppliedRef.current = true
    }
  }, [form, siteSchema, siteSchemaQuery.data])

  const siteSchemaLoading = siteSchemaQuery.isLoading && !siteSchema
  const siteSchemaErrorMessage = siteSchemaQuery.isError
    ? siteSchemaQuery.error instanceof Error
      ? siteSchemaQuery.error.message
      : 'Unable to load site configuration schema from the server.'
    : undefined

  const siteFieldMap = useMemo(() => {
    const data = siteSchemaQuery.data as
      | {
          schema?: UiSchema<TenantSiteFieldKey>
        }
      | undefined
    const schema = siteSchema ?? data?.schema ?? null
    return schema ? collectSchemaFieldMap(schema) : null
  }, [siteSchema, siteSchemaQuery.data])

  const siteFieldKeys = useMemo(
    () =>
      siteFieldMap
        ? (Array.from(siteFieldMap.keys()) as TenantSiteFieldKey[])
        : (SITE_SETTINGS_KEYS as TenantSiteFieldKey[]),
    [siteFieldMap],
  )

  const getStepFields = useCallback(
    (stepId: (typeof REGISTRATION_STEPS)[number]['id']) => {
      if (stepId === 'site') {
        return siteFieldKeys as Array<keyof TenantRegistrationFormState>
      }
      return STEP_FIELDS[stepId]
    },
    [siteFieldKeys],
  )

  useEffect(() => {
    const root = contentRef.current
    if (!root) return

    const rafId = requestAnimationFrame(() => {
      const selector = [
        'input:not([type="hidden"]):not([disabled])',
        'textarea:not([disabled])',
        'select:not([disabled])',
        '[contenteditable="true"]',
        '[tabindex]:not([tabindex="-1"])',
      ].join(',')

      const candidates = Array.from(root.querySelectorAll<HTMLElement>(selector))
      const firstVisible = candidates.find((el) => {
        if (el.getAttribute('aria-hidden') === 'true') return false
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return false
        if ((el as HTMLInputElement).disabled) return false
        return true
      })

      firstVisible?.focus({ preventScroll: true })
    })

    return () => cancelAnimationFrame(rafId)
  }, [currentStepIndex])

  const canNavigateTo = useCallback((index: number) => index <= maxVisitedIndex, [maxVisitedIndex])

  const onFieldInteraction = useCallback(() => {
    if (error) {
      clearError()
    }
  }, [clearError, error])

  const jumpToStep = useCallback(
    (index: number) => {
      if (isLoading) return
      if (index === currentStepIndex) return
      if (!canNavigateTo(index)) return
      onFieldInteraction()
      setCurrentStepIndex(index)
      setMaxVisitedIndex((prev) => Math.max(prev, index))
    },
    [canNavigateTo, currentStepIndex, isLoading, onFieldInteraction],
  )

  const handleBack = useCallback(() => {
    if (isLoading) return
    if (currentStepIndex === 0) return
    onFieldInteraction()
    setCurrentStepIndex((prev) => Math.max(0, prev - 1))
  }, [currentStepIndex, isLoading, onFieldInteraction])

  const fieldHasError = useCallback(
    (field: keyof TenantRegistrationFormState) => {
      const meta = form.getFieldMeta(field)
      return Boolean(meta?.errors?.length)
    },
    [form],
  )

  const focusFirstInvalidStep = useCallback(() => {
    const invalidStepIndex = REGISTRATION_STEPS.findIndex((step) =>
      getStepFields(step.id).some((field) => fieldHasError(field)),
    )

    if (invalidStepIndex !== -1 && invalidStepIndex !== currentStepIndex) {
      setCurrentStepIndex(invalidStepIndex)
      setMaxVisitedIndex((prev) => Math.max(prev, invalidStepIndex))
    }
  }, [currentStepIndex, fieldHasError, getStepFields])

  const ensureStepValid = useCallback(
    async (stepId: (typeof REGISTRATION_STEPS)[number]['id']) => {
      const fields = getStepFields(stepId)

      await Promise.all(fields.map((field) => form.validateField(field, 'submit')))

      return fields.every((field) => !fieldHasError(field))
    },
    [fieldHasError, form, getStepFields],
  )

  const handleNext = useCallback(async () => {
    if (isLoading) return

    const step = REGISTRATION_STEPS[currentStepIndex]
    if (step.id === 'site') {
      const result = siteSettingsSchema.safeParse(formValues)
      if (!result.success) {
        toast.error(`Error in ${result.error.issues.map((issue) => issue.message).join(', ')}`)
        return
      }

      setCurrentStepIndex(currentStepIndex + 1)
      return
    }
    const stepIsValid = await ensureStepValid(step.id)

    if (!stepIsValid) {
      focusFirstInvalidStep()
      return
    }

    if (step.id === 'review') {
      await form.validateAllFields('submit')
      const { state } = form
      if (!state.isFormValid) {
        focusFirstInvalidStep()
        return
      }

      onFieldInteraction()

      const trimmedTenantName = state.values.tenantName.trim()
      const trimmedTenantSlug = state.values.tenantSlug.trim()
      const siteSettings = (
        siteFieldMap && siteFieldMap.size > 0
          ? Array.from(siteFieldMap.entries()).map(([key, field]) => ({
              key,
              value: serializeSiteFieldValue(field, state.values[key]),
            }))
          : siteFieldKeys.map((key) => {
              const entry = state.values[key]
              if (typeof entry === 'boolean') {
                return { key, value: entry ? 'true' : 'false' }
              }
              const text = String(entry ?? '').trim()
              return { key, value: text }
            })
      ) as Array<{ key: TenantSiteFieldKey; value: string }>

      registerTenant({
        tenantName: trimmedTenantName,
        tenantSlug: trimmedTenantSlug,
        accountName: state.values.accountName.trim(),
        email: state.values.email.trim(),
        password: state.values.password,
        settings: siteSettings,
      })
      return
    }

    setCurrentStepIndex((prev) => {
      const nextIndex = Math.min(REGISTRATION_STEPS.length - 1, prev + 1)
      setMaxVisitedIndex((visited) => Math.max(visited, nextIndex))
      return nextIndex
    })
  }, [
    currentStepIndex,
    ensureStepValid,
    focusFirstInvalidStep,
    form,
    isLoading,
    onFieldInteraction,
    registerTenant,
    siteFieldKeys,
    siteFieldMap,
  ])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return
      if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return
      const nativeEvent = event.nativeEvent as unknown as { isComposing?: boolean }
      if (nativeEvent?.isComposing) return

      const target = event.target as HTMLElement
      if (target.isContentEditable) return
      if (target.tagName === 'TEXTAREA') return
      if (target.tagName === 'BUTTON' || target.tagName === 'A') return
      if (target.tagName === 'INPUT') {
        const { type } = target as HTMLInputElement
        if (type === 'checkbox' || type === 'radio') return
      }

      event.preventDefault()
      void handleNext()
    },
    [handleNext],
  )

  const siteFieldErrors = useMemo(() => {
    const result: Record<string, string> = {}
    for (const key of siteFieldKeys) {
      const meta = fieldMeta?.[key]
      const message = meta ? firstErrorMessage(meta.errors) : undefined
      if (message) {
        result[key] = message
      }
    }
    return result
  }, [fieldMeta, siteFieldKeys])

  const StepComponent = useMemo(() => {
    const step = REGISTRATION_STEPS[currentStepIndex]
    switch (step.id) {
      case 'workspace': {
        return (
          <WorkspaceStep
            form={form}
            slugManuallyEditedRef={slugManuallyEditedRef}
            isSubmitting={isLoading}
            onFieldInteraction={onFieldInteraction}
          />
        )
      }
      case 'site': {
        return (
          <SiteSettingsStep
            form={form}
            schema={siteSchema}
            isLoading={siteSchemaLoading}
            errorMessage={siteSchemaErrorMessage}
            values={formValues}
            errors={siteFieldErrors}
            onFieldInteraction={onFieldInteraction}
          />
        )
      }
      case 'admin': {
        return <AdminStep form={form} isSubmitting={isLoading} onFieldInteraction={onFieldInteraction} />
      }
      case 'review': {
        return (
          <ReviewStep
            form={form}
            values={formValues}
            siteSchema={siteSchema}
            siteSchemaLoading={siteSchemaLoading}
            siteSchemaError={siteSchemaErrorMessage}
            isSubmitting={isLoading}
            serverError={error}
            onFieldInteraction={onFieldInteraction}
          />
        )
      }
      default: {
        return null
      }
    }
  }, [
    currentStepIndex,
    error,
    form,
    formValues,
    isLoading,
    onFieldInteraction,
    siteFieldErrors,
    siteSchema,
    siteSchemaErrorMessage,
    siteSchemaLoading,
  ])

  const isLastStep = currentStepIndex === REGISTRATION_STEPS.length - 1

  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <LinearBorderContainer className="bg-background-tertiary h-[85vh] w-full max-w-5xl">
        <div className="grid h-full lg:grid-cols-[280px_1fr]">
          <div className="relative h-full">
            <div className="via-text/20 absolute top-0 right-0 bottom-0 w-[0.5px] bg-linear-to-b from-transparent to-transparent" />
            <RegistrationSidebar
              currentStepIndex={currentStepIndex}
              canNavigateTo={canNavigateTo}
              onStepSelect={jumpToStep}
            />
          </div>

          <main className="flex h-full w-[700px] flex-col">
            <div className="shrink-0">
              <RegistrationHeader currentStepIndex={currentStepIndex} />
              <div className="via-text/20 h-[0.5px] bg-linear-to-r from-transparent to-transparent" />
            </div>

            <div className="relative flex h-0 flex-1">
              <ScrollArea rootClassName="absolute! inset-0 h-full w-full">
                <section ref={contentRef} className="p-12" onKeyDown={handleKeyDown}>
                  {StepComponent}
                </section>
              </ScrollArea>
            </div>

            <div className="shrink-0">
              <div className="via-text/20 h-[0.5px] bg-linear-to-r from-transparent to-transparent" />
              <RegistrationFooter
                disableBack={currentStepIndex === 0}
                isSubmitting={isLoading}
                isLastStep={isLastStep}
                onBack={handleBack}
                onNext={() => {
                  void handleNext()
                }}
              />
            </div>
          </main>
        </div>
      </LinearBorderContainer>

      <p className="text-text-tertiary mt-6 text-sm">
        Already have an account?{' '}
        <Link to="/login" className="text-accent hover:underline">
          Sign in
        </Link>
        .
      </p>
    </div>
  )
}
