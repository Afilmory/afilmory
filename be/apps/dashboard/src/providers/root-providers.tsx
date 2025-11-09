import { ModalContainer } from '@afilmory/ui'
import { Toaster } from '@afilmory/ui/sonner.jsx'
import { Spring } from '@afilmory/utils'
import { QueryClientProvider } from '@tanstack/react-query'
import { Provider } from 'jotai'
import { LazyMotion, MotionConfig } from 'motion/react'
import type { FC, PropsWithChildren } from 'react'

import { jotaiStore } from '~/lib/jotai'
import { queryClient } from '~/lib/query-client'

import { ContextMenuProvider } from './context-menu-provider'
import { EventProvider } from './event-provider'
import { StableRouterProvider } from './stable-router-provider'

const loadFeatures = () => import('../framer-lazy-feature').then((res) => res.default)
export const RootProviders: FC<PropsWithChildren> = ({ children }) => (
  <LazyMotion features={loadFeatures} strict>
    <MotionConfig transition={Spring.presets.smooth}>
      <QueryClientProvider client={queryClient}>
        <Provider store={jotaiStore}>
          <EventProvider />
          <StableRouterProvider />

          <ContextMenuProvider />
          <ModalContainer />
          {children}
        </Provider>
      </QueryClientProvider>
    </MotionConfig>
    <Toaster />
  </LazyMotion>
)
