import { useMutation } from '@tanstack/react-query'
import { FetchError } from 'ofetch'
import { useState } from 'react'

import type { RegisterTenantPayload } from '~/modules/auth/api/registerTenant'
import { registerTenant } from '~/modules/auth/api/registerTenant'

import type { TenantSiteFieldKey } from './useRegistrationForm'

interface TenantRegistrationRequest {
  tenantName: string
  tenantSlug: string
  accountName: string
  email: string
  password: string
  settings: Array<{ key: TenantSiteFieldKey; value: string }>
}

const SECOND_LEVEL_PUBLIC_SUFFIXES = new Set(['ac', 'co', 'com', 'edu', 'gov', 'net', 'org'])

function resolveBaseDomain(hostname: string): string {
  const envValue = (import.meta.env as Record<string, unknown> | undefined)?.VITE_APP_TENANT_BASE_DOMAIN
  if (typeof envValue === 'string' && envValue.trim().length > 0) {
    return envValue.trim().replace(/^\./, '').toLowerCase()
  }

  if (!hostname) {
    return ''
  }

  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return 'localhost'
  }

  const parts = hostname.split('.').filter(Boolean)
  if (parts.length <= 2) {
    return hostname
  }

  const tld = parts.at(-1) ?? ''
  const secondLevel = parts.at(-2) ?? ''

  if (tld.length === 2 && SECOND_LEVEL_PUBLIC_SUFFIXES.has(secondLevel) && parts.length >= 3) {
    return parts.slice(-3).join('.').toLowerCase()
  }

  return parts.slice(-2).join('.').toLowerCase()
}

function buildTenantLoginUrl(slug: string): string {
  const normalizedSlug = slug.trim().toLowerCase()
  if (!normalizedSlug) {
    throw new Error('Registration succeeded but a workspace slug was not returned.')
  }

  const { protocol, hostname, port } = window.location
  const baseDomain = resolveBaseDomain(hostname)

  if (!baseDomain) {
    throw new Error('Unable to resolve base domain for workspace login redirect.')
  }

  const shouldAppendPort = Boolean(
    port && (baseDomain === 'localhost' || hostname === baseDomain || hostname.endsWith(`.${baseDomain}`)),
  )

  const portSegment = shouldAppendPort ? `:${port}` : ''
  const scheme = protocol || 'https:'

  return `${scheme}//${normalizedSlug}.${baseDomain}${portSegment}/login`
}

export function useRegisterTenant() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async (data: TenantRegistrationRequest) => {
      const payload: RegisterTenantPayload = {
        tenant: {
          name: data.tenantName.trim(),
          slug: data.tenantSlug.trim(),
        },
        account: {
          name: data.accountName.trim() || data.email.trim(),
          email: data.email.trim(),
          password: data.password,
        },
      }

      if (data.settings.length > 0) {
        payload.settings = data.settings
      }

      const response = await registerTenant(payload)

      const headerSlug = response.headers.get('x-tenant-slug')?.trim().toLowerCase() ?? null
      const submittedSlug = payload.tenant.slug?.trim().toLowerCase() ?? ''
      const finalSlug = headerSlug && headerSlug.length > 0 ? headerSlug : submittedSlug

      if (!finalSlug) {
        throw new Error('Registration succeeded but the workspace slug could not be determined.')
      }

      return {
        slug: finalSlug,
      }
    },
    onSuccess: ({ slug }) => {
      try {
        const loginUrl = buildTenantLoginUrl(slug)
        setErrorMessage(null)
        window.location.replace(loginUrl)
      } catch (redirectError) {
        if (redirectError instanceof Error) {
          setErrorMessage(redirectError.message)
        } else {
          setErrorMessage('Registration succeeded but redirect failed. Please use your workspace URL to sign in.')
        }
      }
    },
    onError: (error: Error) => {
      if (error instanceof FetchError) {
        const status = error.statusCode ?? error.response?.status
        const serverMessage = (error.data as any)?.message

        switch (status) {
          case 400: {
            setErrorMessage(serverMessage || 'Please verify your inputs and try again')
            break
          }
          case 403: {
            setErrorMessage(serverMessage || 'Registration is currently disabled')
            break
          }
          case 409: {
            setErrorMessage(serverMessage || 'An account or workspace with these details already exists')
            break
          }
          case 429: {
            setErrorMessage('Too many attempts. Please try again later')
            break
          }
          default: {
            setErrorMessage(serverMessage || error.message || 'Registration failed. Please try again')
          }
        }
      } else {
        setErrorMessage(error.message || 'An unexpected error occurred. Please try again')
      }
    },
  })

  const clearError = () => setErrorMessage(null)

  return {
    registerTenant: mutation.mutate,
    isLoading: mutation.isPending,
    error: errorMessage,
    clearError,
  }
}
