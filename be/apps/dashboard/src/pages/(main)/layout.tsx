import { ScrollArea } from '@afilmory/ui'
import { Outlet } from 'react-router'

import { Header } from '~/components/common/Header'

export function Component() {
  return (
    <div className="flex h-screen flex-col">
      {/* Top Navigation */}
      <Header />

      {/* Main Content Area */}
      <main className="bg-background flex-1 overflow-hidden">
        <ScrollArea rootClassName="h-full" viewportClassName="h-full">
          <div className="mx-auto max-w-7xl px-6 py-6">
            <Outlet />
          </div>
        </ScrollArea>
      </main>
    </div>
  )
}
