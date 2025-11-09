import { Button, ScrollArea } from '@afilmory/ui'
import { Spring } from '@afilmory/utils'
import { m } from 'motion/react'
import { useState } from 'react'
import { Navigate, NavLink, Outlet } from 'react-router'

import { useAuthUserValue, useIsSuperAdmin } from '~/atoms/auth'
import { usePageRedirect } from '~/hooks/usePageRedirect'

const navigationTabs = [{ label: 'System Settings', path: '/superadmin/settings' }] as const

export function Component() {
  const { logout } = usePageRedirect()
  const user = useAuthUserValue()
  const isSuperAdmin = useIsSuperAdmin()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  if (user && !isSuperAdmin) {
    return <Navigate to="/" replace />
  }

  const handleLogout = async () => {
    if (isLoggingOut) {
      return
    }

    setIsLoggingOut(true)
    try {
      await logout()
    } catch (error) {
      console.error('Logout failed:', error)
      setIsLoggingOut(false)
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <nav className="border-border/50 bg-background-tertiary shrink-0 border-b px-6 py-3">
        <div className="flex items-center gap-6">
          <div className="text-text text-base font-semibold">Afilmory · System Settings</div>

          <div className="flex flex-1 items-center gap-1">
            {navigationTabs.map((tab) => (
              <NavLink key={tab.path} to={tab.path} end={tab.path === '/superadmin/settings'}>
                {({ isActive }) => (
                  <m.div
                    className="relative overflow-hidden rounded-md px-3 py-1.5"
                    initial={false}
                    animate={{
                      backgroundColor: isActive
                        ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)'
                        : 'transparent',
                    }}
                    whileHover={{
                      backgroundColor: isActive
                        ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)'
                        : 'color-mix(in srgb, var(--color-fill) 60%, transparent)',
                    }}
                    transition={Spring.presets.snappy}
                  >
                    <span
                      className="relative z-10 text-[13px] font-medium transition-colors"
                      style={{
                        color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                      }}
                    >
                      {tab.label}
                    </span>
                  </m.div>
                )}
              </NavLink>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-text text-[13px] font-medium">{user.name || user.email}</div>
                  <div className="text-text-tertiary text-[11px] capitalize">{user.role}</div>
                </div>
                {user.image && <img src={user.image} alt={user.name || user.email} className="size-7 rounded-full" />}
              </div>
            )}

            <Button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              isLoading={isLoggingOut}
              loadingText="Logging out..."
              variant="primary"
              size="sm"
            >
              Logout
            </Button>
          </div>
        </div>
      </nav>

      <main className="bg-background flex-1 overflow-hidden">
        <ScrollArea rootClassName="h-full" viewportClassName="h-full">
          <div className="mx-auto max-w-5xl px-6 py-6">
            <Outlet />
          </div>
        </ScrollArea>
      </main>
    </div>
  )
}
