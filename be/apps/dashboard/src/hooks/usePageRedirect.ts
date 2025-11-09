import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FetchError } from 'ofetch'
import { useCallback, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { useSetAuthUser } from '~/atoms/auth'
import type { SessionResponse } from '~/modules/auth/api/session'
import { AUTH_SESSION_QUERY_KEY, fetchSession } from '~/modules/auth/api/session'
import { signOutBySource } from '~/modules/auth/auth-client'
import { getOnboardingStatus } from '~/modules/onboarding/api'

const ONBOARDING_STATUS_QUERY_KEY = ['onboarding', 'status'] as const

const DEFAULT_LOGIN_PATH = '/login'
const DEFAULT_ONBOARDING_PATH = '/onboarding'
const DEFAULT_REGISTER_PATH = '/register'
const TENANT_MISSING_PATH = '/tenant-missing'
const DEFAULT_AUTHENTICATED_PATH = '/'
const SUPERADMIN_ROOT_PATH = '/superadmin'
const SUPERADMIN_DEFAULT_PATH = '/superadmin/settings'

const AUTH_FAILURE_STATUSES = new Set([401, 403, 419])
const AUTH_TENANT_NOT_FOUND_ERROR_CODE = 12
const TENANT_NOT_FOUND_ERROR_CODE = 20
const TENANT_MISSING_ERROR_CODES = new Set([AUTH_TENANT_NOT_FOUND_ERROR_CODE, TENANT_NOT_FOUND_ERROR_CODE])

const PUBLIC_PATHS = new Set([DEFAULT_LOGIN_PATH, DEFAULT_ONBOARDING_PATH, DEFAULT_REGISTER_PATH, TENANT_MISSING_PATH])

type BizErrorPayload = { code?: number | string }
type FetchErrorWithPayload = FetchError<BizErrorPayload> & {
  response?: {
    _data?: BizErrorPayload
  }
}

function extractBizErrorCode(error: unknown): number | null {
  if (!(error instanceof FetchError)) {
    return null
  }

  const { data, response } = error as FetchErrorWithPayload
  const payload = data ?? response?._data

  const codeValue = payload?.code
  if (typeof codeValue === 'number') {
    return Number.isFinite(codeValue) ? codeValue : null
  }

  if (typeof codeValue === 'string') {
    const parsed = Number.parseInt(codeValue, 10)
    return Number.isNaN(parsed) ? null : parsed
  }

  return null
}

export function usePageRedirect() {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setAuthUser = useSetAuthUser()

  const sessionQuery = useQuery<SessionResponse | null>({
    queryKey: AUTH_SESSION_QUERY_KEY,
    queryFn: async () => {
      try {
        return await fetchSession()
      } catch (error) {
        if (error instanceof FetchError) {
          const status = error.statusCode ?? error.response?.status ?? null
          if (status && AUTH_FAILURE_STATUSES.has(status)) {
            return null
          }
        }
        throw error
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const onboardingQuery = useQuery({
    queryKey: ONBOARDING_STATUS_QUERY_KEY,
    queryFn: getOnboardingStatus,
    staleTime: Infinity,
  })

  const logout = useCallback(async () => {
    try {
      await signOutBySource()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, null)
      queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY })
      setAuthUser(null)
      navigate(DEFAULT_LOGIN_PATH, { replace: true })
    }
  }, [navigate, queryClient, setAuthUser])

  // Sync auth user to atom
  useEffect(() => {
    setAuthUser(sessionQuery.data?.user ?? null)
  }, [sessionQuery.data, setAuthUser])

  useEffect(() => {
    return () => {
      queryClient.cancelQueries({ queryKey: AUTH_SESSION_QUERY_KEY })
    }
  }, [queryClient])

  useEffect(() => {
    const matchedTenantNotFound = [sessionQuery.error, onboardingQuery.error].some((error) => {
      const code = extractBizErrorCode(error)
      return code !== null && TENANT_MISSING_ERROR_CODES.has(code)
    })

    if (!matchedTenantNotFound) {
      return
    }

    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, null)
    setAuthUser(null)

    if (location.pathname !== TENANT_MISSING_PATH) {
      navigate(TENANT_MISSING_PATH, { replace: true })
    }
  }, [location.pathname, navigate, onboardingQuery.error, queryClient, sessionQuery.error, setAuthUser])

  useEffect(() => {
    if (sessionQuery.isPending || onboardingQuery.isPending) {
      return
    }

    if (sessionQuery.isError || onboardingQuery.isError) {
      return
    }

    const { pathname } = location
    const session = sessionQuery.data
    const onboardingInitialized = onboardingQuery.data?.initialized ?? false
    const isSuperAdmin = session?.user.role === 'superadmin'
    const isOnSuperAdminPage = pathname.startsWith(SUPERADMIN_ROOT_PATH)

    // If onboarding is not complete, redirect to onboarding
    if (!onboardingInitialized) {
      if (pathname !== DEFAULT_ONBOARDING_PATH) {
        navigate(DEFAULT_ONBOARDING_PATH, { replace: true })
      }
      return
    }

    if (session && isSuperAdmin) {
      if (!isOnSuperAdminPage || pathname === DEFAULT_LOGIN_PATH) {
        navigate(SUPERADMIN_DEFAULT_PATH, { replace: true })
      }
      return
    }

    if (session && !isSuperAdmin && isOnSuperAdminPage) {
      navigate(DEFAULT_AUTHENTICATED_PATH, { replace: true })
      return
    }

    // If not authenticated and trying to access protected route
    if (!session && !PUBLIC_PATHS.has(pathname)) {
      navigate(DEFAULT_LOGIN_PATH, { replace: true })
      return
    }

    // If authenticated but on login page, redirect to dashboard
    if (session && pathname === DEFAULT_LOGIN_PATH) {
      navigate(DEFAULT_AUTHENTICATED_PATH, { replace: true })
    }
  }, [
    location,
    location.pathname,
    navigate,
    onboardingQuery.data,
    onboardingQuery.isError,
    onboardingQuery.isPending,
    sessionQuery.data,
    sessionQuery.isError,
    sessionQuery.isPending,
  ])

  return {
    sessionQuery,
    onboardingQuery,
    logout,
    isAuthenticated: !!sessionQuery.data,
    user: sessionQuery.data?.user,
  }
}
