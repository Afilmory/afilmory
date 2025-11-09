import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type {LinkSocialAccountPayload, SocialAccountRecord, UnlinkSocialAccountPayload} from '../api/socialAccounts';
import {
  fetchSocialAccounts,
  linkSocialAccount,
  unlinkSocialAccount
} from '../api/socialAccounts'

export const SOCIAL_ACCOUNTS_QUERY_KEY = ['auth', 'social-accounts'] as const

export function useSocialAccounts() {
  return useQuery<SocialAccountRecord[]>({
    queryKey: SOCIAL_ACCOUNTS_QUERY_KEY,
    queryFn: fetchSocialAccounts,
  })
}

export function useLinkSocialAccountMutation() {
  return useMutation({
    mutationFn: async (payload: LinkSocialAccountPayload) => await linkSocialAccount(payload),
  })
}

export function useUnlinkSocialAccountMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: UnlinkSocialAccountPayload) => await unlinkSocialAccount(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SOCIAL_ACCOUNTS_QUERY_KEY })
    },
  })
}
