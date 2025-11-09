import { useMutation, useQuery } from '@tanstack/react-query'
import { FetchError } from 'ofetch'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import type { UiFieldNode, UiSchema } from '~/modules/schema-form/types'

import type { OnboardingInitPayload } from '../api'
import { getOnboardingSiteSchema, getOnboardingStatus, postOnboardingInit } from '../api'
import type { OnboardingSettingKey, OnboardingSiteSettingKey, OnboardingStepId } from '../constants'
import { ONBOARDING_STEPS } from '../constants'
import { DEFAULT_SITE_SETTINGS_VALUES, SITE_SETTINGS_KEYS, siteSettingsSchema } from '../siteSchema'
import type { AdminFormState, OnboardingErrors, SettingFormState, SiteFormState, TenantFormState } from '../types'
import {
  coerceSiteFieldValue,
  collectSchemaFieldMap,
  createInitialSettingsState,
  createInitialSiteStateFromFieldMap,
  getFieldByKey,
  isLikelyEmail,
  maskSecret,
  serializeSiteFieldValue,
  slugify,
} from '../utils'

const INITIAL_STEP_INDEX = 0

const toStringValue = (value: unknown) => (value == null ? '' : String(value))

const trimmedNonEmpty = (message: string) => z.preprocess(toStringValue, z.string().trim().min(1, { message }))

const slugSchema = z.preprocess(
  toStringValue,
  z
    .string()
    .trim()
    .min(1, { message: 'Slug is required' })
    .regex(/^[a-z0-9-]+$/, { message: 'Only lowercase letters, numbers, and hyphen are allowed' }),
)

const passwordSchema = z.preprocess(
  toStringValue,
  z.string().min(1, { message: 'Password is required' }).min(8, { message: 'Password must be at least 8 characters' }),
)

const confirmPasswordSchema = z.preprocess(
  toStringValue,
  z.string().min(1, { message: 'Confirm the password to continue' }),
)

const tenantSchema = z.object({
  name: trimmedNonEmpty('Workspace name is required'),
  slug: slugSchema,
})

const adminSchema = z
  .object({
    name: trimmedNonEmpty('Administrator name is required').refine((value) => !/^root$/i.test(value), {
      message: 'The name "root" is reserved',
    }),
    email: trimmedNonEmpty('Email is required').refine((value) => isLikelyEmail(value), {
      message: 'Enter a valid email address',
    }),
    password: passwordSchema,
    confirmPassword: confirmPasswordSchema,
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Passwords do not match',
        path: ['confirmPassword'],
      })
    }
  })

