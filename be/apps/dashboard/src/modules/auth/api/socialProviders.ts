import { coreApi } from '~/lib/api-client'

export interface SocialProviderDefinition {
  id: string
  name: string
  icon: string
  callbackPath: string | null
}

export interface SocialProvidersResponse {
  providers: SocialProviderDefinition[]
}

export async function fetchSocialProviders(): Promise<SocialProvidersResponse> {
  return await coreApi<SocialProvidersResponse>('/auth/social/providers', { method: 'GET' })
}
