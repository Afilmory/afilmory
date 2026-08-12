import type { FC } from 'react'
import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'

import { useAccessDeniedValue } from '~/atoms/access-denied'
import { ROUTE_PATHS } from '~/constants/routes'
import { usePageRedirect } from '~/hooks/usePageRedirect'
import { useRequireStorageProvider } from '~/hooks/useRequireStorageProvider'
import { useRoutePermission } from '~/hooks/useRoutePermission'

import { RootProviders } from './providers/root-providers'

export const App: FC = () => {
  return (
    <RootProviders>
      <AppLayer />
    </RootProviders>
  )
}

function AppLayer() {
  const location = useLocation()
  if (location.pathname === '/storage-handoff') {
    return <Outlet />
  }

  return <AuthenticatedAppLayer />
}

function AuthenticatedAppLayer() {
  const pageRedirect = usePageRedirect()
  useRoutePermission({
    session: pageRedirect.sessionQuery.data ?? null,
    isLoading: pageRedirect.sessionQuery.isPending,
  })
  useRequireStorageProvider({
    session: pageRedirect.sessionQuery.data ?? null,
    isLoading: pageRedirect.sessionQuery.isPending,
  })
  useAccessDeniedRedirect()

  const appIsReady = true
  return appIsReady ? <Outlet /> : <AppSkeleton />
}

function useAccessDeniedRedirect() {
  const accessDenied = useAccessDeniedValue()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!accessDenied?.active) {
      return
    }
    if (location.pathname === ROUTE_PATHS.NO_ACCESS) {
      return
    }

    navigate(ROUTE_PATHS.NO_ACCESS, {
      replace: true,
      state: {
        from: accessDenied.path ?? location.pathname,
        reason: accessDenied.reason ?? null,
        status: accessDenied.status ?? 403,
      },
    })
  }, [accessDenied, location.pathname, navigate])
}

function AppSkeleton() {
  return null
}
export default App