export function useOnboardingWizard() {
  const [currentStepIndex, setCurrentStepIndex] = useState(INITIAL_STEP_INDEX)
  const [tenant, setTenant] = useState<TenantFormState>({
    name: '',
    slug: '',
  })
  const [slugLocked, setSlugLocked] = useState(false)
  const [admin, setAdmin] = useState<AdminFormState>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [settingsState, setSettingsState] = useState<SettingFormState>(createInitialSettingsState)
  const [site, setSite] = useState<SiteFormState>(() => ({ ...DEFAULT_SITE_SETTINGS_VALUES }))
  const [acknowledged, setAcknowledged] = useState(false)
  const [errors, setErrors] = useState<OnboardingErrors>({})
  const [siteDefaultsApplied, setSiteDefaultsApplied] = useState(false)

  const currentStep = ONBOARDING_STEPS[currentStepIndex] ?? ONBOARDING_STEPS[INITIAL_STEP_INDEX]

  const query = useQuery({
    queryKey: ['onboarding', 'status'],
    queryFn: getOnboardingStatus,
    staleTime: Infinity,
  })

  const siteSchemaQuery = useQuery({
    queryKey: ['onboarding', 'site-schema'],
    queryFn: getOnboardingSiteSchema,
    staleTime: Infinity,
  })

  const siteSchemaData = siteSchemaQuery.data as
    | {
        schema?: UiSchema<OnboardingSiteSettingKey>
        values?: Partial<Record<OnboardingSiteSettingKey, unknown>>
      }
    | undefined

  const siteSchema = siteSchemaData?.schema ?? null

  useEffect(() => {
    if (!siteSchema || siteDefaultsApplied) {
      return
    }

    const fieldMap = collectSchemaFieldMap(siteSchema)
    const defaults = createInitialSiteStateFromFieldMap(fieldMap)
    const values = siteSchemaData?.values ?? {}
    const next: SiteFormState = { ...DEFAULT_SITE_SETTINGS_VALUES, ...defaults }

    for (const [key, field] of fieldMap) {
      const coerced = coerceSiteFieldValue(field, values[key])
      if (coerced !== undefined) {
        next[key] = coerced
      }
    }

    setSite(next)
    setSiteDefaultsApplied(true)
  }, [siteDefaultsApplied, siteSchema, siteSchemaData?.values])

  const siteSchemaLoading = siteSchemaQuery.isLoading && !siteSchema
  const siteSchemaError = siteSchemaQuery.isError

  const mutation = useMutation({
    mutationFn: (payload: OnboardingInitPayload) => postOnboardingInit(payload),
    onSuccess: () => {
      toast.success('Initialization completed', {
        description:
          'Super administrator credentials were printed to the core service logs. Store them securely before closing the terminal.',
      })
      void query.refetch()
    },
    onError: (error) => {
      if (error instanceof FetchError) {
        const message =
          typeof error.data === 'object' && error.data && 'message' in error.data
            ? String(error.data.message)
            : 'Backend rejected the initialization request.'
        toast.error('Initialization failed', { description: message })
      } else {
        toast.error('Initialization failed', {
          description: 'Unexpected error occurred. Please retry or inspect the logs.',
        })
      }
    },
  })

  const setFieldError = (key: string, reason: string | null) => {
    setErrors((prev) => {
      const next = { ...prev }
      if (!reason) {
        delete next[key]
      } else {
        next[key] = reason
      }
      return next
    })
  }

  const validateTenant = () => {
    const result = tenantSchema.safeParse(tenant)

    if (result.success) {
      setFieldError('tenant.name', null)
      setFieldError('tenant.slug', null)
      return true
    }

    const { fieldErrors } = result.error.flatten((issue) => issue.message)
    setFieldError('tenant.name', fieldErrors.name?.[0] ?? null)
    setFieldError('tenant.slug', fieldErrors.slug?.[0] ?? null)
    return false
  }

  const validateAdmin = () => {
    const result = adminSchema.safeParse(admin)

    if (result.success) {
      setFieldError('admin.name', null)
      setFieldError('admin.email', null)
      setFieldError('admin.password', null)
      setFieldError('admin.confirmPassword', null)
      return true
    }

    const { fieldErrors } = result.error.flatten((issue) => issue.message)
    setFieldError('admin.name', fieldErrors.name?.[0] ?? null)
    setFieldError('admin.email', fieldErrors.email?.[0] ?? null)
    setFieldError('admin.password', fieldErrors.password?.[0] ?? null)
    setFieldError('admin.confirmPassword', fieldErrors.confirmPassword?.[0] ?? null)
    return false
  }

  const validateSite = () => {
    const candidate: Record<string, unknown> = {}
    for (const key of SITE_SETTINGS_KEYS) {
      candidate[key] = site[key] ?? DEFAULT_SITE_SETTINGS_VALUES[key]
    }

    const result = siteSettingsSchema.safeParse(candidate)
    const fieldErrors: Record<string, string> = {}

    if (!result.success) {
      for (const issue of result.error.issues) {
        const pathKey = issue.path[0]
        if (typeof pathKey === 'string' && !(pathKey in fieldErrors)) {
          fieldErrors[pathKey] = issue.message
        }
      }
    }

    for (const key of SITE_SETTINGS_KEYS) {
      setFieldError(key, fieldErrors[key] ?? null)
    }

    return result.success
  }

  const validateSettings = () => {
    let valid = true
    for (const [key, entry] of Object.entries(settingsState) as Array<
      [OnboardingSettingKey, SettingFormState[OnboardingSettingKey]]
    >) {
      if (!entry.enabled) {
        setFieldError(`settings.${key}`, null)
        continue
      }
      if (!entry.value.trim()) {
        setFieldError(`settings.${key}`, 'Value is required when the setting is enabled')
        valid = false
      } else {
        setFieldError(`settings.${key}`, null)
      }
    }
    return valid
  }

  const validateAcknowledgement = () => {
    if (!acknowledged) {
      setFieldError('review.ack', 'Please confirm you saved the super administrator credentials before continuing')
      return false
    }
    setFieldError('review.ack', null)
    return true
  }

  const validators: Partial<Record<OnboardingStepId, () => boolean>> = {
    welcome: () => true,
    tenant: validateTenant,
    site: validateSite,
    admin: validateAdmin,
    settings: validateSettings,
    review: validateAcknowledgement,
  }

  const submitInitialization = () => {
    const payload: OnboardingInitPayload = {
      tenant: {
        name: tenant.name.trim(),
        slug: tenant.slug.trim(),
      },
      admin: {
        name: admin.name.trim(),
        email: admin.email.trim(),
        password: admin.password,
      },
    }

    const settingEntries = Object.entries(settingsState)
      .filter(([, entry]) => entry.enabled && entry.value.trim())
      .map(([key, entry]) => ({
        key: key as OnboardingSettingKey,
        value: entry.value.trim(),
      }))

    const fieldMap = siteSchema
      ? collectSchemaFieldMap(siteSchema)
      : new Map<OnboardingSiteSettingKey, UiFieldNode<OnboardingSiteSettingKey>>()
    const siteEntries = Array.from(fieldMap.entries()).map(([key, field]) => ({
      key,
      value: serializeSiteFieldValue(field, site[key]),
    }))

    const combined = [...settingEntries, ...siteEntries]

    if (combined.length > 0) {
      payload.settings = combined as Array<{ key: OnboardingSettingKey | OnboardingSiteSettingKey; value: string }>
    }

    mutation.mutate(payload)
  }

  const goToNext = () => {
    const validator = validators[currentStep.id]
    if (validator && !validator()) {
      return
    }

    if (currentStepIndex === ONBOARDING_STEPS.length - 1) {
      submitInitialization()
      return
    }

    setCurrentStepIndex((prev) => Math.min(prev + 1, ONBOARDING_STEPS.length - 1))
  }

  const goToPrevious = () => {
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0))
  }

  const jumpToStep = (index: number) => {
    if (index <= currentStepIndex) {
      setCurrentStepIndex(index)
    }
  }

  const updateTenantName = (value: string) => {
    setTenant((prev) => {
      if (!slugLocked) {
        return { ...prev, name: value, slug: slugify(value) }
      }
      return { ...prev, name: value }
    })
    setFieldError('tenant.name', null)
  }

  const updateTenantSlug = (value: string) => {
    setSlugLocked(true)
    setTenant((prev) => ({ ...prev, slug: value }))
    setFieldError('tenant.slug', null)
  }

  const updateAdminField = (field: keyof AdminFormState, value: string) => {
    setAdmin((prev) => ({ ...prev, [field]: value }))
    setFieldError(`admin.${field}`, null)
  }

  const toggleSetting = (key: OnboardingSettingKey, enabled: boolean) => {
    setSettingsState((prev) => {
      const next = { ...prev, [key]: { ...prev[key], enabled } }
      if (!enabled) {
        next[key].value = ''
        setFieldError(`settings.${key}`, null)
      }
      return next
    })
  }

  const updateSettingValue = (key: OnboardingSettingKey, value: string) => {
    setSettingsState((prev) => ({
      ...prev,
      [key]: { ...prev[key], value },
    }))
    setFieldError(`settings.${key}`, null)
  }

  const reviewSettings = Object.entries(settingsState)
    .filter(([, entry]) => entry.enabled && entry.value.trim())
    .map(([key, entry]) => ({
      definition: getFieldByKey(key as OnboardingSettingKey),
      value: entry.value.trim(),
    }))

  const updateSiteField = (key: OnboardingSiteSettingKey, value: string | boolean) => {
    setSite((prev) => ({
      ...prev,
      [key]:
        typeof value === 'boolean' ? value : value == null ? '' : typeof value === 'number' ? String(value) : value,
    }))
    setFieldError(key, null)
  }

  return {
    query,
    mutation,
    siteSchema,
    siteSchemaLoading,
    siteSchemaError,
    currentStepIndex,
    currentStep,
    goToNext,
    goToPrevious,
    jumpToStep,
    canNavigateTo: (index: number) => index <= currentStepIndex,
    tenant,
    admin,
    site,
    settingsState,
    acknowledged,
    setAcknowledged: (value: boolean) => {
      setAcknowledged(value)
      if (value) {
        setFieldError('review.ack', null)
      }
    },
    errors,
    updateTenantName,
    updateTenantSlug,
    updateAdminField,
    toggleSetting,
    updateSettingValue,
    updateSiteField,
    reviewSettings,
    maskSecret,
  }
}
