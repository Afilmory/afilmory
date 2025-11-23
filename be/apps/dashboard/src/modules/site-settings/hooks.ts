import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { getRequestErrorMessage } from '~/lib/errors'

import {
  deleteTenantDomain,
  getSiteAuthorProfile,
  getSiteSettingUiSchema,
  listTenantDomains,
  requestTenantDomain,
  updateSiteAuthorProfile,
  updateSiteSettings,
  verifyTenantDomain,
} from './api'
import type { SiteSettingEntryInput, TenantDomain, UpdateSiteAuthorPayload } from './types'

export const SITE_SETTING_UI_SCHEMA_QUERY_KEY = ['site-settings', 'ui-schema'] as const
export const SITE_AUTHOR_PROFILE_QUERY_KEY = ['site-settings', 'author-profile'] as const
export const TENANT_DOMAINS_QUERY_KEY = ['tenant', 'domains'] as const

export function useSiteSettingUiSchemaQuery() {
  return useQuery({
    queryKey: SITE_SETTING_UI_SCHEMA_QUERY_KEY,
    queryFn: getSiteSettingUiSchema,
  })
}

export function useUpdateSiteSettingsMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (entries: readonly SiteSettingEntryInput[]) => {
      await updateSiteSettings(entries)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: SITE_SETTING_UI_SCHEMA_QUERY_KEY,
      })
    },
  })
}

export function useSiteAuthorProfileQuery() {
  return useQuery({
    queryKey: SITE_AUTHOR_PROFILE_QUERY_KEY,
    queryFn: getSiteAuthorProfile,
  })
}

export function useUpdateSiteAuthorProfileMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: UpdateSiteAuthorPayload) => {
      return await updateSiteAuthorProfile(payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SITE_AUTHOR_PROFILE_QUERY_KEY })
    },
  })
}

export function useTenantDomainsQuery() {
  return useQuery({
    queryKey: TENANT_DOMAINS_QUERY_KEY,
    queryFn: async () => {
      const { domains } = await listTenantDomains()
      return domains
    },
  })
}

export function useRequestTenantDomainMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: async (domain: string) => {
      const { domain: record } = await requestTenantDomain(domain)
      return record satisfies TenantDomain
    },
    onSuccess: () => {
      toast.success(t('settings.domain.toast.request-success'))
      void queryClient.invalidateQueries({ queryKey: TENANT_DOMAINS_QUERY_KEY })
    },
    onError: (error) => {
      const description = getRequestErrorMessage(error, t('errors.request.generic'))
      toast.error(t('settings.domain.toast.request-failed'), { description })
    },
  })
}

export function useVerifyTenantDomainMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: async (domainId: string) => {
      const { domain } = await verifyTenantDomain(domainId)
      return domain satisfies TenantDomain
    },
    onSuccess: () => {
      toast.success(t('settings.domain.toast.verify-success'))
      void queryClient.invalidateQueries({ queryKey: TENANT_DOMAINS_QUERY_KEY })
    },
    onError: (error) => {
      const description = getRequestErrorMessage(error, t('errors.request.generic'))
      toast.error(t('settings.domain.toast.verify-failed'), { description })
    },
  })
}

export function useDeleteTenantDomainMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: async (domainId: string) => {
      await deleteTenantDomain(domainId)
    },
    onSuccess: () => {
      toast.success(t('settings.domain.toast.delete-success'))
      void queryClient.invalidateQueries({ queryKey: TENANT_DOMAINS_QUERY_KEY })
    },
    onError: (error) => {
      const description = getRequestErrorMessage(error, t('errors.request.generic'))
      toast.error(t('settings.domain.toast.delete-failed'), { description })
    },
  })
}
