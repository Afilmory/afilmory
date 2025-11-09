import type { FC } from 'react'
import { Outlet } from 'react-router'

import { usePageRedirect } from '~/hooks/usePageRedirect'

import { RootProviders } from './providers/root-providers'

export const App: FC = () => {
  return (
    <RootProviders>
      <AppLayer />
    </RootProviders>
  )
}

function AppLayer() {
  usePageRedirect()

  const appIsReady = true
  return appIsReady ? <Outlet /> : <AppSkeleton />
}

function AppSkeleton() {
  return null
}
export default App
