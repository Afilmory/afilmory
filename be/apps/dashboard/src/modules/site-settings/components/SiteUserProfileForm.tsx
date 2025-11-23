import { Button, FormHelperText, Input, Label } from '@afilmory/ui'
import { Spring } from '@afilmory/utils'
import { m } from 'motion/react'
import { startTransition, useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'
import { MainPageLayout, useMainPageLayout } from '~/components/layouts/MainPageLayout'
import { useBlock } from '~/hooks/useBlock'
import { getRequestErrorMessage } from '~/lib/errors'

import { useSiteAuthorProfileQuery, useUpdateSiteAuthorProfileMutation } from '../hooks'
import type { SiteAuthorProfile, UpdateSiteAuthorPayload } from '../types'

const siteUserKeys = {
  toastSuccess: 'site.user.toast.success',
  toastError: 'site.user.toast.error',
  toastErrorDescription: 'site.user.toast.error-description',
  loadingError: 'site.user.error.loading',
  blocker: {
    title: 'site.user.blocker.title',
    description: 'site.user.blocker.description',
    confirm: 'site.user.blocker.confirm',
    cancel: 'site.user.blocker.cancel',
  },
  button: {
    saving: 'site.user.button.saving',
    save: 'site.user.button.save',
  },
  header: {
    badge: 'site.user.header.badge',
    title: 'site.user.header.title',
    description: 'site.user.header.description',
  },
  preview: {
    fallbackName: 'site.user.preview.fallback',
    avatarAlt: 'site.user.preview.avatar-alt',
    lastUpdated: 'site.user.preview.last-updated',
    neverUpdated: 'site.user.preview.never-updated',
  },
  form: {
    name: {
      label: 'site.user.form.name.label',
      placeholder: 'site.user.form.name.placeholder',
      helper: 'site.user.form.name.helper',
    },
    display: {
      label: 'site.user.form.display.label',
      placeholder: 'site.user.form.display.placeholder',
      helper: 'site.user.form.display.helper',
    },
    username: {
      label: 'site.user.form.username.label',
      placeholder: 'site.user.form.username.placeholder',
      helper: 'site.user.form.username.helper',
    },
    avatar: {
      label: 'site.user.form.avatar.label',
      placeholder: 'site.user.form.avatar.placeholder',
      helper: 'site.user.form.avatar.helper',
    },
  },
} as const

type UserFormState = {
  name: string
  displayUsername: string
  username: string
  avatar: string
}

const emptyState: UserFormState = {
  name: '',
  displayUsername: '',
  username: '',
  avatar: '',
}

function toFormState(profile: SiteAuthorProfile): UserFormState {
  return {
    name: profile.name ?? '',
    displayUsername: profile.displayUsername ?? '',
    username: profile.username ?? '',
    avatar: profile.avatar ?? '',
  }
}

function buildPayload(state: UserFormState): UpdateSiteAuthorPayload {
  const normalize = (value: string) => {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  return {
    name: state.name.trim(),
    displayUsername: normalize(state.displayUsername),
    username: normalize(state.username),
    avatar: normalize(state.avatar),
  }
}

export function SiteUserProfileForm() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language ?? i18n.resolvedLanguage ?? 'en'
  const { data, isLoading, isError, error } = useSiteAuthorProfileQuery()
  const updateMutation = useUpdateSiteAuthorProfileMutation()
  const { setHeaderActionState } = useMainPageLayout()
  const formId = useId()
  const [formState, setFormState] = useState<UserFormState>(emptyState)
  const [initialState, setInitialState] = useState<UserFormState>(emptyState)

  useEffect(() => {
    if (!data) {
      return
    }
    const next = toFormState(data)
    startTransition(() => {
      setFormState(next)
      setInitialState(next)
    })
  }, [data])

  const isDirty = useMemo(() => {
    return (
      formState.name !== initialState.name ||
      formState.displayUsername !== initialState.displayUsername ||
      formState.username !== initialState.username ||
      formState.avatar !== initialState.avatar
    )
  }, [formState, initialState])

  const canSubmit = Boolean(data) && !isLoading && isDirty

  const formatTimestamp = useCallback(
    (iso: string | undefined | null) => {
      if (!iso) return ''
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return ''
      try {
        return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
      } catch {
        return date.toLocaleString()
      }
    },
    [locale],
  )

  useEffect(() => {
    setHeaderActionState({
      disabled: !canSubmit,
      loading: updateMutation.isPending,
    })

    return () => {
      setHeaderActionState({ disabled: false, loading: false })
    }
  }, [canSubmit, setHeaderActionState, updateMutation.isPending])

  const handleChange = (field: keyof UserFormState) => (value: string) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault()

    if (!data || !isDirty || updateMutation.isPending) {
      return
    }

    try {
      const payload = buildPayload(formState)
      await updateMutation.mutateAsync(payload)
      setInitialState(formState)
      toast.success(t(siteUserKeys.toastSuccess))
    } catch (mutationError) {
      toast.error(t(siteUserKeys.toastError), {
        description: getRequestErrorMessage(mutationError, t(siteUserKeys.toastErrorDescription)),
      })
    }
  }

  const headerActionPortal = (
    <MainPageLayout.Actions>
      <Button
        type="submit"
        form={formId}
        variant="primary"
        size="sm"
        disabled={!canSubmit}
        isLoading={updateMutation.isPending}
        loadingText={t(siteUserKeys.button.saving)}
      >
        {t(siteUserKeys.button.save)}
      </Button>
    </MainPageLayout.Actions>
  )

  useBlock({
    when: isDirty,
    title: t(siteUserKeys.blocker.title),
    description: t(siteUserKeys.blocker.description),
    confirmText: t(siteUserKeys.blocker.confirm),
    cancelText: t(siteUserKeys.blocker.cancel),
  })
  if (isLoading && !data) {
    return (
      <>
        {headerActionPortal}
        <LinearBorderPanel className="p-6">
          <div className="space-y-4">
            <div className="bg-fill/40 h-6 w-2/5 animate-pulse rounded-lg" />
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={`skeleton-field-${index}`} className="space-y-3">
                  <div className="bg-fill/30 h-4 w-1/3 animate-pulse rounded" />
                  <div className="bg-fill/20 h-10 animate-pulse rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </LinearBorderPanel>
      </>
    )
  }

  if (isError && !data) {
    return (
      <>
        {headerActionPortal}
        <LinearBorderPanel className="p-6">
          <div className="text-red flex items-center gap-3 text-sm">
            <i className="i-mingcute-close-circle-fill text-lg" />
            <span>{getRequestErrorMessage(error, t(siteUserKeys.loadingError))}</span>
          </div>
        </LinearBorderPanel>
      </>
    )
  }

  const profile = data
  const avatarPreview = formState.avatar?.trim() ? formState.avatar.trim() : null
  const previewInitial =
    (formState.displayUsername || formState.name || profile?.email || 'A').charAt(0)?.toUpperCase() ?? 'A'

  return (
    <>
      {headerActionPortal}
      <LinearBorderPanel className="bg-background-secondary">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-6">
          <div>
            <p className="text-text-tertiary text-xs font-semibold uppercase tracking-wider">
              {t(siteUserKeys.header.badge)}
            </p>
            <h2 className="text-text mt-1 text-xl font-semibold">{t(siteUserKeys.header.title)}</h2>
            <p className="text-text-tertiary mt-1 text-sm">{t(siteUserKeys.header.description)}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative size-16 sm:size-20 overflow-hidden rounded-full border border-white/5 shadow-inner">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt={t(siteUserKeys.preview.avatarAlt)}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="bg-accent/15 text-accent flex h-full w-full items-center justify-center text-2xl font-semibold">
                  {previewInitial}
                </div>
              )}
            </div>
            <div className="space-y-1 text-sm">
              <p className="text-text font-semibold">
                {formState.displayUsername || formState.name || t(siteUserKeys.preview.fallbackName)}
              </p>
              <p className="text-text-tertiary text-xs">{profile?.email}</p>
              <p className="text-text-tertiary text-xs">
                {t(siteUserKeys.preview.lastUpdated, {
                  time: formatTimestamp(profile?.updatedAt) || t(siteUserKeys.preview.neverUpdated),
                })}
              </p>
            </div>
          </div>
        </div>

        <m.form
          id={formId}
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={Spring.presets.smooth}
          className="space-y-6 p-6"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="user-name">{t(siteUserKeys.form.name.label)}</Label>
              <Input
                id="user-name"
                value={formState.name}
                onInput={(event) => handleChange('name')(event.currentTarget.value)}
                placeholder={t(siteUserKeys.form.name.placeholder)}
                required
              />
              <FormHelperText>{t(siteUserKeys.form.name.helper)}</FormHelperText>
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-display">{t(siteUserKeys.form.display.label)}</Label>
              <Input
                id="user-display"
                value={formState.displayUsername}
                onInput={(event) => handleChange('displayUsername')(event.currentTarget.value)}
                placeholder={t(siteUserKeys.form.display.placeholder)}
              />
              <FormHelperText>{t(siteUserKeys.form.display.helper)}</FormHelperText>
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-username">{t(siteUserKeys.form.username.label)}</Label>
              <Input
                id="user-username"
                value={formState.username}
                onInput={(event) => handleChange('username')(event.currentTarget.value)}
                placeholder={t(siteUserKeys.form.username.placeholder)}
              />
              <FormHelperText>{t(siteUserKeys.form.username.helper)}</FormHelperText>
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-avatar">{t(siteUserKeys.form.avatar.label)}</Label>
              <Input
                id="user-avatar"
                type="url"
                value={formState.avatar}
                onInput={(event) => handleChange('avatar')(event.currentTarget.value)}
                placeholder={t(siteUserKeys.form.avatar.placeholder)}
              />
              <FormHelperText>{t(siteUserKeys.form.avatar.helper)}</FormHelperText>
            </div>
          </div>
        </m.form>
      </LinearBorderPanel>
    </>
  )
}
