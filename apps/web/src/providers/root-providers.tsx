import { ModalContainer, Toaster } from '@afilmory/ui'
import { Spring } from '@afilmory/utils'
import { Provider } from 'jotai'
import { domMax, LazyMotion, MotionConfig } from 'motion/react'
import type { FC, PropsWithChildren } from 'react'

import { withCloud } from '~/lib/hoc/withCloud'
import { jotaiStore } from '~/lib/jotai'

import { ContextMenuProvider } from './context-menu-provider'
import { EventProvider } from './event-provider'
import { I18nProvider } from './i18n-provider'
import { QueryProvider } from './query-provider'
import { SessionProvider } from './session-provider'
import { StableRouterProvider } from './stable-router-provider'

const CloudSessionProvider = withCloud(SessionProvider)

export const RootProviders: FC<PropsWithChildren> = ({ children }) => {
  return (
    <LazyMotion features={domMax} strict key="framer">
      <MotionConfig transition={Spring.presets.smooth} reducedMotion="user">
        <Provider store={jotaiStore}>
          <QueryProvider>
            <CloudSessionProvider />
            <EventProvider />
            <StableRouterProvider />

            <ContextMenuProvider />
            <I18nProvider>{children}</I18nProvider>
            <ModalContainer />
          </QueryProvider>
        </Provider>
      </MotionConfig>
      <Toaster />
    </LazyMotion>
  )
}
