import { useQuery } from '@tanstack/react-query'

import { fetchSocialProviders } from '../api/socialProviders'

export const AUTH_SOCIAL_PROVIDERS_QUERY_KEY = ['auth', 'social-providers'] as const

export function useSocialProviders() {
  return useQuery({
    queryKey: AUTH_SOCIAL_PROVIDERS_QUERY_KEY,
    queryFn: fetchSocialProviders,
    staleTime: 5 * 60 * 1000,
  })
}
