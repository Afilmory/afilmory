import { clsxm } from '@afilmory/utils'
import { NavLink } from 'react-router'

import { useAuthUserValue } from '~/atoms/auth'

import { UserMenu } from './UserMenu'

const navigationTabs = [
  { label: 'Dashboard', path: '/' },
  { label: 'Photos', path: '/photos' },
  { label: 'Settings', path: '/settings' },
  { label: 'Analytics', path: '/analytics' },
] as const

export function Header() {
  const user = useAuthUserValue()

  return (
    <nav className="bg-background-tertiary relative shrink-0 px-6 py-3">
      {/* Bottom border with gradient */}
      <div className="via-text/20 absolute right-0 bottom-0 left-0 h-[0.5px] bg-linear-to-r from-transparent to-transparent" />

      <div className="flex items-center gap-6">
        {/* Logo/Brand */}
        <div className="text-text text-base font-semibold">Afilmory</div>

        {/* Navigation Tabs - subtle rounded corners */}
        <div className="flex flex-1 items-center gap-1">
          {navigationTabs.map((tab) => (
            <NavLink key={tab.path} to={tab.path} end={tab.path === '/'}>
              {({ isActive }) => (
                <div
                  className={clsxm(
                    'relative overflow-hidden rounded-lg px-3 py-1.5',
                    isActive ? 'bg-accent/10' : 'bg-transparent',
                  )}
                >
                  <span
                    className="relative z-10 text-[13px] font-medium transition-colors"
                    style={{
                      color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {tab.label}
                  </span>
                </div>
              )}
            </NavLink>
          ))}
        </div>

        {/* Right side - User Menu */}
        {user && <UserMenu user={user} />}
      </div>
    </nav>
  )
}
